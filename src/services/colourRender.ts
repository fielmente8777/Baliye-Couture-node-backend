import { createHash, randomUUID } from 'crypto';
import { Types } from 'mongoose';

import { env } from '@config/env';
import { generateWithReferences, getTask } from '@config/imageAI';
import type { ImageUsage } from '@config/imageUsage';
import { logger } from '@config/logger';
import { recolourGarmentPrompt, restyleGarmentPrompt, type RestyleChange } from '@config/prompts';
import { ColourRenderModel, IColourRender } from '@models/colourrender';
import { OptionModel } from '@models/option';
import { OptionGroupModel } from '@models/optiongroup';
import { ApiError } from '@utils/apiError';
import { refundTokens, spendTokens, tokensEnabled } from './tokens';
import { collectionLooks } from './embroideryAssets';

/**
 * The design preview showing the customer's choices.
 *
 * The builder shows a real photograph of the suit. When the customer picks a
 * colour, the image model re-dyes the fabric of THAT photo and leaves the
 * embroidery, cut and pose alone. Other choices (fabric, embroidery, sleeve,
 * neck…) are applied the same way, with each option's picture as a reference.
 * One generation per photo + set of choices, ever.
 *
 * With design tokens on, only the request that starts a NEW generation pays;
 * a failed generation is refunded.
 */

/** Bump when the prompt changes, so old cached images are rebuilt. */
const RECOLOUR_VERSION = 'v1';

/** A failed generation may be retried after this long (bad luck, not a bad photo). */
const RETRY_AFTER_MS = 2 * 60 * 1000;

/** A generation still "generating" after this long was lost (server restart). */
const STALE_AFTER_MS = 10 * 60 * 1000;

/** Same idea as RECOLOUR_VERSION, for previews with more than a colour. */
const RESTYLE_VERSION = 'r1';

/** Option pictures sent along as references, at most. */
const MAX_REFERENCES = 8;

export interface RecolourInput {
  imageUrl: string;
  /** Colour only (older clients). */
  colourOptionId?: string;
  /** Every chosen option that should show in the picture, with its picture. */
  options?: { optionId: string; imageUrl?: string }[];
}

interface Change extends Omit<RestyleChange, 'imageIndex'> {
  optionId: Types.ObjectId;
  /** The option's own picture, when it is one of ours. */
  reference?: string;
}

/** What one generation needs, worked out from the request. */
interface Plan {
  key: string;
  changes: Change[];
  colour?: Change;
}

export interface RecolourResponse {
  key: string;
  status: IColourRender['status'];
  url: string | null;
  error: string | null;
}

const toResponse = (render: IColourRender): RecolourResponse => ({
  key: render.key,
  status: render.status,
  url: render.url ?? null,
  error: render.error ?? null,
});

/**
 * Only our own photos are re-dyed: Shopify's CDN (catalogue and design images)
 * and this server's uploads. Anything else would let a caller spend image
 * credits on arbitrary pictures and make the server fetch arbitrary URLs.
 */
function isOwnImage(imageUrl: string) {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return false;
  }

  const own = new URL(env.publicUrl);
  const isShopify = url.protocol === 'https:' && url.hostname === 'cdn.shopify.com';
  const isUpload = url.origin === own.origin && url.pathname.startsWith('/uploads/');
  return isShopify || isUpload;
}

function assertOwnImage(imageUrl: string) {
  if (!isOwnImage(imageUrl)) throw ApiError.badRequest('That image cannot be recoloured');
}

/** Size never shows in a photo; every other group can. */
const isVisualGroup = (group: { code: string; inputType: string }) =>
  group.code !== 'size' && group.inputType !== 'size_select';

