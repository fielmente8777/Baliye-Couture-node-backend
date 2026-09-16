import sharp from 'sharp';

import { EmbroideryRegion } from '@models/embroideryasset';

/**
 * Splits an extracted motif sheet into individual embroidery assets.
 *
 * No AI. The sheet already comes back on flat white, so the pieces can be
 * found with ordinary image processing — threshold, connected components,
 * merge nearby blobs, crop. Doing this with one AI call per region would
 * multiply the cost of every extraction for no benefit.
 */

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0);
const width = (b: Box) => b.x1 - b.x0;
const height = (b: Box) => b.y1 - b.y0;

/**
 * How far a pixel must differ from the sheet's own background to count as ink.
 *
 * A fixed white threshold fails: generated sheets are rarely pure white — they
 * come back faintly cream or grey, and then every background pixel reads as
 * ink, the whole sheet becomes one blob, and fourteen motifs merge into two.
 * Sampling the actual background makes this work on any sheet tint.
 */
const INK_DISTANCE = 26;

/**
 * Blobs closer than this fraction of the sheet width are merged.
 *
 * A border is hundreds of separate beads; without merging, every bead becomes
 * its own "asset". Too large and the neckline swallows the chest motifs, so
 * this is the number to tune if splitting looks wrong.
 */
const MERGE_GAP = 0.012;

/** Blobs smaller than this fraction of the sheet are noise, not motifs. */
const MIN_AREA = 0.0004;

/** Downscale before labelling — full resolution is far slower and no better. */
const ANALYSIS_WIDTH = 700;

interface Blob {
  box: Box;
}

/**
 * Two-pass connected-component labelling over a binary mask, using an
 * iterative flood fill. Recursion overflows the stack on a large border.
 */
function findBlobs(mask: Uint8Array, w: number, h: number): Blob[] {
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;

    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;

    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const index = stack.pop() as number;
      const x = index % w;
      const y = (index - x) / w;

      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;

      /* 8-connected: diagonal neighbours matter for thin beaded lines. */
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;

          const n = ny * w + nx;
          if (mask[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }

    blobs.push({ box: { x0, y0, x1: x1 + 1, y1: y1 + 1 } });
  }

  return blobs;
}

const overlapsOrNear = (a: Box, b: Box, gap: number) =>
  a.x0 - gap < b.x1 && b.x0 - gap < a.x1 && a.y0 - gap < b.y1 && b.y0 - gap < a.y1;

/** Repeatedly unions boxes that sit within `gap` of each other. */
function mergeBlobs(blobs: Blob[], gap: number): Box[] {
  let boxes = blobs.map((b) => b.box);
  let merged = true;

  while (merged) {
    merged = false;
    const next: Box[] = [];

    for (const box of boxes) {
      const hit = next.find((other) => overlapsOrNear(box, other, gap));

      if (hit) {
        hit.x0 = Math.min(hit.x0, box.x0);
        hit.y0 = Math.min(hit.y0, box.y0);
        hit.x1 = Math.max(hit.x1, box.x1);
        hit.y1 = Math.max(hit.y1, box.y1);
        merged = true;
      } else {
        next.push({ ...box });
      }
    }

    boxes = next;
  }

  return boxes;
}

export interface SplitPiece {
  region: EmbroideryRegion;
  name: string;
  /** PNG with the white background made transparent. */
  buffer: Buffer;
  width: number;
  height: number;
  dominantHex: string;
  /** Where it sat on the sheet, used only for classification. */
  sheetBox: { x: number; y: number; width: number; height: number };
}

/**
 * Guesses the region from shape and position on the sheet.
 *
 * The extraction prompt lays pieces out in a consistent order — neckline at the
 * top, borders at the bottom — so aspect ratio plus vertical position is a
 * reliable first pass. The operator confirms or corrects in the approval
 * screen, which is where accuracy actually comes from.
 */
function classify(
  box: Box,
  sheetW: number,
  sheetH: number,
  index: number,
): { region: EmbroideryRegion; name: string } {
  const w = width(box) / sheetW;
  const h = height(box) / sheetH;
  const cy = (box.y0 + height(box) / 2) / sheetH;
  const aspect = w / Math.max(h, 0.0001);

  /* Long and thin: a border. Which border depends on how far down it sits. */
  if (aspect > 3.5 && w > 0.4) {
    if (cy > 0.72) return { region: 'lower_hem', name: 'Lower Hem Border' };
    return { region: 'hem_border', name: 'Hem Border' };
  }

  /* Small and roughly square, and there will be several: scattered butis. */
  if (w < 0.08 && h < 0.06) {
    return { region: 'buti', name: `Buti ${index + 1}` };
  }

  /* Wide, near the top, wider than tall: the neckline V. */
  if (cy < 0.35 && aspect > 0.9) {
    return { region: 'neckline', name: 'Neckline Border' };
  }

  /* Mid-sheet, upright: a chest or sleeve motif. */
  if (cy < 0.62) return { region: 'chest', name: 'Chest Motif' };

  return { region: 'sleeve_cuff', name: 'Sleeve Motif' };
}

/**
 * Mean colour of the INK pixels only.
 *
 * sharp's own `dominant` counts the white background, which is most of any
 * crop, so it always returns white — useless for detecting the silver→gold
 * drift this exists to catch.
 */
