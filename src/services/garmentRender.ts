import sharp from 'sharp';

import { Landmarks } from './garmentLandmarks';

/**
 * The deterministic half of image generation.
 *
 * Everything the customer CHOSE — the neckline, the colour, which embroidery
 * and where it sits — is produced here with plain pixel maths, so it is exact
 * every time. The AI model is only allowed to add realism on top, and
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
export const RENDER_ASPECT = 3 / 4;

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
 * Garment mask by distance from the backdrop colour.
 *
 * Same idea as the landmark detector, at full resolution. Works because base
 * garments are shot light-coloured on a plain backdrop; the rows above the
 * garment's top (the mannequin head) are cut away using the landmark bounds.
 */
export async function garmentMask(
  image: Buffer,
  bounds?: { top: number; bottom: number; shoulderWidth?: number },
): Promise<Buffer> {
  const raw = await toRaw(image);
  const { data, width: w, height: h } = raw;
  const bg = backdropColour(raw);

  const distances = new Float32Array(w * h);
  const border: number[] = [];
  for (let p = 0; p < w * h; p += 1) {
    const i = p * 3;
    const d = Math.sqrt(
      (data[i] - bg[0]) ** 2 + (data[i + 1] - bg[1]) ** 2 + (data[i + 2] - bg[2]) ** 2,
    );
    distances[p] = d;
    const x = p % w;
    const y = Math.floor(p / w);
    if (x < 3 || y < 3 || x > w - 4 || y > h - 4) border.push(d);
  }

  border.sort((a, b) => a - b);
  const spread = border[Math.floor(border.length / 2)] ?? 0;
  /* Lower than the landmark detector's threshold: a white garment on a light
     backdrop differs mostly in its shadows, and a missed pixel stays uncoloured. */
  const threshold = Math.max(18, spread * 3);

  const bottom = bounds ? Math.ceil(bounds.bottom * h) : h;
  let top = bounds ? Math.floor(bounds.top * h) : 0;

  /* Fabric starts where the silhouette becomes shoulder-wide. Rows above that
     are the mannequin's head and neck, which must never be dyed. */
  if (bounds?.shoulderWidth) {
    const minRun = bounds.shoulderWidth * w * 0.6;
    for (let y = top; y < bottom; y += 1) {
      let count = 0;
      for (let x = 0; x < w; x += 1) if (distances[y * w + x] > threshold) count += 1;
      if (count >= minRun) {
        top = y;
        break;
      }
    }
  }

  const mask = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p += 1) {
    const y = Math.floor(p / w);
    mask[p] = y >= top && y <= bottom && distances[p] > threshold ? 255 : 0;
  }

  /* Close pinholes (flat highlights read as backdrop) and soften the edge. */
  return fromRaw({ data: mask, width: w, height: h }, 1)
    .blur(2)
    .threshold(96)
    .blur(1.2)
    /* sharp returns sRGB (3 channels) unless told otherwise — keep 1. */
    .extractChannel(0)
    .raw()
    .toBuffer();
}

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Dyes the garment to an exact hex, keeping every fold and shadow.
 *
 * Luminance-preserving multiply: the base is shot white or light grey, so its
 * brightness at each pixel IS the shading. Normalising that brightness against
 * the garment's own highlights and multiplying by the target colour gives a
 * dyed garment whose folds are untouched. No AI — exact and instant.
 */
export async function recolour(image: Buffer, mask: Buffer, hex: string): Promise<Buffer> {
  const raw = await toRaw(image);
  const { data, width: w, height: h } = raw;
  const target = hexToRgb(hex);

  /* Reference white = 97th percentile of garment luminance, so a slightly
     grey base still dyes to the full colour rather than a darker one. */
  const lum = new Float32Array(w * h);
  const inside: number[] = [];
  for (let p = 0; p < w * h; p += 1) {
    const i = p * 3;
    lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (mask[p] > 128 && p % 7 === 0) inside.push(lum[p]);
  }
  inside.sort((a, b) => a - b);
  const white = Math.max(40, inside[Math.floor(inside.length * 0.97)] ?? 255);

  const out = Buffer.alloc(data.length);
  for (let p = 0; p < w * h; p += 1) {
    const i = p * 3;
    const alpha = mask[p] / 255;
    const shade = Math.min(1.08, lum[p] / white);

    for (let c = 0; c < 3; c += 1) {
      const dyed = Math.min(255, target[c] * shade);
      out[i + c] = Math.round(dyed * alpha + data[i + c] * (1 - alpha));
    }
  }

  return fromRaw({ data: out, width: w, height: h }).png().toBuffer();
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
