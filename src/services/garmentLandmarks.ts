import sharp from 'sharp';

/**
 * Finds anatomical landmarks on a garment photograph.
 *
 * No AI. The client photographs on a white mannequin against a plain grey
 * backdrop, so the garment can be isolated by colour distance from the
 * background and its landmarks derived from the silhouette. A vision call per
 * generation would add cost for something geometry already answers.
 *
 * IMPORTANT: this is a best-effort first guess, not a guarantee.
 *
 * It fails when the garment is close in colour to the backdrop — a pale blue
 * silk on a blue-grey studio wall measures only a few units apart, so the
 * silhouette comes back as the embroidery alone. Measured on real client
 * photography, so it is not hypothetical.
 *
 * The reliable path is `confidence`: below the threshold, the caller must fall
 * back to landmarks marked by an operator. Blank suits are reused across many
 * generations, so marking one once is cheap and exact.
 */

export interface Landmarks {
  /**
   * 0-1. Below ACCEPTABLE_CONFIDENCE the detection should not be trusted and
   * the operator's marked landmarks should be used instead.
   */
  confidence: number;

  /** All values are fractions of the image, so they survive any resolution. */
  neckline: { x: number; y: number };
  shoulderLeft: { x: number; y: number };
  shoulderRight: { x: number; y: number };
  cuffLeft: { x: number; y: number };
  cuffRight: { x: number; y: number };
  hemCenter: { x: number; y: number };
  bodyCenter: { x: number; y: number };

  shoulderWidth: number;
  garmentWidth: number;
  hemWidth: number;
  /** Vertical extent of the garment, used to bound buti scatter. */
  top: number;
  bottom: number;
}

const ANALYSIS_WIDTH = 500;

/** How far a pixel must differ from the backdrop to count as garment. */
const BACKGROUND_DISTANCE = 42;

/** Detections below this are treated as failures by the compositor. */
export const ACCEPTABLE_CONFIDENCE = 0.6;

