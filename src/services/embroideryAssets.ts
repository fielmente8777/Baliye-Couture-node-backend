import { randomUUID } from 'crypto';

import { resizedUrl, saveGeneratedImage } from '@config/imageStore';
import {
  EmbroideryAssetModel,
  EmbroiderySide,
  IEmbroideryAsset,
  defaultSide,
  EmbroideryRegion,
  REGION_GUIDE,
  placementFor,
} from '@models/embroideryasset';
import { EmbroideryCollectionModel } from '@models/embroiderycollection';
import { EmbroideryLessonModel, LessonLabel } from '@models/embroiderylesson';
import { ImageJobModel } from '@models/imagejob';
import { OptionModel } from '@models/option';
import { OptionGroupModel } from '@models/optiongroup';
import { Types } from 'mongoose';
import { ApiError } from '@utils/apiError';
import { logger } from '@config/logger';
import { splitSheet } from './sheetSplitter';
import { fetchAsset } from './embroideryCompositor';
import { labelPieces } from './embroideryLabeller';
import sharp from 'sharp';

/**
 * Turns a finished extraction — or a clean embroidery sheet the admin already
 * has — into reusable, named embroidery assets.
 *
 * This is the step that makes output consistent: after it, generation never
 * re-extracts. The same approved assets are applied to every colourway, so the
 * variable half of the pipeline runs once per source garment instead of once
 * per image.
 */

const THUMBNAIL_WIDTH = 260;

/** Perceptual distance between two hex colours, 0-1. */
function hexDistance(a: string, b: string) {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);

  return (
    Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / (255 * Math.sqrt(3))
  );
}

/** Beyond this, the extraction recoloured the embroidery and is not faithful. */
const COLOUR_DRIFT_LIMIT = 0.18;

export interface BuildAssetsInput {
  /** A finished extraction to split… */
  jobId?: string;
  /** …or a clean embroidery sheet uploaded as is (base64) — no AI generation. */
  sheetImage?: string;
  /** What the admin calls the work, e.g. "Zari Work". */
  collectionName: string;
  /**
   * Add the pieces to this existing collection instead of starting a new one —
   * how a missing piece is added later, one image at a time.
   */
  collectionId?: string;
  /** Small copies of the garment photos, so the labeller sees where each piece sits. */
  references?: { image: string; label?: string }[];
  /** A new collection's necklines and notes, saved with it. */
  neckOptionIds?: string[];
  notes?: string;
  /**
   * Ink colour of the source garment's embroidery, if known. Supplying it
   * turns on the drift check — the extraction models reliably shift silver and
   * pastel work toward gold, and an asset is reused forever, so a recoloured
   * one poisons every future generation.
   */
  sourceInkHex?: string;
}

export interface BuildAssetsResult {
  collectionId: string;
  assets: IEmbroideryAsset[];
  /** Set when the extracted ink diverges from the source. */
  colourWarning?: string;
}