async function resolveChanges(input: RecolourInput): Promise<Change[]> {
  const requested = input.options?.length
    ? input.options
    : [{ optionId: input.colourOptionId!, imageUrl: undefined }];

  const changes: Change[] = [];
  const seen = new Set<string>();
  for (const { optionId, imageUrl } of requested) {
    if (seen.has(optionId)) continue;
    seen.add(optionId);
    if (!Types.ObjectId.isValid(optionId)) throw ApiError.badRequest('Invalid option');

    const option = await OptionModel.findOne({ _id: optionId, isDeleted: false }).exec();
    if (!option) throw ApiError.notFound('Option not found');
    const group = await OptionGroupModel.findById(option.groupId).exec();
    if (!group || !isVisualGroup(group)) continue;

    let hex: string | undefined;
    if (group.code === 'color') {
      if (!option.hex || !/^#[0-9a-fA-F]{6}$/.test(option.hex)) {
        throw ApiError.badRequest(`${option.label} has no colour value set`);
      }
      hex = option.hex.toLowerCase();
    }

    /* Embroidery made in AI Studio: the extracted sheet is the reference
       (whatever the browser sent), and every approved piece is described with
       where it goes, so the preview shows that exact embroidery. */
    const look =
      group.code === 'embroidery' && option.assetCollectionId
        ? (await collectionLooks([option.assetCollectionId])).get(option.assetCollectionId)
        : undefined;

    /* A colour is described by its hex; its swatch adds nothing. Pictures
       from anywhere else are dropped, not refused. */
    const reference = look?.cover ?? (!hex && imageUrl && isOwnImage(imageUrl) ? imageUrl : undefined);
    changes.push({
      optionId: option._id,
      code: group.code,
      group: group.label,
      label: option.label,
      description: look
        ? `this exact embroidery, every piece as shown in its reference image: ${look.layout}`
        : option.description,
      hex,
      reference,
    });
  }

  if (!changes.length) throw ApiError.badRequest('None of those options change the picture');
  return changes;
}

async function resolve(input: RecolourInput): Promise<Plan> {
  assertOwnImage(input.imageUrl);
  const changes = await resolveChanges(input);
  const colour = changes.find((c) => c.code === 'color');

  /* Colour alone keeps its original key, so previews made before other
     choices were supported stay cached. */
  const parts =
    changes.length === 1 && colour
      ? [RECOLOUR_VERSION, input.imageUrl, colour.hex]
      : [
          RESTYLE_VERSION,
          input.imageUrl,
          changes.map((c) => [c.optionId.toString(), c.hex ?? '', c.reference ?? '']).sort(),
        ];
  const key = createHash('sha1').update(JSON.stringify(parts)).digest('hex');
  return { key, changes, colour };
}

/** The image model's inputs: the photo first, then each option's picture. */
function generation(sourceUrl: string, plan: Plan) {
  if (plan.changes.length === 1 && plan.colour) {
    return {
      images: [sourceUrl],
      referenceLabels: ['The garment photograph to re-dye.'],
      prompt: recolourGarmentPrompt(plan.colour.label, plan.colour.hex!),
    };
  }

  const images = [sourceUrl];
  const referenceLabels = ['The garment photograph to edit.'];
  const changes: RestyleChange[] = plan.changes.map(({ code, group, label, description, hex, reference }) => {
    if (!reference || images.length > MAX_REFERENCES) return { code, group, label, description, hex };
    images.push(reference);
    referenceLabels.push(`${group}: ${label} (reference only).`);
    return { code, group, label, description, hex, imageIndex: images.length };
  });
  return { images, referenceLabels, prompt: restyleGarmentPrompt(changes) };
}

/** Marks the attempt failed and gives back whatever it cost. */
async function fail(render: IColourRender, error: string) {
  render.status = 'failed';
  render.error = error;
  await render.save();

  if (render.chargedUserId && render.chargedTokens && render.chargeRef) {
    await refundTokens(
      render.chargedUserId.toString(),
      render.chargedTokens,
      render.chargeRef,
      'Refund: AI design could not be created',
    ).catch((err) => logger.error({ err, key: render.key }, 'Token refund failed'));
  }
  return render;
}

async function succeed(render: IColourRender, url: string) {
  render.status = 'ready';
  render.url = url;
  render.error = undefined;
  await render.save();
  return render;
}

/** Moves a generating row forward from the in-memory task, if it finished. */
async function refresh(render: IColourRender): Promise<IColourRender> {
  if (render.status !== 'generating' || !render.taskId) return render;

  const task = await getTask(render.taskId);
  if (task.status === 'COMPLETED' && task.generated[0]) return succeed(render, task.generated[0]);
  if (task.status === 'FAILED') return fail(render, task.error ?? 'Could not recolour the image');
  return render;
}

