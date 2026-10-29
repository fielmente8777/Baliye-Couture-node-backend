import sharp from 'sharp';

import { env } from '@config/env';
import { logger } from '@config/logger';
import {
  EMBROIDERY_REGIONS,
  EMBROIDERY_SIDES,
  REGION_GUIDE,
  type EmbroideryRegion,
  type EmbroiderySide,
} from '@models/embroideryasset';

/**
 * Names each piece cut from an embroidery sheet and says where it sits.
 *
 * The splitter finds the pieces for free but can only guess their position
 * from shape ("long and thin → border"), and a wrong position is exactly what
 * puts a shoulder motif on the hem. Here a small vision model looks at the
 * sheet with every piece numbered, plus small copies of the garment photos,
 * and returns position, side, a name and a one-line description.
 *
 * One text call, low-detail images: a fraction of a cent per collection,
 * against a full image generation for every wrongly placed try-on. If it
 * fails for any reason the caller keeps the splitter's guess.
 */

export interface PieceLabel {
  region: EmbroideryRegion;
  side: EmbroiderySide;
  name: string;
  workType?: string;
  description?: string;
}

interface LabelInput {
  sheet: Buffer;
  /** Each piece's box on the sheet, 0–1 of the sheet's width and height. */
  boxes: { x: number; y: number; width: number; height: number }[];
  /** Small copies of the source garment photos, base64. Optional. */
  references?: { image: string; label?: string }[];
  collectionName: string;
}

const SHEET_WIDTH = 1024;

/** The sheet with a numbered box drawn around every piece. */
async function annotate(sheet: Buffer, boxes: LabelInput['boxes']) {
  const resized = await sharp(sheet).resize({ width: SHEET_WIDTH, withoutEnlargement: true }).png().toBuffer();
  const { width = SHEET_WIDTH, height = SHEET_WIDTH } = await sharp(resized).metadata();

  const marks = boxes
    .map((b, i) => {
      const x = Math.round(b.x * width);
      const y = Math.round(b.y * height);
      const w = Math.round(b.width * width);
      const h = Math.round(b.height * height);
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#e00034" stroke-width="3"/>
        <rect x="${x}" y="${Math.max(0, y - 30)}" width="36" height="28" fill="#e00034"/>
        <text x="${x + 18}" y="${Math.max(0, y - 30) + 21}" font-size="20" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${i + 1}</text>`;
    })
    .join('');

  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`);
  return sharp(resized).composite([{ input: svg }]).jpeg({ quality: 82 }).toBuffer();
}

const asDataUrl = (base64: string, mime = 'image/jpeg') =>
  base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`;

function instructions(count: number, collectionName: string, references: LabelInput['references']) {
  return [
    `You are labelling ${count} embroidery pieces cut from ONE Indian ethnic garment (suit, kurti or anarkali).`,
    `The admin calls this embroidery "${collectionName}".`,
    'The FIRST image is a sheet of the extracted embroidery on white, every piece outlined in red and numbered.',
    'The sheet was laid out to mirror the garment seen from the front: neck pieces at the top, the left side of',
    'the garment (as seen in the photo) on the left, the right side on the right, borders along the bottom.',
    references?.length
      ? `The other ${references.length} image(s) are photos of the garment itself` +
        (references.some((r) => r.label) ? ` (${references.map((r, i) => `photo ${i + 1}: ${r.label || 'garment'}`).join('; ')})` : '') +
        '. Use them to see where each piece really sits and whether it appears on both sides.'
      : 'No garment photos are provided — judge from each piece\'s shape and its place on the sheet.',
    '',
    'For EVERY numbered piece decide:',
    `- region, exactly one of: ${EMBROIDERY_REGIONS.map((r) => `"${r}" (${REGION_GUIDE[r]})`).join('; ')}.`,
    `- side, exactly one of: ${EMBROIDERY_SIDES.map((s) => `"${s}"`).join(', ')}.`,
    '  "pair" = the same work appears on both the left and right side (most shoulders, sleeves and cuffs).',
    '  "left" / "right" = it appears on that side only, as seen in the photo. "center" = on the centre line.',
    '  Neckline, yoke, placket, waist, buti and hem pieces are always "center".',
    '- name: short and specific, Title Case, e.g. "Zari Paisley Shoulder Motif", "Mirror Work Hem Border".',
    '- workType: the technique, e.g. Zari, Resham (thread), Mirror, Sequin, Gota Patti, Zardozi, Beads, Cutdana, Aari.',
    '- description: one sentence on what it looks like and where it sits, e.g.',
    '  "Gold zari paisley motif with sequins, on both shoulders."',
    '',
    'Reply with JSON only, in this exact shape, one entry per number in order:',
    '{"pieces":[{"n":1,"region":"neckline","side":"center","name":"…","workType":"…","description":"…"}]}',
  ].join('\n');
}

export async function labelPieces(input: LabelInput): Promise<(PieceLabel | null)[] | null> {
  if (!env.openai.apiKey || input.boxes.length === 0) return null;

  try {
    const sheet = await annotate(input.sheet, input.boxes);
    const references = (input.references ?? []).slice(0, 4);

    const content = [
      { type: 'text', text: instructions(input.boxes.length, input.collectionName, references) },
      { type: 'image_url', image_url: { url: asDataUrl(sheet.toString('base64')), detail: 'high' } },
      ...references.map((ref) => ({
        type: 'image_url',
        image_url: { url: asDataUrl(ref.image), detail: 'low' },
      })),
    ];

    const response = await fetch(`${env.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openai.apiKey}`,
        ...(env.openai.organization ? { 'OpenAI-Organization': env.openai.organization } : {}),
      },
      body: JSON.stringify({
        model: env.openai.visionModel,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      logger.warn({ status: response.status, body: (await response.text()).slice(0, 300) }, 'Embroidery labelling failed');
      return null;
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    logger.info({ model: env.openai.visionModel, usage: json.usage }, 'Embroidery pieces labelled');

    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as {
      pieces?: { n?: number; region?: string; side?: string; name?: string; workType?: string; description?: string }[];
    };

    /* Keep only valid answers, by number; anything missing falls back to the
       splitter's guess in the caller. */
    return input.boxes.map((_, i) => {
      const entry = parsed.pieces?.find((p) => p.n === i + 1) ?? parsed.pieces?.[i];
      const region = EMBROIDERY_REGIONS.find((r) => r === entry?.region);
      const side = EMBROIDERY_SIDES.find((s) => s === entry?.side);
      if (!entry || !region) return null;

      return {
        region,
        side: side ?? 'center',
        name: entry.name?.trim().slice(0, 120) || '',
        workType: entry.workType?.trim().slice(0, 60) || undefined,
        description: entry.description?.trim().slice(0, 300) || undefined,
      };
    });
  } catch (error) {
    logger.warn({ err: (error as Error).message }, 'Embroidery labelling failed');
    return null;
  }
}