export async function buildAssetsFromJob(
  input: BuildAssetsInput,
): Promise<BuildAssetsResult> {
  let sheet: Buffer;
  let sourceJobId: IEmbroideryAsset['sourceJobId'];

  if (input.jobId) {
    const job = await ImageJobModel.findById(input.jobId).exec();
    if (!job) throw ApiError.notFound('Extraction job not found');
    if (job.status !== 'completed' || job.resultUrls.length === 0) {
      throw ApiError.badRequest('That extraction has not finished yet');
    }
    sourceJobId = job._id;

    /* Read from our own storage (disk first) — fetching our own public URL
       fails behind ngrok or a private network. */
    try {
      sheet = await fetchAsset(job.resultUrls[0]);
    } catch {
      throw ApiError.badRequest('Could not load the extracted sheet');
    }
  } else if (input.sheetImage) {
    sheet = Buffer.from(input.sheetImage.replace(/^data:[^,]+,/, ''), 'base64');
  } else {
    throw ApiError.badRequest('Send an extraction or an embroidery sheet');
  }

  const pieces = await splitSheet(sheet);
  if (pieces.length === 0) {
    throw ApiError.badRequest('No embroidery could be separated from that sheet');
  }

  /* The vision model's names and positions win; the splitter's shape-based
     guess fills in for any piece it could not label. It is given the admin's
     notes and their past corrections, so it names things their way. */
  const [notes, lessons] = await Promise.all([
    input.collectionId ? collectionNotes(input.collectionId) : Promise.resolve(input.notes?.trim()),
    recentLessons(),
  ]);
  const labels = await labelPieces({
    sheet,
    boxes: pieces.map((p) => p.sheetBox),
    references: input.references,
    collectionName: input.collectionName,
    notes,
    lessons,
  });

  /* Adding to an existing collection keeps its id and name, so the new piece
     joins the others (and any Embroidery option already linked to it). */
  let collectionId = `BK-EMB-${randomUUID().slice(0, 8).toUpperCase()}`;
  if (input.collectionId) {
    const existing = await EmbroideryAssetModel.findOne({ collectionId: input.collectionId }).select('collectionName').lean().exec();
    if (!existing) throw ApiError.notFound('That embroidery collection no longer exists');
    collectionId = input.collectionId;
    input.collectionName = existing.collectionName;
  } else if (input.neckOptionIds?.length || input.notes?.trim()) {
    await saveCollectionDetails(collectionId, { neckOptionIds: input.neckOptionIds, notes: input.notes });
  }
  const assets: IEmbroideryAsset[] = [];

  for (const [index, piece] of pieces.entries()) {
    const label = labels?.[index] ?? null;
    const region = label?.region ?? piece.region;
    const side: EmbroiderySide = label?.side ?? defaultSide(region);

    const assetUrl = await saveGeneratedImage(piece.buffer.toString('base64'));

    /* Shopify resizes from the URL; a disk image needs its own small copy. */
    let thumbnailUrl = resizedUrl(assetUrl, THUMBNAIL_WIDTH);
    if (thumbnailUrl === assetUrl) {
      const thumbnail = await sharp(piece.buffer)
        .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      thumbnailUrl = await saveGeneratedImage(thumbnail.toString('base64'), 'webp');
    }

    assets.push(
      await EmbroideryAssetModel.create({
        collectionId,
        collectionName: input.collectionName,
        name: label?.name || piece.name,
        region,
        side,
        workType: label?.workType,
        description: label?.description,
        aiLabelled: Boolean(label),
        assetUrl,
        thumbnailUrl,
        width: piece.width,
        height: piece.height,
        placement: placementFor(region, side),
        dominantHex: piece.dominantHex,
        /* Nothing is approved automatically — a human confirms the name,
           region and placement before it can reach a customer. */
        isApproved: false,
        sourceJobId,
      }),
    );
  }

  /* Compare the mean ink colour against the source, if we were given one. */
  let colourWarning: string | undefined;

  if (input.sourceInkHex) {
    const mean = pieces
      .map((p) => p.dominantHex)
      .reduce(
        (acc, hex) => {
          const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
          const [r, g, b] = parse(hex);
          return [acc[0] + r, acc[1] + g, acc[2] + b];
        },
        [0, 0, 0],
      )
      .map((v) => Math.round(v / pieces.length));

    const hex = (n: number) => n.toString(16).padStart(2, '0');
    const extracted = `#${hex(mean[0])}${hex(mean[1])}${hex(mean[2])}`;
    const drift = hexDistance(extracted, input.sourceInkHex);

    if (drift > COLOUR_DRIFT_LIMIT) {
      colourWarning =
        `The extracted embroidery reads ${extracted} but the source is ` +
        `${input.sourceInkHex}. Check the colour before approving — these are ` +
        `reused on every future garment.`;
      logger.warn({ extracted, source: input.sourceInkHex, drift }, 'Embroidery colour drift');
    }
  }

  return { collectionId, assets, colourWarning };
}