export async function detectLandmarks(image: Buffer): Promise<Landmarks> {
  const { data, info } = await sharp(image)
    .resize(ANALYSIS_WIDTH)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  /**
   * Model the backdrop from a ring of border pixels rather than four corners.
   *
   * Studio backdrops are vignetted — the corners are measurably darker than the
   * middle — so a corner sample makes the whole frame look like garment. Taking
   * the median of many border samples, and deriving the threshold from their
   * own spread, adapts to whatever gradient the photograph has.
   */
  const border: number[][] = [];
  const step = Math.max(1, Math.round(w / 60));

  for (let x = 0; x < w; x += step) {
    for (const y of [1, 3, h - 2, h - 4]) {
      const i = (y * w + x) * 3;
      border.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  for (let y = 0; y < h; y += step) {
    for (const x of [1, 3, w - 2, w - 4]) {
      const i = (y * w + x) * 3;
      border.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const bg = [0, 1, 2].map((c) => median(border.map((px) => px[c])));

  const distance = (px: number[]) =>
    Math.sqrt(
      (px[0] - bg[0]) ** 2 + (px[1] - bg[1]) ** 2 + (px[2] - bg[2]) ** 2,
    );

  /* How far the backdrop itself varies. Anything beyond that spread is a
     real object, not lighting. */
  const spread = median(border.map(distance));
  const threshold = Math.max(BACKGROUND_DISTANCE, spread * 3.5);

  /** Garment mask: pixels far enough from the backdrop colour. */
  const isGarment = (x: number, y: number) => {
    const i = (y * w + x) * 3;
    return distance([data[i], data[i + 1], data[i + 2]]) > threshold;
  };

  /** Row extents, so the silhouette can be read as a profile. */
  const rows: { left: number; right: number; count: number }[] = [];

  for (let y = 0; y < h; y += 1) {
    let left = -1;
    let right = -1;
    let count = 0;

    for (let x = 0; x < w; x += 1) {
      if (!isGarment(x, y)) continue;
      if (left === -1) left = x;
      right = x;
      count += 1;
    }

    rows.push({ left, right, count });
  }

  /* A row is "garment" only if enough of it is filled — this rejects the
     mannequin's head and stray shadow. */
  const minFill = w * 0.08;
  const bodyRows = rows
    .map((row, y) => ({ ...row, y }))
    .filter((row) => row.count > minFill);

  if (bodyRows.length === 0) {
    throw new Error('Could not find a garment in that image');
  }

  const top = bodyRows[0].y;
  const bottom = bodyRows[bodyRows.length - 1].y;
  const bodyHeight = bottom - top;

  /**
   * Shoulders: the widest point in the upper third. On a kurta with bell
   * sleeves the true widest row is the cuff, so the search is bounded.
   */
  const shoulderZone = bodyRows.filter(
    (row) => row.y > top + bodyHeight * 0.04 && row.y < top + bodyHeight * 0.22,
  );

  const shoulderRow = shoulderZone.reduce(
    (best, row) => (row.right - row.left > best.right - best.left ? row : best),
    shoulderZone[0] ?? bodyRows[0],
  );

  /**
   * Neckline: scanning down the centre from the shoulder line, the first row
   * where the mannequin's neck gives way to fabric. Detected as the point
   * where the centre column becomes garment continuously.
   */
  const cx = Math.round((shoulderRow.left + shoulderRow.right) / 2);
  let necklineY = shoulderRow.y;

  for (let y = shoulderRow.y; y < top + bodyHeight * 0.35; y += 1) {
    /* Require a run of garment pixels, so a single speckle does not trigger. */
    let run = 0;
    for (let k = 0; k < 8 && y + k < h; k += 1) if (isGarment(cx, y + k)) run += 1;

    if (run >= 7) {
      necklineY = y;
      break;
    }
  }

  /**
   * Cuffs: the outermost garment points in the sleeve band. Bell sleeves flare,
   * so the extremes in the middle third are the cuff edges.
   */
  const sleeveZone = bodyRows.filter(
    (row) => row.y > top + bodyHeight * 0.3 && row.y < top + bodyHeight * 0.65,
  );

  const cuffRow = sleeveZone.reduce(
    (best, row) => (row.right - row.left > best.right - best.left ? row : best),
    sleeveZone[0] ?? shoulderRow,
  );

  /* Hem: average width over the lowest rows, which is steadier than one row. */
  const hemRows = bodyRows.slice(-Math.max(3, Math.round(bodyRows.length * 0.04)));
  const hemLeft = hemRows.reduce((s, r) => s + r.left, 0) / hemRows.length;
  const hemRight = hemRows.reduce((s, r) => s + r.right, 0) / hemRows.length;

  const widest = bodyRows.reduce(
    (best, row) => Math.max(best, row.right - row.left),
    0,
  );

  /**
   * Confidence from three sanity checks that a real garment silhouette passes
   * and a failed segmentation does not:
   *   - shoulders span a plausible fraction of the frame, not 0-100%
   *   - the detected body is reasonably solid, not a scatter of motifs
   *   - the garment is taller than it is wide
   */
  const shoulderSpan = (shoulderRow.right - shoulderRow.left) / w;
  const solidity =
    bodyRows.reduce((sum, row) => sum + row.count, 0) /
    Math.max(1, bodyRows.length * widest);
  const aspectOk = bodyHeight > widest * 0.8;

  const confidence = Math.min(
    shoulderSpan > 0.25 && shoulderSpan < 0.92 ? 1 : 0.2,
    solidity > 0.55 ? 1 : solidity,
    aspectOk ? 1 : 0.3,
  );

  const fx = (v: number) => v / w;
  const fy = (v: number) => v / h;

  return {
    confidence,
    neckline: { x: fx(cx), y: fy(necklineY) },
    shoulderLeft: { x: fx(shoulderRow.left), y: fy(shoulderRow.y) },
    shoulderRight: { x: fx(shoulderRow.right), y: fy(shoulderRow.y) },
    cuffLeft: { x: fx(cuffRow.left), y: fy(cuffRow.y) },
    cuffRight: { x: fx(cuffRow.right), y: fy(cuffRow.y) },
    hemCenter: { x: fx((hemLeft + hemRight) / 2), y: fy(bottom) },
    bodyCenter: { x: fx(cx), y: fy(top + bodyHeight * 0.55) },

    shoulderWidth: fx(shoulderRow.right - shoulderRow.left),
    garmentWidth: fx(widest),
    hemWidth: fx(hemRight - hemLeft),
    top: fy(top),
    bottom: fy(bottom),
  };
}
