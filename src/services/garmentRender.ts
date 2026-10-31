import sharp from 'sharp';

import { Landmarks } from './garmentLandmarks';

/**
 * The deterministic half of AI Studio try-ons.
 *
 * Framing and masks are produced here with plain pixel maths, so they are
 * exact every time. The AI model is only allowed to add realism on top, and
 * `restoreOutsideMask` throws away anything it changed outside the embroidery.
 *
 * All masks are single-channel 8-bit buffers the same size as their image:
 * 255 = inside, 0 = outside.
 */

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

/** Every image sent to the model is 3:4 — the model always answers in 3:4. */
const RENDER_ASPECT = 3 / 4;

async function toRaw(image: Buffer, width?: number, height?: number): Promise<RawImage> {
  let pipeline = sharp(image).removeAlpha();
  if (width && height) pipeline = pipeline.resize(width, height, { fit: 'fill' });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const fromRaw = (raw: RawImage, channels: 1 | 3 = 3) =>
  sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels } });

/** Median colour of a ring of border pixels — the studio backdrop. */
function backdropColour(raw: RawImage) {
  const { data, width: w, height: h } = raw;
  const samples: number[][] = [];
  const step = Math.max(1, Math.round(w / 60));

  for (let x = 0; x < w; x += step) {
    for (const y of [1, h - 2]) {
      const i = (y * w + x) * 3;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let y = 0; y < h; y += step) {
    for (const x of [1, w - 2]) {
      const i = (y * w + x) * 3;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  return [0, 1, 2].map((c) => {
    const sorted = samples.map((s) => s[c]).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  });
}

/**
 * Pads an image to 3:4 with its own backdrop colour, without cropping.
 *
 * Nano Banana is asked for 3:4 output. If the input is some other shape the
 * model reframes it, every pixel moves, and the restore step can no longer
 * line the two images up. Normalising once, on the way in, prevents that.
 */
export interface PortraitResult {
  buffer: Buffer;
  /** Remaps fractional landmarks marked on the ORIGINAL image onto the padded one. */
  mapLandmarks: <T extends Landmarks>(landmarks: T) => T;
}

export async function toPortrait(image: Buffer, fill?: { r: number; g: number; b: number }): Promise<PortraitResult> {
  const raw = await toRaw(image);
  const { width: w, height: h } = raw;
  const current = w / h;

  if (Math.abs(current - RENDER_ASPECT) < 0.005) {
    return {
      buffer: await sharp(image).removeAlpha().png().toBuffer(),
      mapLandmarks: (l) => l,
    };
  }

  const [r, g, b] = fill ? [fill.r, fill.g, fill.b] : backdropColour(raw);
  const targetW = current > RENDER_ASPECT ? w : Math.round(h * RENDER_ASPECT);
  const targetH = current > RENDER_ASPECT ? Math.round(w / RENDER_ASPECT) : h;

  const buffer = await sharp(image)
    .removeAlpha()
    .resize(targetW, targetH, { fit: 'contain', background: { r, g, b } })
    .png()
    .toBuffer();

  /* Pure padding, centred — no scaling — so a point moves by a fixed offset. */
  const offX = (targetW - w) / 2;
  const offY = (targetH - h) / 2;
  const px = (x: number) => (x * w + offX) / targetW;
  const py = (y: number) => (y * h + offY) / targetH;
  const pt = (p: { x: number; y: number }) => ({ x: px(p.x), y: py(p.y) });
  const sx = w / targetW;

  return {
    buffer,
    mapLandmarks: (l) => ({
      ...l,
      neckline: pt(l.neckline),
      shoulderLeft: pt(l.shoulderLeft),
      shoulderRight: pt(l.shoulderRight),
      cuffLeft: pt(l.cuffLeft),
      cuffRight: pt(l.cuffRight),
      hemCenter: pt(l.hemCenter),
      bodyCenter: pt(l.bodyCenter),
      shoulderWidth: l.shoulderWidth * sx,
      garmentWidth: l.garmentWidth * sx,
      hemWidth: l.hemWidth * sx,
      top: py(l.top),
      bottom: py(l.bottom),
    }),
  };
}

/**
 * Grows a mask outward by roughly `px` pixels with a soft edge.
 *
 * The blend pass needs a little room around each motif to add its stitch
 * shadow; without the margin the restore cuts that shadow off and the
 * embroidery looks pasted again.
 */
export async function dilateMask(mask: Buffer, width: number, height: number, px: number) {
  return fromRaw({ data: mask, width, height }, 1)
    .blur(Math.max(0.3, px / 2))
    .threshold(8)
    .blur(Math.max(0.3, px / 3))
    /* sharp returns sRGB (3 channels) unless told otherwise — keep 1. */
    .extractChannel(0)
    .raw()
    .toBuffer();
}

/**
 * Keeps the AI's work ONLY where the embroidery is.
 *
 * Everything outside the (dilated) embroidery mask is copied back from the
 * composite, pixel for pixel. However the model misbehaves — recolouring the
 * fabric, redrawing the neckline, moving the pose — none of it survives. This
 * is what makes the customer's colour and neckline guaranteed rather than
 * hoped for.
 */
export async function restoreOutsideMask(
  composite: Buffer,
  generated: Buffer,
  mask: Buffer,
): Promise<Buffer> {
  const base = await toRaw(composite);
  const gen = await toRaw(generated, base.width, base.height);

  const out = Buffer.alloc(base.data.length);
  for (let p = 0; p < base.width * base.height; p += 1) {
    const a = mask[p] / 255;
    const i = p * 3;
    for (let c = 0; c < 3; c += 1) {
      out[i + c] = Math.round(gen.data[i + c] * a + base.data[i + c] * (1 - a));
    }
  }

  return fromRaw({ data: out, width: base.width, height: base.height }).png().toBuffer();
}

/**
 * How far the blend moved or recoloured the embroidery, 0-1.
 *
 * Measured inside the tight (undilated) mask: blending legitimately adds
 * shading there, so a small difference is expected, but a model that moved a
 * motif or turned silver work gold scores high. Above the limit the blended
 * image is discarded and the exact composite is shown instead.
 */
export async function embroideryDrift(
  composite: Buffer,
  result: Buffer,
  tightMask: Buffer,
): Promise<number> {
  const a = await toRaw(composite);
  const b = await toRaw(result, a.width, a.height);

  let sum = 0;
  let count = 0;
  for (let p = 0; p < a.width * a.height; p += 1) {
    if (tightMask[p] < 200) continue;
    const i = p * 3;
    sum += Math.sqrt(
      (a.data[i] - b.data[i]) ** 2 +
        (a.data[i + 1] - b.data[i + 1]) ** 2 +
        (a.data[i + 2] - b.data[i + 2]) ** 2,
    );
    count += 1;
  }

  if (count === 0) return 0;
  return sum / count / (255 * Math.sqrt(3));
}

/** Above this the blend changed the embroidery itself, not just its lighting. */
export const DRIFT_LIMIT = 0.16;
