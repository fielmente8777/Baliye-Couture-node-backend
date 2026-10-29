import { randomUUID } from 'crypto';

import { resizedUrl, saveGeneratedImage } from '@config/imageStore';
import {
  EmbroideryAssetModel,
  EmbroiderySide,
  IEmbroideryAsset,
  defaultSide,
  placementFor,
} from '@models/embroideryasset';
import { ImageJobModel } from '@models/imagejob';
import { OptionModel } from '@models/option';
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
     guess fills in for any piece it could not label. */
  const labels = await labelPieces({
    sheet,
    boxes: pieces.map((p) => p.sheetBox),
    references: input.references,
    collectionName: input.collectionName,
  });

  /* Adding to an existing collection keeps its id and name, so the new piece
     joins the others (and any Embroidery option already linked to it). */
  let collectionId = `BK-EMB-${randomUUID().slice(0, 8).toUpperCase()}`;
  if (input.collectionId) {
    const existing = await EmbroideryAssetModel.findOne({ collectionId: input.collectionId }).select('collectionName').lean().exec();
    if (!existing) throw ApiError.notFound('That embroidery collection no longer exists');
    collectionId = input.collectionId;
    input.collectionName = existing.collectionName;
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
  ]).exec();
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
  return asset;
}

/**
 * Finished extractions, newest first, each with the embroidery it was saved
 * as (if any). Lets the studio reopen a paid extraction whose pieces were
 * never saved — e.g. the page was reloaded before they were found.
 */
export async function listExtractions(limit = 12) {
  const jobs = await ImageJobModel.find({ stage: 'extract', status: 'completed', 'resultUrls.0': { $exists: true } })
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

/** Deletes every piece in a collection. Images stay in Shopify Files. */
export async function deleteCollection(collectionId: string) {
  const inUse = await OptionModel.find({ assetCollectionId: collectionId, isDeleted: false }).select('label').lean().exec();
  if (inUse.length) {
    throw ApiError.badRequest(
      `The Embroidery option${inUse.length > 1 ? 's' : ''} ${inUse.map((o) => `"${o.label}"`).join(', ')} still use${inUse.length > 1 ? '' : 's'} this collection — unlink it first`,
    );
  }

  const { deletedCount } = await EmbroideryAssetModel.deleteMany({ collectionId }).exec();
  if (!deletedCount) throw ApiError.notFound('Collection not found');
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
