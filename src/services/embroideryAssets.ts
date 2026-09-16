import { randomUUID } from 'crypto';

import { saveGeneratedImage } from '@config/imageStore';
import {
  DEFAULT_PLACEMENT,
  EmbroideryAssetModel,
  EmbroideryRegion,
  IEmbroideryAsset,
} from '@models/embroideryasset';
import { ImageJobModel } from '@models/imagejob';
import { ApiError } from '@utils/apiError';
import { logger } from '@config/logger';
import { splitSheet } from './sheetSplitter';
import sharp from 'sharp';

/**
 * Turns a finished extraction into reusable, named embroidery assets.
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
  jobId: string;
  collectionName: string;
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
  const job = await ImageJobModel.findById(input.jobId).exec();
  if (!job) throw ApiError.notFound('Extraction job not found');
  if (job.status !== 'completed' || job.resultUrls.length === 0) {
    throw ApiError.badRequest('That extraction has not finished yet');
  }

  const sheetUrl = job.resultUrls[0];
  const response = await fetch(sheetUrl);
  if (!response.ok) throw ApiError.badRequest('Could not load the extracted sheet');
  const sheet = Buffer.from(await response.arrayBuffer());

  const pieces = await splitSheet(sheet);
  if (pieces.length === 0) {
    throw ApiError.badRequest('No embroidery could be separated from that sheet');
  }

  const collectionId = `BK-EMB-${randomUUID().slice(0, 8).toUpperCase()}`;
  const assets: IEmbroideryAsset[] = [];

  for (const piece of pieces) {
    const assetUrl = await saveGeneratedImage(piece.buffer.toString('base64'));

    const thumbnail = await sharp(piece.buffer)
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const thumbnailUrl = await saveGeneratedImage(thumbnail.toString('base64'), 'webp');

    assets.push(
      await EmbroideryAssetModel.create({
        collectionId,
        collectionName: input.collectionName,
        name: piece.name,
        region: piece.region,
        assetUrl,
        thumbnailUrl,
        width: piece.width,
        height: piece.height,
        placement: DEFAULT_PLACEMENT[piece.region as EmbroideryRegion],
        dominantHex: piece.dominantHex,
        /* Nothing is approved automatically — a human confirms the name,
           region and placement before it can reach a customer. */
        isApproved: false,
        sourceJobId: job._id,
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
  /* Changing the region resets placement to that region's defaults, unless
     the caller sent an explicit placement — otherwise a piece relabelled from
     'buti' to 'neckline' keeps buti scaling and lands wrong. */
  const patch: Record<string, unknown> = { ...data };

  if (data.region && !data.placement) {
    patch.placement = DEFAULT_PLACEMENT[data.region];
  }

  const asset = await EmbroideryAssetModel.findByIdAndUpdate(id, patch, {
    new: true,
  }).exec();

  if (!asset) throw ApiError.notFound('Asset not found');
  return asset;
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