async function dominantColour(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .resize(120, 120, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let i = 0; i < info.width * info.height; i += 1) {
    const pr = data[i * 3];
    const pg = data[i * 3 + 1];
    const pb = data[i * 3 + 2];
    if (pr > 235 && pg > 235 && pb > 235) continue;

    r += pr;
    g += pg;
    b += pb;
    count += 1;
  }

  if (count === 0) return '#ffffff';

  const hex = (n: number) => Math.round(n / count).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export async function splitSheet(sheet: Buffer): Promise<SplitPiece[]> {
  const meta = await sharp(sheet).metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) throw new Error('Could not read the sheet dimensions');

  const scale = ANALYSIS_WIDTH / fullW;
  const aw = Math.round(fullW * scale);
  const ah = Math.round(fullH * scale);

  const { data } = await sharp(sheet)
    .resize(aw, ah)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  /* Learn the sheet's background from its border, which is empty by design. */
  const ring: number[][] = [];
  const ringStep = Math.max(1, Math.round(aw / 50));

  for (let x = 0; x < aw; x += ringStep) {
    for (const y of [0, 1, ah - 2, ah - 1]) {
      const i = (y * aw + x) * 3;
      ring.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  for (let y = 0; y < ah; y += ringStep) {
    for (const x of [0, 1, aw - 2, aw - 1]) {
      const i = (y * aw + x) * 3;
      ring.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 255;
  };

  const bg = [0, 1, 2].map((c) => median(ring.map((px) => px[c])));

  const mask = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i += 1) {
    const dr = data[i * 3] - bg[0];
    const dg = data[i * 3 + 1] - bg[1];
    const db = data[i * 3 + 2] - bg[2];
    mask[i] = Math.sqrt(dr * dr + dg * dg + db * db) > INK_DISTANCE ? 1 : 0;
  }

  const blobs = findBlobs(mask, aw, ah);
  const boxes = mergeBlobs(blobs, Math.round(MERGE_GAP * aw)).filter(
    (box) => area(box) / (aw * ah) > MIN_AREA,
  );

  /* Top-to-bottom, then left-to-right — matches how the sheet reads. */
  boxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  const pieces: SplitPiece[] = [];

  for (const [index, box] of boxes.entries()) {
    /* Map back to full resolution and pad slightly so edges are not clipped. */
    const pad = Math.round(6 / scale);
    const left = Math.max(0, Math.round(box.x0 / scale) - pad);
    const top = Math.max(0, Math.round(box.y0 / scale) - pad);
    const w = Math.min(fullW - left, Math.round(width(box) / scale) + pad * 2);
    const h = Math.min(fullH - top, Math.round(height(box) / scale) + pad * 2);

    const crop = await sharp(sheet)
      .extract({ left, top, width: w, height: h })
      .png()
      .toBuffer();

    /* White → transparent, so the piece composites onto any fabric colour. */
    const transparent = await makeTransparent(crop);

    pieces.push({
      ...classify(box, aw, ah, index),
      buffer: transparent,
      width: w,
      height: h,
      dominantHex: await dominantColour(crop),
      sheetBox: {
        x: box.x0 / aw,
        y: box.y0 / ah,
        width: width(box) / aw,
        height: height(box) / ah,
      },
    });
  }

  return pieces;
}

/** How close to the keyed backdrop colour a pixel must be to be removed. */
const FABRIC_KEY_TOLERANCE = 58;

/**
 * Knocks out the background behind a motif.
 *
 * Two backgrounds have to go, not one. Extraction is supposed to return motifs
 * on flat white, but it routinely leaves a patch of the donor garment's fabric
 * behind each piece — a blue rectangle behind a neckline, a blue band behind a
 * border. Removing only white leaves that patch opaque, and it then gets
 * composited onto the target garment, which is exactly how blue fabric ends up
 * on a pink kurta.
 *
 * So the crop's own border ring is sampled: whatever colour dominates the edge
 * is the backdrop, whether that is white or the donor's silk, and it is keyed
 * out along with white.
 *
 * Alpha ramps rather than cutting hard, because metallic thread has soft pale
 * highlights and a hard threshold leaves a jagged halo around every bead.
 */
async function makeTransparent(crop: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(crop)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const pixels = w * h;

  /* Sample the outer ring — a motif sits in the middle, so the edge is
     background by construction. */
  const ring: number[][] = [];
  const step = Math.max(1, Math.round(w / 40));

  for (let x = 0; x < w; x += step) {
    for (const y of [0, 1, h - 2, h - 1]) {
      if (y < 0 || y >= h) continue;
      const i = (y * w + x) * 3;
      ring.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  for (let y = 0; y < h; y += step) {
    for (const x of [0, 1, w - 2, w - 1]) {
      if (x < 0 || x >= w) continue;
      const i = (y * w + x) * 3;
      ring.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 255;
  };

  const key = [0, 1, 2].map((c) => median(ring.map((px) => px[c])));

  /* If the edge is already near-white there is no fabric patch to key. */
  const keyIsWhite = key.every((c) => c > 235);

  const rgba = Buffer.alloc(pixels * 4);

  for (let i = 0; i < pixels; i += 1) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];

    /* White removal, with a soft ramp. */
    const lightest = Math.max(r, g, b);
    let alpha =
      lightest >= 250 ? 0 : lightest <= 200 ? 255 : Math.round(((250 - lightest) / 50) * 255);

    /* Fabric removal: distance from the keyed backdrop colour. */
    if (!keyIsWhite) {
      const distance = Math.sqrt(
        (r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2,
      );

      const fabricAlpha =
        distance <= FABRIC_KEY_TOLERANCE * 0.6
          ? 0
          : distance >= FABRIC_KEY_TOLERANCE
            ? 255
            : Math.round(
                ((distance - FABRIC_KEY_TOLERANCE * 0.6) / (FABRIC_KEY_TOLERANCE * 0.4)) * 255,
              );

      /* A pixel must survive both tests to stay — it is ink only if it is
         neither the paper nor the cloth. */
      alpha = Math.min(alpha, fabricAlpha);
    }

    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = alpha;
  }

  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}
