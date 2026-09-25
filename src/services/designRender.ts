import { createHash } from 'crypto';
import { Types } from 'mongoose';
import sharp from 'sharp';

import { generateWithReferences, resolveWebhookUrl } from '@config/magnific';
import { saveGeneratedImage } from '@config/imageStore';
import { logger } from '@config/logger';
import { blendCompositePrompt } from '@config/prompts';
import { BaseGarmentModel } from '@models/basegarment';
import { DesignRenderModel, IDesignRender } from '@models/designrender';
import { EmbroideryAssetModel } from '@models/embroideryasset';
import { GarmentTypeModel } from '@models/garmenttype';
import { ImageJobModel } from '@models/imagejob';
import { OptionModel } from '@models/option';
import { OptionGroupModel } from '@models/optiongroup';
import { ApiError } from '@utils/apiError';
import { saveMask } from './blendFinalize';
import { compositeEmbroidery, fetchAsset } from './embroideryCompositor';
import { dilateMask, garmentMask, recolour, toPortrait } from './garmentRender';
import { ACCEPTABLE_CONFIDENCE, Landmarks, detectLandmarks } from './garmentLandmarks';
import { refreshJob } from './motifTransfer';

/**
 * Customer design images, built in this order:
 *
 *   base garment  ← chosen by NECK (+ sleeve)   shape: photographed, never generated
 *   recolour      ← COLOUR hex                  code, exact
 *   composite     ← EMBROIDERY assets           code, exact placement
 *   blend         ← one AI call                 realism only
 *   restore       ← composite outside the embroidery, so the AI cannot alter
 *                   colour, neckline or silhouette
 *
 * The preview (everything but the blend) is returned immediately. The blend
 * finishes in the background and replaces it. Results are cached per
 * combination, so each one is generated once, ever.
 */

/** Bump when the pipeline changes, so old cached renders are rebuilt. */
const RENDER_VERSION = 'v1';

/** Only these groups change the picture; size, fabric etc. do not (yet). */
const VISUAL_GROUPS = ['neck', 'sleeve', 'color', 'embroidery'] as const;

/* ------------------------------------------------------------------ */
/* Base garment library (admin)                                        */
/* ------------------------------------------------------------------ */

export interface CreateBaseInput {
  garmentTypeId: string;
  neckOptionId: string;
  sleeveOptionId?: string;
  /** Base64, no data: prefix. White or light-grey garment, plain backdrop. */
  image: string;
  /** Marked on the uploaded image. Omit to auto-detect. */
  landmarks?: Landmarks;
  /**
   * Optional garment mask, same size as `image`: white = fabric to dye,
   * black = everything else. Supply one when the mannequin shows through the
   * neck opening (it would otherwise be dyed with the fabric). A remove.bg /
   * Photoshop "select subject" export with the neck area erased works.
   */
  mask?: string;
}

async function groupCodeOf(optionId: string) {
  const option = await OptionModel.findById(optionId).exec();
  if (!option) return null;
  const group = await OptionGroupModel.findById(option.groupId).exec();
  return group?.code ?? null;
}