export function listCollections() {
  return EmbroideryAssetModel.aggregate([
    {
      $group: {
        _id: '$collectionId',
        collectionName: { $first: '$collectionName' },
        assetCount: { $sum: 1 },
        approvedCount: { $sum: { $cond: ['$isApproved', 1, 0] } },
        thumbnailUrl: { $first: '$thumbnailUrl' },
        createdAt: { $first: '$createdAt' },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: 50 },
    /* Its necklines and notes, when the admin set any. */
    {
      $lookup: {
        from: EmbroideryCollectionModel.collection.name,
        localField: '_id',
        foreignField: 'collectionId',
        as: 'details',
      },
    },
    {
      $addFields: {
        neckOptionIds: { $ifNull: [{ $first: '$details.neckOptionIds' }, []] },
        notes: { $ifNull: [{ $first: '$details.notes' }, ''] },
      },
    },
    { $project: { details: 0 } },
  ]).exec();
}

/* ---- Embroidery details: necklines and notes --------------------------- */

export async function collectionNotes(collectionId: string) {
  const details = await EmbroideryCollectionModel.findOne({ collectionId }).select('notes').lean().exec();
  return details?.notes?.trim() || undefined;
}

/** Every Neck Type option id, so neck pairing can be told apart from the admin's other pairings. */
async function neckOptionIdsAll() {
  const neck = await OptionGroupModel.findOne({ code: 'neck' }).select('_id').lean().exec();
  if (!neck) return new Set<string>();
  const options = await OptionModel.find({ groupId: neck._id }).select('_id').lean().exec();
  return new Set(options.map((o) => o._id.toString()));
}

/**
 * Makes an Embroidery option's neck pairing match its AI Studio embroidery:
 * the option is then offered only with those necklines, by the same rule the
 * Design Builder's "Only offer with" uses (server and stepper both read
 * `pairsWith`). Pairings with other steps are left alone. While linked, the
 * studio owns the neck part; `collectionId` null clears it (on unlink).
 */
export async function syncNeckPairing(optionId: string, collectionId: string | null) {
  const option = await OptionModel.findById(optionId).exec();
  if (!option) return;
  const necks = await neckOptionIdsAll();
  const details = collectionId
    ? await EmbroideryCollectionModel.findOne({ collectionId }).select('neckOptionIds').lean().exec()
    : null;
  const keep = (option.pairsWith ?? []).filter((id) => !necks.has(id.toString()));
  const wanted = (details?.neckOptionIds ?? []).filter((id) => necks.has(id.toString()));
  option.pairsWith = [...keep, ...wanted];
  await option.save();
}

/** Saves a collection's necklines and/or notes, and re-pairs the option showing it. */
export async function saveCollectionDetails(
  collectionId: string,
  data: { neckOptionIds?: string[]; notes?: string },
) {
  const set: Record<string, unknown> = {};
  if (data.neckOptionIds) {
    const necks = await neckOptionIdsAll();
    const unknown = data.neckOptionIds.filter((id) => !necks.has(id));
    if (unknown.length) throw ApiError.badRequest('Pick necklines from the Neck Type step only');
    set.neckOptionIds = data.neckOptionIds.map((id) => new Types.ObjectId(id));
  }
  if (data.notes !== undefined) set.notes = data.notes.trim();
  if (!Object.keys(set).length) return;

  await EmbroideryCollectionModel.updateOne({ collectionId }, { $set: set }, { upsert: true }).exec();

  if (data.neckOptionIds) {
    const linked = await OptionModel.find({ assetCollectionId: collectionId }).select('_id').lean().exec();
    for (const o of linked) await syncNeckPairing(o._id.toString(), collectionId);
  }
}

/** Edit from AI Studio: name, necklines and notes, any of them. */
export async function updateCollection(
  collectionId: string,
  data: { collectionName?: string; neckOptionIds?: string[]; notes?: string },
) {
  const exists = await EmbroideryAssetModel.exists({ collectionId });
  if (!exists) throw ApiError.notFound('Collection not found');
  if (data.collectionName) await renameCollection(collectionId, data.collectionName);
  await saveCollectionDetails(collectionId, data);
}

/* ---- Learning from the admin's corrections ----------------------------- */

const LESSON_FIELDS = ['name', 'region', 'side', 'workType', 'description'] as const;

/**
 * Remembers what the admin changed on a piece the AI named. The first AI
 * answer is kept as `before`; `after` follows every later edit. Pieces the
 * admin added by hand (not AI-named) teach nothing.
 */
async function recordLesson(previous: IEmbroideryAsset, updated: IEmbroideryAsset) {
  if (!previous.aiLabelled) return;
  const changed = LESSON_FIELDS.some((f) => (previous[f] ?? '') !== (updated[f] ?? ''));
  if (!changed) return;

  const pick = (a: IEmbroideryAsset): LessonLabel =>
    Object.fromEntries(LESSON_FIELDS.map((f) => [f, a[f] ?? undefined])) as LessonLabel;

  await EmbroideryLessonModel.updateOne(
    { assetId: previous._id },
    {
      $setOnInsert: { before: pick(previous), collectionId: previous.collectionId },
      $set: { after: pick(updated), collectionName: updated.collectionName },
    },
    { upsert: true },
  ).exec();
}

/** The latest corrections, for the labelling AI. Ones that changed nothing in the end are skipped. */
export async function recentLessons(limit = 15) {
  const rows = await EmbroideryLessonModel.find().sort({ updatedAt: -1 }).limit(limit * 2).lean().exec();
  return rows
    .filter((r) => LESSON_FIELDS.some((f) => (r.before?.[f] ?? '') !== (r.after?.[f] ?? '')))
    .slice(0, limit)
    .map((r) => ({ before: r.before, after: r.after }));
}

export function listAssets(collectionId?: string, approvedOnly = false) {
  return EmbroideryAssetModel.find({
    ...(collectionId ? { collectionId } : {}),
    ...(approvedOnly ? { isApproved: true } : {}),
  })
    .sort({ region: 1, name: 1 })
    .exec();
}

export async function updateAsset(id: string, data: Partial<IEmbroideryAsset>) {
  const current = await EmbroideryAssetModel.findById(id).exec();
  if (!current) throw ApiError.notFound('Asset not found');

  /* Changing the position or side resets placement to that position's
     defaults, unless the caller sent an explicit placement — otherwise a
     piece relabelled from 'buti' to 'neckline' keeps buti scaling and lands
     wrong. A side only means something for sided positions. */
  const patch: Record<string, unknown> = { ...data };
  const region = data.region ?? current.region;
  let side = data.side ?? current.side;
  if (data.region && !data.side && defaultSide(region) !== defaultSide(current.region)) {
    side = defaultSide(region);
    patch.side = side;
  }

  if ((data.region || data.side) && !data.placement) {
    patch.placement = placementFor(region, side);
  }

  const asset = await EmbroideryAssetModel.findByIdAndUpdate(id, patch, {
    new: true,
  }).exec();

  if (!asset) throw ApiError.notFound('Asset not found');
  /* A lesson failing to save must never block the admin's edit. */
  await recordLesson(current, asset).catch((err) => logger.warn({ err }, 'Could not record embroidery lesson'));
  return asset;
}

/**
 * Finished extractions, newest first, each with the embroidery it was saved
 * as (if any). Lets the studio reopen a paid extraction whose pieces were
 * never saved — e.g. the page was reloaded before they were found.
 */
/* Older extractions were mostly kept on the server's disk, which a redeploy
   wipes; only recent ones are worth offering. */
const EXTRACTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function listExtractions(limit = 12) {
  const jobs = await ImageJobModel.find({
    stage: 'extract',
    status: 'completed',
    'resultUrls.0': { $exists: true },
    createdAt: { $gte: new Date(Date.now() - EXTRACTION_MAX_AGE_MS) },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('runId resultUrls createdAt')
    .lean()
    .exec();

  const saved = await EmbroideryAssetModel.aggregate<{ _id: unknown; collectionId: string; collectionName: string }>([
    { $match: { sourceJobId: { $in: jobs.map((j) => j._id) } } },
    { $group: { _id: '$sourceJobId', collectionId: { $first: '$collectionId' }, collectionName: { $first: '$collectionName' } } },
  ]).exec();
  const byJob = new Map(saved.map((s) => [String(s._id), s]));

  return jobs.map((job) => ({
    _id: String(job._id),
    runId: job.runId,
    sheetUrl: job.resultUrls[0],
    createdAt: job.createdAt,
    savedAs: byJob.get(String(job._id)) ?? null,
  }));
}

/** Renames a whole collection ("Zari Work"), on every piece in it. */
export async function renameCollection(collectionId: string, collectionName: string) {
  const { matchedCount } = await EmbroideryAssetModel.updateMany({ collectionId }, { collectionName }).exec();
  if (!matchedCount) throw ApiError.notFound('Collection not found');
}

/**
 * Deletes every piece in a collection. Images stay in Shopify Files. An
 * Embroidery option showing it in the designer is unlinked first, so the
 * designer goes back to that option's own picture (or drops it from the
 * list while other embroidery is linked).
 */
export async function deleteCollection(collectionId: string) {
  /* Its neck pairing goes with it, so the option isn't left neck-limited. */
  const linked = await OptionModel.find({ assetCollectionId: collectionId }).select('_id').lean().exec();
  for (const o of linked) await syncNeckPairing(o._id.toString(), null);
  await OptionModel.updateMany({ assetCollectionId: collectionId }, { $unset: { assetCollectionId: 1 } }).exec();

  const { deletedCount } = await EmbroideryAssetModel.deleteMany({ collectionId }).exec();
  if (!deletedCount) throw ApiError.notFound('Collection not found');
  await EmbroideryCollectionModel.deleteOne({ collectionId }).exec();
}

export async function setApproval(id: string, isApproved: boolean) {
  const asset = await EmbroideryAssetModel.findByIdAndUpdate(
    id,
    { isApproved, approvedAt: isApproved ? new Date() : undefined },
    { new: true },
  ).exec();

  if (!asset) throw ApiError.notFound('Asset not found');
  return asset;
}

export async function deleteAsset(id: string) {
  const asset = await EmbroideryAssetModel.findByIdAndDelete(id).exec();
  if (!asset) throw ApiError.notFound('Asset not found');
  return asset;
}

export function getApprovedByIds(ids: string[]) {
  return EmbroideryAssetModel.find({ _id: { $in: ids }, isApproved: true }).exec();
}

/** What the designer shows and sends for an Embroidery option linked to a collection. */
export interface CollectionLook {
  /** The card picture and the AI preview's reference: the extracted sheet, else the first piece. */
  cover: string;
  /** Where each approved piece goes, in words, for the AI preview. */
  layout: string;
  /** The admin's notes on the whole embroidery, if any. */
  notes?: string;
}

const SIDE_WORDS: Record<EmbroiderySide, string> = {
  pair: 'on BOTH sides, mirrored (one copy on the left, one on the right)',
  left: 'on the left side only (image-left)',
  right: 'on the right side only (image-right)',
  center: 'centred',
};

/**
 * The look of each collection, from its approved pieces only. The extracted
 * sheet is the first picture AI Studio makes and shows the whole embroidery
 * laid out like the garment, so it's the cover; a collection made from an
 * uploaded image (no sheet kept) uses its first piece.
 */
export async function collectionLooks(collectionIds: string[]): Promise<Map<string, CollectionLook>> {
  const looks = new Map<string, CollectionLook>();
  const ids = [...new Set(collectionIds.filter(Boolean))];
  if (!ids.length) return looks;

  const pieces = await EmbroideryAssetModel.find({ collectionId: { $in: ids }, isApproved: true })
    .sort({ createdAt: 1 })
    .select('collectionId name region side workType description assetUrl sourceJobId')
    .lean()
    .exec();
  const jobIds = [...new Set(pieces.map((p) => p.sourceJobId?.toString()).filter(Boolean))];
  const jobs = await ImageJobModel.find({ _id: { $in: jobIds } }).select('resultUrls').lean().exec();
  const sheetOf = new Map(jobs.map((j) => [j._id.toString(), j.resultUrls?.[0]]));
  const details = await EmbroideryCollectionModel.find({ collectionId: { $in: ids } }).select('collectionId notes').lean().exec();
  const notesOf = new Map(details.map((d) => [d.collectionId, d.notes?.trim() || undefined]));

  for (const id of ids) {
    const own = pieces.filter((p) => p.collectionId === id);
    if (!own.length) continue;
    const sheet = own.map((p) => p.sourceJobId && sheetOf.get(p.sourceJobId.toString())).find(Boolean);
    /* One numbered line per piece: what it is, what it's made of, and the
       full region wording ("the border that follows the neck opening"), which
       places it far better than the region name alone. */
    const layout = own
      .filter((p) => p.region !== 'back')
      .map((p, i) => {
        const [region, detail] = REGION_GUIDE[p.region as EmbroideryRegion].split(' — ');
        const made = [p.workType, p.description].filter(Boolean).join(', ');
        return `(${i + 1}) ${p.name}${made ? ` [${made}]` : ''}: ${region.toLowerCase()}${detail ? `, ${detail}` : ''}, ${SIDE_WORDS[p.side]}`;
      })
      .join('; ');
    looks.set(id, { cover: sheet || own[0].assetUrl, layout, notes: notesOf.get(id) });
  }
  return looks;
}