/** Charges for the attempt (when tokens are on), then starts the generation. */
async function start(render: IColourRender, plan: Plan, userId?: string) {
  render.chargedUserId = undefined;
  render.chargedTokens = undefined;
  render.chargeRef = undefined;

  if (await tokensEnabled()) {
    if (!userId) throw ApiError.unauthorized('Sign in to see your design');
    const cost = env.tokens.recolourCost;
    const ref = `recolour:${render.key}:${randomUUID()}`;
    await spendTokens(userId, cost, ref, 'AI dress design');
    render.chargedUserId = new Types.ObjectId(userId);
    render.chargedTokens = cost;
    render.chargeRef = ref;
  }

  try {
    const task = await generateWithReferences({
      ...generation(render.sourceUrl, plan),
      preserveFrame: true,
      quality: env.openai.renderQuality,
      label: 'recolour (customer preview)',
    });
    render.taskId = task.task_id;
    render.status = 'generating';
    render.error = undefined;
    await render.save();
    return render;
  } catch (error) {
    logger.error({ err: error, key: render.key }, 'Could not start garment recolour');
    return fail(render, error instanceof Error ? error.message : 'Could not recolour the image');
  }
}

/**
 * What is already there for this photo + colour, without starting or charging
 * anything. The builder asks this first, so a colour someone already paid for
 * shows up free and the customer is only offered a paid preview when needed.
 */
export async function lookupColourRender(input: RecolourInput): Promise<RecolourResponse | null> {
  const { key } = await resolve(input);
  const existing = await ColourRenderModel.findOne({ key }).exec();
  return existing ? toResponse(await refresh(existing)) : null;
}

export async function recolourPhoto(input: RecolourInput, userId?: string): Promise<RecolourResponse> {
  const plan = await resolve(input);
  const { key, colour } = plan;

  const existing = await ColourRenderModel.findOne({ key }).exec();
  if (existing) {
    const current = await refresh(existing);
    const age = Date.now() - current.updatedAt.getTime();
    const retry =
      (current.status === 'failed' && age > RETRY_AFTER_MS) ||
      (current.status === 'generating' && age > STALE_AFTER_MS);
    if (!retry) return toResponse(current);

    /* Claim the retry atomically, so two customers retrying at once don't
       both pay for the same picture. */
    const claimed = await ColourRenderModel.findOneAndUpdate(
      { _id: current._id, updatedAt: current.updatedAt },
      { $set: { status: 'generating', error: null } },
      { new: true },
    ).exec();
    if (!claimed) return toResponse((await ColourRenderModel.findById(current._id).exec()) ?? current);

    try {
      return toResponse(await start(claimed, plan, userId));
    } catch (error) {
      /* Not charged (no tokens / not signed in): leave it retryable. */
      claimed.status = 'failed';
      claimed.error = current.error ?? 'Not generated';
      await claimed.save();
      throw error;
    }
  }

  let render: IColourRender;
  try {
    render = await ColourRenderModel.create({
      key,
      sourceUrl: input.imageUrl,
      colourOptionId: colour?.optionId,
      hex: colour?.hex,
      optionIds: plan.changes.map((c) => c.optionId),
      status: 'generating',
    });
  } catch (error) {
    /* Another request asked for the same photo + colour first — use theirs. */
    if ((error as { code?: number }).code === 11000) {
      const theirs = await ColourRenderModel.findOne({ key }).exec();
      if (theirs) return toResponse(theirs);
    }
    throw error;
  }

  try {
    return toResponse(await start(render, plan, userId));
  } catch (error) {
    /* Not charged: forget the row so the next request can start cleanly. */
    await ColourRenderModel.deleteOne({ _id: render._id }).exec();
    throw error;
  }
}

/** Polling endpoint while a recolour is generating. */
export async function getColourRender(key: string): Promise<RecolourResponse> {
  const render = await ColourRenderModel.findOne({ key }).exec();
  if (!render) throw ApiError.notFound('Recolour not found');
  return toResponse(await refresh(render));
}

/**
 * Called by the task-settled handler. Returns false when the task is not a
 * recolour, so the handler can carry on looking for an ImageJob.
 */
export async function settleColourRender(task: {
  task_id: string;
  status: string;
  generated: string[];
  error?: string;
  usage?: ImageUsage;
}): Promise<boolean> {
  const render = await ColourRenderModel.findOne({ taskId: task.task_id }).exec();
  if (!render) return false;

  /* Record what it cost even if a polling refresh settled it first — the
     admin's AI credit balance is worked out from these. */
  if (task.usage) {
    await ColourRenderModel.updateOne({ _id: render._id }, { $set: { usage: task.usage, usageAt: new Date() } }).exec();
  }
  if (render.status !== 'generating') return true;

  if (task.status === 'COMPLETED' && task.generated[0]) await succeed(render, task.generated[0]);
  else await fail(render, task.error ?? 'Could not recolour the image');
  return true;
}