export async function createBaseGarment(input: CreateBaseInput) {
  const type = await GarmentTypeModel.findById(input.garmentTypeId).exec();
  if (!type) throw ApiError.notFound('Garment type not found');

  if ((await groupCodeOf(input.neckOptionId)) !== 'neck') {
    throw ApiError.badRequest('neckOptionId must be a Neck Type option');
  }
  if (input.sleeveOptionId && (await groupCodeOf(input.sleeveOptionId)) !== 'sleeve') {
    throw ApiError.badRequest('sleeveOptionId must be a Sleeve Type option');
  }

  const portrait = await toPortrait(Buffer.from(input.image, 'base64'));

  let landmarks: Landmarks;
  if (input.landmarks) {
    landmarks = portrait.mapLandmarks(input.landmarks);
  } else {
    landmarks = await detectLandmarks(portrait.buffer);
    if (landmarks.confidence < ACCEPTABLE_CONFIDENCE) {
      throw ApiError.badRequest(
        'Could not find the garment outline automatically — mark the landmarks for this base',
      );
    }
  }

  const meta = await sharp(portrait.buffer).metadata();

  let mask: Buffer;
  if (input.mask) {
    /* Padded exactly like the image (black fill) so the two stay aligned. */
    const paddedMask = await toPortrait(
      await sharp(Buffer.from(input.mask, 'base64')).flatten({ background: '#000000' }).png().toBuffer(),
      { r: 0, g: 0, b: 0 },
    );
    mask = await sharp(paddedMask.buffer)
      .resize(meta.width, meta.height, { fit: 'fill' })
      .extractChannel(0)
      .raw()
      .toBuffer();
  } else {
    mask = await garmentMask(portrait.buffer, landmarks);
  }

  const imageUrl = await saveGeneratedImage(portrait.buffer.toString('base64'));
  const maskUrl = await saveMask(mask, meta.width ?? 0, meta.height ?? 0);

  /* One base per garment + neck + sleeve: replace rather than duplicate. */
  return BaseGarmentModel.findOneAndUpdate(
    {
      garmentTypeId: input.garmentTypeId,
      neckOptionId: input.neckOptionId,
      sleeveOptionId: input.sleeveOptionId ?? null,
    },
    { $set: { imageUrl, maskUrl, landmarks, isActive: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
}

export function listBaseGarments(garmentTypeId?: string) {
  return BaseGarmentModel.find(garmentTypeId ? { garmentTypeId } : {})
    .sort({ createdAt: -1 })
    .exec();
}

export async function deleteBaseGarment(id: string) {
  const base = await BaseGarmentModel.findByIdAndDelete(id).exec();
  if (!base) throw ApiError.notFound('Base garment not found');
  return base;
}

/** Links an Embroidery option to the approved asset collection it draws. */
export async function setEmbroideryCollection(optionId: string, collectionId: string | null) {
  if ((await groupCodeOf(optionId)) !== 'embroidery') {
    throw ApiError.badRequest('That is not an Embroidery option');
  }

  if (collectionId) {
    const approved = await EmbroideryAssetModel.countDocuments({ collectionId, isApproved: true });
    if (approved === 0) {
      throw ApiError.badRequest('That collection has no approved pieces yet — approve some first');
    }
  }

  const option = await OptionModel.findByIdAndUpdate(
    optionId,
    collectionId ? { $set: { assetCollectionId: collectionId } } : { $unset: { assetCollectionId: 1 } },
    { new: true },
  ).exec();

  if (!option) throw ApiError.notFound('Option not found');
  return option;
}

/* ------------------------------------------------------------------ */
/* Customer render                                                     */
/* ------------------------------------------------------------------ */

export interface RenderInput {
  garmentTypeId: string;
  selections: { groupId: string; optionId: string }[];
}

export type RenderResponse =
  | {
      status: 'unavailable';
      reason: string;
    }
  | {
      status: IDesignRender['status'];
      key: string;
      previewUrl: string;
      finalUrl: string | null;
    };

const toResponse = (render: IDesignRender): RenderResponse => ({
  status: render.status,
  key: render.key,
  previewUrl: render.previewUrl,
  finalUrl: render.finalUrl ?? null,
});

/** Picks the visual selections and verifies each option is in its group. */
async function resolveVisual(selections: RenderInput['selections']) {
  const optionIds = selections
    .map((s) => s.optionId)
    .filter((id) => Types.ObjectId.isValid(id));
  const options = await OptionModel.find({ _id: { $in: optionIds }, isDeleted: false }).exec();
  const groups = await OptionGroupModel.find({
    _id: { $in: options.map((o) => o.groupId) },
  }).exec();

  const byCode = new Map<string, (typeof options)[number]>();

  for (const selection of selections) {
    const option = options.find((o) => o._id.toString() === selection.optionId);
    if (!option || option.groupId.toString() !== selection.groupId) continue;
    const group = groups.find((g) => g._id.toString() === selection.groupId);
    if (group && (VISUAL_GROUPS as readonly string[]).includes(group.code)) {
      byCode.set(group.code, option);
    }
  }

  return byCode;
}

async function findBase(garmentTypeId: string, neckId: string, sleeveId?: string) {
  const base = { garmentTypeId, neckOptionId: neckId, isActive: true };

  return (
    (sleeveId
      ? await BaseGarmentModel.findOne({ ...base, sleeveOptionId: sleeveId }).exec()
      : null) ??
    (await BaseGarmentModel.findOne({ ...base, sleeveOptionId: null }).exec()) ??
    (await BaseGarmentModel.findOne(base).exec())
  );
}

export async function renderDesign(input: RenderInput): Promise<RenderResponse> {
  const visual = await resolveVisual(input.selections);
  const neck = visual.get('neck');
  const sleeve = visual.get('sleeve');
  const colour = visual.get('color');
  const embroidery = visual.get('embroidery');

  if (!neck) return { status: 'unavailable', reason: 'Choose a neck type to see your design' };

  const key = createHash('sha1')
    .update(
      JSON.stringify([
        RENDER_VERSION,
        input.garmentTypeId,
        neck.id,
        sleeve?.id ?? null,
        colour?.id ?? null,
        embroidery?.id ?? null,
      ]),
    )
    .digest('hex');

  const cached = await DesignRenderModel.findOne({ key }).exec();
  if (cached) return toResponse(cached);

  const base = await findBase(input.garmentTypeId, neck.id, sleeve?.id);
  if (!base) {
    return { status: 'unavailable', reason: `No base image for ${neck.label} yet` };
  }

  /* 1. Colour — exact, by code. */
  let image = await fetchAsset(base.imageUrl);
  if (colour?.hex && /^#[0-9a-fA-F]{6}$/.test(colour.hex)) {
    const meta = await sharp(image).metadata();
    const maskPng = await fetchAsset(base.maskUrl);
    const mask = await sharp(maskPng)
      .extractChannel(0)
      .resize(meta.width, meta.height, { fit: 'fill' })
      .raw()
      .toBuffer();
    image = await recolour(image, mask, colour.hex);
  }

  /* 2. Embroidery — exact placement, by code. */
  const assets = embroidery?.assetCollectionId
    ? await EmbroideryAssetModel.find({
        collectionId: embroidery.assetCollectionId,
        isApproved: true,
      }).exec()
    : [];

  const selections = [neck, sleeve, colour, embroidery]
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
    .map((o) => ({ groupId: o.groupId, optionId: o._id }));

  /* No embroidery to draw: the recoloured base IS the final image. No AI. */
  if (assets.length === 0) {
    const url = await saveGeneratedImage(image.toString('base64'));
    const ready = await saveRender({
      key,
      garmentTypeId: new Types.ObjectId(input.garmentTypeId),
      selections,
      status: 'ready',
      previewUrl: url,
      finalUrl: url,
    });
    return toResponse(ready);
  }

  const composite = await compositeEmbroidery(
    image,
    assets,
    parseInt(key.slice(0, 8), 16) % 100000,
    base.landmarks,
  );

  const previewUrl = await saveGeneratedImage(composite.buffer.toString('base64'));

  /* Room around each motif for its stitch shadow: ~1.2% of the width. */
  const loose = await dilateMask(
    composite.embroideryMask,
    composite.width,
    composite.height,
    Math.max(4, Math.round(composite.width * 0.012)),
  );

  const render = await saveRender({
    key,
    garmentTypeId: new Types.ObjectId(input.garmentTypeId),
    selections,
    status: 'blending',
    previewUrl,
  });

  /* Another request built the same combination first — use theirs. */
  if (render.previewUrl !== previewUrl) return toResponse(render);

  try {
    const [maskUrl, tightMaskUrl] = await Promise.all([
      saveMask(loose, composite.width, composite.height),
      saveMask(composite.embroideryMask, composite.width, composite.height),
    ]);

    const prompt = blendCompositePrompt();
    const task = await generateWithReferences({
      images: [composite.buffer.toString('base64')],
      referenceLabels: [
        'A garment with embroidery already correctly positioned. Blend it in; do not move anything.',
      ],
      prompt,
      aspectRatio: 'traditional_3_4',
      outputFormat: 'png',
      webhookUrl: resolveWebhookUrl(),
    });

    const job = await ImageJobModel.create({
      stage: 'render',
      runId: key,
      taskId: task.task_id,
      status: 'pending',
      selections,
      prompt,
      compositeUrl: previewUrl,
      maskUrl,
      tightMaskUrl,
      renderKey: key,
    });

    render.jobId = job._id;
    await render.save();
  } catch (error) {
    /* The customer still gets an exact image; only the polish is missing. */
    logger.error({ err: error, key }, 'Could not queue design blend');
    render.status = 'ready';
    render.finalUrl = previewUrl;
    render.error = 'Blend could not be queued';
    await render.save();
  }

  return toResponse(render);
}

/** Creates the cache row, or returns the one a concurrent request created. */
async function saveRender(data: Partial<IDesignRender> & { key: string }) {
  try {
    return await DesignRenderModel.create(data);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const existing = await DesignRenderModel.findOne({ key: data.key }).exec();
      if (existing) return existing;
    }
    throw error;
  }
}

/**
 * Polling endpoint for the stepper. Without a webhook, this is also what
 * moves a pending blend forward.
 */
export async function getRender(key: string): Promise<RenderResponse> {
  let render = await DesignRenderModel.findOne({ key }).exec();
  if (!render) throw ApiError.notFound('Render not found');

  if (render.status === 'blending' && render.jobId) {
    await refreshJob(render.jobId.toString()).catch(() => undefined);
    render = (await DesignRenderModel.findOne({ key }).exec()) ?? render;
  }

  return toResponse(render);
}

/** Admin: forget cached renders, e.g. after re-shooting a base or re-approving assets. */
export async function clearRenders(garmentTypeId?: string) {
  const result = await DesignRenderModel.deleteMany(
    garmentTypeId ? { garmentTypeId } : {},
  ).exec();
  return { deleted: result.deletedCount };
}
