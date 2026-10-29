import sharp from 'sharp';

import { env } from '@config/env';
import { logger } from '@config/logger';
import { IEmbroideryAsset } from '@models/embroideryasset';
import { ApiError } from '@utils/apiError';
import { fetchAsset } from './embroideryCompositor';

/**
 * Copies the embroidery layout of a source garment onto a plain one.
 *
 * Region defaults ("a chest motif sits under the shoulder", "butis scatter
 * over the body") are a guess about where work usually goes, and on a real
 * design they are wrong as often as right: this suit's paisleys sit just
 * above the kurta hem, its butis are on the sleeves only, and a suit's
 * silhouette bottom is the salwar hem, not the kurta's.
 *
 * So instead one vision call looks at the source photo, the plain garment and
 * every approved piece, and reports
 *   - the same six body points on both garments, and
 *   - every place each piece appears on the source.
 * The mapping from source to target is then plain arithmetic on those points,
 * which keeps proportions consistent where a model asked for target
 * coordinates directly would not.
 *
 * Both photos carry a labelled 10% grid: models read positions off a grid far
 * more accurately than they estimate raw coordinates.
 */

/** One placed copy of a piece, in fractions of the target image. */
export interface PlannedPiece {
  assetId: string;
  /** Centre of the piece. */
  x: number;
  y: number;
  /** Width of the unrotated piece, as a fraction of the image width. */
  width: number;
  /** Degrees clockwise. */
  rotation: number;
  /** Mirrored left-to-right, e.g. the right-hand copy of a pair. */
  flip: boolean;
}

type Point = [number, number];

interface BodyPoints {
  shoulderLeft: Point;
  shoulderRight: Point;
  cuffLeft: Point;
  cuffRight: Point;
  topHem: Point;
  bottomHem: Point;
}

const POINT_KEYS: (keyof BodyPoints)[] = ['shoulderLeft', 'shoulderRight', 'cuffLeft', 'cuffRight', 'topHem', 'bottomHem'];

const PHOTO_SIZE = 1024;
const CELL = 220;
const COLUMNS = 4;
const MAX_PIECES = 80;

