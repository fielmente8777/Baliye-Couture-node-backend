import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp';

import { env } from '@config/env';

import { IEmbroideryAsset, IPlacement } from '@models/embroideryasset';
import { ACCEPTABLE_CONFIDENCE, Landmarks, detectLandmarks } from './garmentLandmarks';

/**
 * Places embroidery assets onto a blank garment, deterministically.
 *
 * The output is a rough layout — flat, obviously pasted on, no fold shadows.
 * That is intentional. It is not the final image; it is the control image
 * handed to the generator, whose job then becomes "make this arrangement look
 * real" rather than "decide where the embroidery goes". The model does the
 * former well and the latter badly.
 *
 * Cost is unchanged: this step is free, and there is still one AI call.
 */

interface Placed {
  input: Buffer;
  left: number;
  top: number;
}

/**
 * Loads an asset.
 *
 * Our own /uploads files are read from disk rather than fetched over HTTP —
 * a composite places a dozen assets, and a dozen loopback requests per
 * generation is pointless latency.
 */
export async function fetchAsset(url: string): Promise<Buffer> {
  if (url.startsWith('file://')) return readFile(fileURLToPath(url));

  const uploads = `/uploads/`;
  const index = url.indexOf(uploads);

  if (index !== -1 && !url.startsWith('http')) {
    return readFile(path.resolve(process.cwd(), env.upload.dir, url.slice(index + uploads.length)));
  }

  if (index !== -1) {
    const local = path.resolve(process.cwd(), env.upload.dir, url.slice(index + uploads.length));
    try {
      return await readFile(local);
    } catch {
      /* Fall through to HTTP — the asset may live on another host. */
    }
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load asset ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const anchorPoint = (landmarks: Landmarks, anchor: IPlacement['anchor']) => {
  switch (anchor) {
    case 'neckline_point': return landmarks.neckline;
    case 'shoulder_left': return landmarks.shoulderLeft;
    case 'shoulder_right': return landmarks.shoulderRight;
    case 'cuff_left': return landmarks.cuffLeft;
    case 'cuff_right': return landmarks.cuffRight;
    case 'hem_center': return landmarks.hemCenter;
    default: return landmarks.bodyCenter;
  }
};

const baseWidth = (landmarks: Landmarks, relativeTo: IPlacement['scale']['relativeTo']) => {
  if (relativeTo === 'hemWidth') return landmarks.hemWidth;
  if (relativeTo === 'garmentWidth') return landmarks.garmentWidth;
  return landmarks.shoulderWidth;
};

/** Vertical offset from the anchor for the asset's chosen edge. */
const alignOffset = (align: IPlacement['align'], height: number) => {
  if (align === 'top') return 0;
  if (align === 'bottom') return -height;
  return -height / 2;
};

/**
 * Deterministic pseudo-random, so the same design always scatters butis the
 * same way. A different seed per design keeps them from all looking identical,
 * but re-running one design must reproduce it exactly.
 */
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

async function prepare(
  assetBuffer: Buffer,
  targetWidth: number,
  placement: IPlacement,
  flip: boolean,
): Promise<Buffer> {
  let pipeline = sharp(assetBuffer).resize({ width: Math.max(8, Math.round(targetWidth)) });

  if (flip) pipeline = pipeline.flop();
  if (placement.rotation) {
    pipeline = pipeline.rotate(placement.rotation, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  return pipeline.png().toBuffer();
}

export interface CompositeResult {
  buffer: Buffer;
  landmarks: Landmarks;
  placedCount: number;
  /**
   * Where embroidery was placed: single-channel, same size as `buffer`,
   * 255 = embroidery. The restore step keeps the AI's pixels only here.
   */
  embroideryMask: Buffer;
  width: number;
  height: number;
}

export async function compositeEmbroidery(
  garmentImage: Buffer,
  assets: IEmbroideryAsset[],
  seed = 42,
  /**
   * Landmarks marked by an operator. Supplied, they win outright — automatic
   * detection cannot separate a pale garment from a similar backdrop, and a
   * blank suit is reused across many generations, so marking it once is both
   * cheap and exact.
   */
  markedLandmarks?: Landmarks,
): Promise<CompositeResult> {
  const detected = markedLandmarks ?? (await detectLandmarks(garmentImage));

  if (!markedLandmarks && detected.confidence < ACCEPTABLE_CONFIDENCE) {
    throw new Error(
      'Could not locate the garment automatically — mark the landmarks on this blank suit first',
    );
  }

  const landmarks = detected;

  const meta = await sharp(garmentImage).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error('Could not read the garment dimensions');

  const layers: Placed[] = [];
  const random = seeded(seed);

  for (const asset of assets) {
    const { placement } = asset;
    const assetBuffer = await fetchAsset(asset.assetUrl);

    const targetW = baseWidth(landmarks, placement.scale.relativeTo) * placement.scale.factor * W;
    const ratio = asset.height / Math.max(asset.width, 1);

    /* Butis are a distribution, not a position: scatter them across the body
       rather than reading offset. Without this every garment gets identical
       motifs in identical spots. */
    if (asset.region === 'buti') {
      const count = 14;
      const prepared = await prepare(assetBuffer, targetW, placement, false);
      const bw = targetW;
      const bh = targetW * ratio;

      for (let i = 0; i < count; i += 1) {
        /* Scatter across the BODY only.
         *
         * garmentWidth is measured cuff-to-cuff, so using it as the spread
         * threw motifs onto the backdrop either side of the mannequin — which
         * the generator then rendered as embroidery floating in mid-air.
         * Shoulder width bounds the torso instead. */
        const y = Math.min(
          landmarks.bottom - 0.06,
          landmarks.top + 0.30 + random() * 0.40,
        );
        const spread = landmarks.shoulderWidth * 0.72;
        const x = landmarks.bodyCenter.x + (random() - 0.5) * spread;

        layers.push({
          input: prepared,
          left: Math.round(x * W - bw / 2),
          top: Math.round(y * H - bh / 2),
        });
      }

      continue;
    }

    /* A border is tiled to span its anchor's width. */
    if (placement.tile) {
      const spanFraction = baseWidth(landmarks, placement.scale.relativeTo) * placement.scale.factor;
      const spanPx = Math.round(spanFraction * W);
      const prepared = await sharp(assetBuffer)
        .resize({ width: spanPx })
        .png()
        .toBuffer();

      const tileMeta = await sharp(prepared).metadata();
      const anchor = anchorPoint(landmarks, placement.anchor);

      layers.push({
        input: prepared,
        left: Math.round(anchor.x * W - spanPx / 2 + placement.offset.x * W),
        top: Math.round(
          anchor.y * H +
            placement.offset.y * H +
            alignOffset(placement.align, tileMeta.height ?? 0),
        ),
      });

      continue;
    }

    const place = async (anchorName: IPlacement['anchor'], flip: boolean, sign: number) => {
      const anchor = anchorPoint(landmarks, anchorName);
      const prepared = await prepare(assetBuffer, targetW, placement, flip);
      const pm = await sharp(prepared).metadata();

      layers.push({
        input: prepared,
        left: Math.round(anchor.x * W + sign * placement.offset.x * W - (pm.width ?? 0) / 2),
        top: Math.round(
          anchor.y * H + placement.offset.y * H + alignOffset(placement.align, pm.height ?? 0),
        ),
      });
    };

    await place(placement.anchor, false, 1);

    /* One asset serves both sides: mirror it onto the opposite landmark. */
    if (placement.mirror) {
      const opposite = placement.anchor.includes('left')
        ? (placement.anchor.replace('left', 'right') as IPlacement['anchor'])
        : (placement.anchor.replace('right', 'left') as IPlacement['anchor']);

      await place(opposite, true, -1);
    }
  }

  /**
   * Keep every piece on the garment.
   *
   * A motif placed beyond the silhouette is rendered as embroidery floating on
   * the backdrop, which is worse than omitting it. Clamping to the garment's
   * measured bounds rather than the canvas is what stops that.
   */
  const bounds = {
    left: Math.round((landmarks.bodyCenter.x - landmarks.shoulderWidth * 0.62) * W),
    right: Math.round((landmarks.bodyCenter.x + landmarks.shoulderWidth * 0.62) * W),
    top: Math.round(landmarks.top * H),
    bottom: Math.round(landmarks.bottom * H),
  };

  const safe = layers
    .map((layer) => ({
      ...layer,
      left: Math.max(bounds.left, Math.min(layer.left, bounds.right)),
      top: Math.max(bounds.top, Math.min(layer.top, bounds.bottom)),
    }))
    .filter((layer) => layer.left >= 0 && layer.top >= 0 && layer.left < W && layer.top < H);

  const buffer = await sharp(garmentImage).composite(safe).png().toBuffer();

  /* Same layers on a transparent canvas; their combined alpha is the mask. */
  const embroideryMask = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(safe)
    .png()
    .toBuffer()
    .then((png) => sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer());

  return { buffer, landmarks, placedCount: safe.length, embroideryMask, width: W, height: H };
}