/** Resizes a photo and draws the labelled percentage grid over it. */
async function gridded(image: Buffer) {
  const resized = await sharp(image)
    .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'inside' })
    .flatten({ background: '#ffffff' })
    .jpeg()
    .toBuffer();
  const { width = PHOTO_SIZE, height = PHOTO_SIZE } = await sharp(resized).metadata();

  const lines: string[] = [];
  for (let p = 10; p < 100; p += 10) {
    const x = Math.round((p / 100) * width);
    const y = Math.round((p / 100) * height);
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#ff0044" stroke-opacity="0.45" stroke-width="1"/>`,
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#ff0044" stroke-opacity="0.45" stroke-width="1"/>`,
      `<text x="${x + 2}" y="14" font-size="13" font-family="Arial" font-weight="bold" fill="#ff0044">${p}</text>`,
      `<text x="2" y="${y - 3}" font-size="13" font-family="Arial" font-weight="bold" fill="#ff0044">${p}</text>`,
    );
  }

  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${lines.join('')}</svg>`);
  return sharp(resized).composite([{ input: svg }]).jpeg({ quality: 85 }).toBuffer();
}

/** Every approved piece on white, numbered, so the model can refer to them. */
async function pieceSheet(assets: IEmbroideryAsset[]) {
  const rows = Math.ceil(assets.length / COLUMNS);
  const cells = await Promise.all(
    assets.map(async (asset, i) => {
      const piece = await sharp(await fetchAsset(asset.thumbnailUrl || asset.assetUrl))
        .resize(CELL - 40, CELL - 50, { fit: 'inside' })
        .png()
        .toBuffer();
      const meta = await sharp(piece).metadata();
      const left = (i % COLUMNS) * CELL;
      const top = Math.floor(i / COLUMNS) * CELL;
      return {
        piece: { input: piece, left: left + Math.round((CELL - (meta.width ?? 0)) / 2), top: top + 36 },
        label: `<rect x="${left + 4}" y="${top + 4}" width="${CELL - 8}" height="${CELL - 8}" fill="none" stroke="#999"/>
          <rect x="${left + 4}" y="${top + 4}" width="34" height="26" fill="#e00034"/>
          <text x="${left + 21}" y="${top + 24}" font-size="18" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${i + 1}</text>`,
      };
    }),
  );

  const width = COLUMNS * CELL;
  const height = rows * CELL;
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${cells.map((c) => c.label).join('')}</svg>`);

  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite([...cells.map((c) => c.piece), { input: svg }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

function instructions(assets: IEmbroideryAsset[]) {
  const names = assets
    .map((a, i) => `${i + 1}: ${a.name}${a.description ? ` (${a.description})` : ''}`)
    .join('\n');

  return [
    'You are copying an embroidery layout from one Indian ethnic garment onto another.',
    'IMAGE 1 is the SOURCE garment: a photo of the finished, embroidered design.',
    'IMAGE 2 is the TARGET garment: the same kind of garment, plain, no embroidery.',
    'IMAGE 3 is a sheet of the embroidery pieces cut from the source, each numbered:',
    names,
    '',
    'Images 1 and 2 have a red grid every 10%. Read every position off that grid as a',
    'PERCENTAGE of the image: x from the left edge (0-100), y from the top edge (0-100).',
    '"left" and "right" always mean image-left and image-right, as you see the photo.',
    '',
    'Step 1. On BOTH garments, mark these points [x, y]:',
    '  shoulderLeft, shoulderRight: the outer tip of each shoulder, where the sleeve joins.',
    '  cuffLeft, cuffRight: the middle of the bottom edge of each sleeve.',
    '  topHem: the middle of the bottom edge of the top garment (kurta / kurti / tunic).',
    '  bottomHem: the middle of the bottom edge of the whole outfit (salwar / pants hem).',
    '  For a one-piece dress, topHem and bottomHem are the same point.',
    '',
    'Step 2. For EVERY numbered piece, find every place it appears on the SOURCE (image 1)',
    'and give each one as an instance:',
    '  box: [left, top, right, bottom] — a tight box around that copy, in percent of image 1.',
    '  rotation: degrees clockwise the piece (as drawn on the sheet) is turned on the garment.',
    '    A neckline border following a V neck is two copies turned roughly ±30°.',
    '  flip: true when that copy is the mirror image of the piece on the sheet,',
    '    typically the right-hand copy of a left/right pair.',
    'Small repeated motifs (butis) appear many times: list every copy you can see, exactly where it is.',
    'A piece that is not visible on the front of the source gets an empty instance list.',
    'Do NOT invent positions that are not on the source. Copy the source exactly.',
    '',
    'Reply with JSON only, in this exact shape:',
    '{"source":{"shoulderLeft":[x,y],"shoulderRight":[x,y],"cuffLeft":[x,y],"cuffRight":[x,y],"topHem":[x,y],"bottomHem":[x,y]},',
    ' "target":{ same six points on image 2 },',
    ' "pieces":[{"n":1,"instances":[{"box":[l,t,r,b],"rotation":0,"flip":false}]}]}',
  ].join('\n');
}

const isPoint = (value: unknown): value is Point =>
  Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number' && Number.isFinite(v));

function readPoints(raw: unknown, width: number, height: number): BodyPoints | null {
  const source = raw as Record<string, unknown> | undefined;
  if (!source) return null;
  const points = {} as BodyPoints;

  for (const key of POINT_KEYS) {
    const point = source[key];
    if (!isPoint(point)) return null;
    /* Percent → pixels of the original image. */
    points[key] = [(point[0] / 100) * width, (point[1] / 100) * height];
  }

  return points;
}

/**
 * Maps a source y onto the target, piecewise between matching body levels.
 *
 * A single scale would be wrong: the target's kurta may be longer or its
 * salwar shorter, and a hem border must land on the hem either way.
 */
function verticalMap(source: BodyPoints, target: BodyPoints, fallbackScale: number) {
  const level = (p: BodyPoints) => [
    (p.shoulderLeft[1] + p.shoulderRight[1]) / 2,
    (p.cuffLeft[1] + p.cuffRight[1]) / 2,
    p.topHem[1],
    p.bottomHem[1],
  ];

  const pairs = level(source)
    .map((s, i) => [s, level(target)[i]] as const)
    .sort((a, b) => a[0] - b[0])
    /* Keep only strictly increasing pairs; a dress's two equal hems collapse to one. */
    .filter((pair, i, all) => i === 0 || (pair[0] - all[i - 1][0] > 2 && pair[1] > all[i - 1][1]));

  return (y: number) => {
    if (pairs.length === 1) return pairs[0][1] + (y - pairs[0][0]) * fallbackScale;

    let i = 0;
    while (i < pairs.length - 2 && y > pairs[i + 1][0]) i += 1;
    const [s0, t0] = pairs[i];
    const [s1, t1] = pairs[i + 1];
    return t0 + ((y - s0) * (t1 - t0)) / (s1 - s0);
  };
}

export async function planFromReference(
  reference: Buffer,
  target: Buffer,
  assets: IEmbroideryAsset[],
): Promise<PlannedPiece[]> {
  if (!env.openai.apiKey) throw ApiError.badRequest('OpenAI is not configured');

  const pieces = assets.filter((a) => a.region !== 'back').slice(0, 24);
  const [sourceMeta, targetMeta] = await Promise.all([sharp(reference).metadata(), sharp(target).metadata()]);
  const Ws = sourceMeta.width ?? 0;
  const Hs = sourceMeta.height ?? 0;
  const Wt = targetMeta.width ?? 0;
  const Ht = targetMeta.height ?? 0;
  if (!Ws || !Hs || !Wt || !Ht) throw ApiError.badRequest('Could not read the photo dimensions');

  const [source, plain, sheet] = await Promise.all([gridded(reference), gridded(target), pieceSheet(pieces)]);
  const image = (buffer: Buffer) => ({
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}`, detail: 'high' },
  });

  const response = await fetch(`${env.openai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.openai.apiKey}`,
      ...(env.openai.organization ? { 'OpenAI-Organization': env.openai.organization } : {}),
    },
    body: JSON.stringify({
      model: env.openai.layoutModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: instructions(pieces) }, image(source), image(plain), image(sheet)],
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    logger.warn({ status: response.status, body: (await response.text()).slice(0, 300) }, 'Reference layout failed');
    throw ApiError.badRequest('The AI could not read the layout from the source photo — try again');
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: unknown;
  };
  logger.info({ model: env.openai.layoutModel, usage: json.usage }, 'Reference layout read');

  let parsed: {
    source?: unknown;
    target?: unknown;
    pieces?: { n?: number; instances?: { box?: unknown; rotation?: unknown; flip?: unknown }[] }[];
  };
  try {
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
  } catch {
    throw ApiError.badRequest('The AI returned an unreadable layout — try again');
  }

  const src = readPoints(parsed.source, Ws, Hs);
  const tgt = readPoints(parsed.target, Wt, Ht);
  if (!src || !tgt) throw ApiError.badRequest('The AI could not find the shoulders and hems on both photos — try again');

  const shoulderSpan = (p: BodyPoints) => Math.abs(p.shoulderRight[0] - p.shoulderLeft[0]);
  const centreX = (p: BodyPoints) => (p.shoulderLeft[0] + p.shoulderRight[0]) / 2;
  if (shoulderSpan(src) < 10 || shoulderSpan(tgt) < 10) {
    throw ApiError.badRequest('The AI could not find the shoulders on both photos — try again');
  }

  /* Horizontal scale and piece size follow shoulder width; vertical position
     follows the body levels. */
  const scale = shoulderSpan(tgt) / shoulderSpan(src);
  const mapY = verticalMap(src, tgt, scale);

  const plan: PlannedPiece[] = [];

  for (const [index, asset] of pieces.entries()) {
    const entry = parsed.pieces?.find((p) => p.n === index + 1);
    const ratio = asset.height / Math.max(asset.width, 1);

    for (const instance of entry?.instances ?? []) {
      const box = instance.box;
      if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === 'number')) continue;

      const [l, t, r, b] = (box as number[]).map((v, i) => (v / 100) * (i % 2 === 0 ? Ws : Hs));
      const boxW = Math.abs(r - l);
      const boxH = Math.abs(b - t);
      if (boxW < 2 || boxH < 2) continue;

      const rotation = typeof instance.rotation === 'number' ? Math.max(-180, Math.min(180, instance.rotation)) : 0;
      const radians = (rotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));

      /* The box bounds the ROTATED piece; recover the unrotated width from
         both of its sides and average, since the model's box is often loose
         in one direction. */
      const fromWidth = boxW / (cos + ratio * sin);
      const fromHeight = boxH / (sin + ratio * cos);
      const sourceWidth = (fromWidth + fromHeight) / 2;

      const x = centreX(tgt) + ((l + r) / 2 - centreX(src)) * scale;
      const y = mapY((t + b) / 2);

      plan.push({
        assetId: asset._id.toString(),
        x: x / Wt,
        y: y / Ht,
        width: (sourceWidth * scale) / Wt,
        rotation,
        flip: instance.flip === true,
      });

      if (plan.length >= MAX_PIECES) return plan;
    }
  }

  if (plan.length === 0) {
    throw ApiError.badRequest('The AI could not find any of these pieces on the source photo');
  }

  return plan;
}
