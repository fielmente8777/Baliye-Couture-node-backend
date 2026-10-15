/**
 * Token usage and cost of OpenAI image calls.
 *
 * Every successful call prints one line to the backend console, e.g.
 *
 *   [OpenAI usage] extract · gpt-image-2.5-sunburst 1536x2048 high
 *     in 3,210 tok (image 2,980 · text 230) · out 6,240 tok · $0.2130
 *     | since restart: 4 images · $0.71
 *
 * The same numbers are stored on each ImageJob, so GET /api/v1/ai/usage can
 * total them by stage and by day. Costs are ESTIMATES from the per-token
 * prices below — OpenAI's billing page is the source of truth.
 */

import { logger } from './logger';

/** OpenAI's usage object for image calls. */
export interface OpenAIImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number; cached_tokens?: number };
  output_tokens_details?: { image_tokens?: number; text_tokens?: number };
}

/** What we keep per generation. */
export interface ImageUsage {
  model: string;
  size: string;
  quality: string;
  inputTokens: number;
  inputImageTokens: number;
  inputTextTokens: number;
  outputTokens: number;
  /** Estimated US dollars. null when OpenAI didn't report usage. */
  costUsd: number | null;
  /** How many OpenAI calls it took (retries after a 400 are not billed). */
  calls: number;
}

/** US$ per 1M tokens. */
interface Price {
  textIn: number;
  imageIn: number;
  imageOut: number;
}

/**
 * Published prices, per 1M tokens. gpt-image-2.5 Sunburst and Flare share
 * one price. Override any model with OPENAI_PRICE_TEXT_IN / _IMAGE_IN /
 * _IMAGE_OUT if OpenAI changes them or you use a model not listed here.
 */
const PRICES: Record<string, Price> = {
  'gpt-image-2.5-sunburst': { textIn: 5, imageIn: 8, imageOut: 30 },
  'gpt-image-2.5-flare': { textIn: 5, imageIn: 8, imageOut: 30 },
};

function priceFor(model: string): { price: Price; known: boolean } {
  const env = (name: string) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const base = PRICES[model] ?? PRICES[model.replace(/-\d{4}-\d{2}-\d{2}$/, '')];
  const price: Price = {
    textIn: env('OPENAI_PRICE_TEXT_IN') ?? base?.textIn ?? 5,
    imageIn: env('OPENAI_PRICE_IMAGE_IN') ?? base?.imageIn ?? 8,
    imageOut: env('OPENAI_PRICE_IMAGE_OUT') ?? base?.imageOut ?? 30,
  };
  const overridden = Boolean(env('OPENAI_PRICE_IMAGE_OUT'));
  return { price, known: Boolean(base) || overridden };
}

export function toImageUsage(
  raw: OpenAIImageUsage | undefined,
  meta: { model: string; size: string; quality: string },
): ImageUsage {
  const inputTokens = raw?.input_tokens ?? 0;
  const inputImageTokens = raw?.input_tokens_details?.image_tokens ?? 0;
  const inputTextTokens = raw?.input_tokens_details?.text_tokens ?? Math.max(0, inputTokens - inputImageTokens);
  const outputTokens = raw?.output_tokens ?? 0;

  let costUsd: number | null = null;
  if (raw) {
    const { price } = priceFor(meta.model);
    costUsd =
      (inputTextTokens * price.textIn + inputImageTokens * price.imageIn + outputTokens * price.imageOut) / 1_000_000;
  }

  return { ...meta, inputTokens, inputImageTokens, inputTextTokens, outputTokens, costUsd, calls: 1 };
}

/* Running totals since the backend started — handy while testing. */
const session = { images: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };

export const sessionUsage = () => ({ ...session, costUsd: Number(session.costUsd.toFixed(4)) });

const n = (value: number) => value.toLocaleString('en-US');

/** One readable line per generation, printed to the backend console. */
export function logImageUsage(label: string, usage: ImageUsage) {
  session.images += 1;
  session.inputTokens += usage.inputTokens;
  session.outputTokens += usage.outputTokens;
  session.costUsd += usage.costUsd ?? 0;

  const { known } = priceFor(usage.model);
  const cost =
    usage.costUsd === null
      ? 'cost unknown (OpenAI sent no usage)'
      : `$${usage.costUsd.toFixed(4)}${known ? '' : ' (estimate — set OPENAI_PRICE_* for this model)'}`;

  const line =
    `[OpenAI usage] ${label} · ${usage.model} ${usage.size} ${usage.quality}\n` +
    `  in ${n(usage.inputTokens)} tok (image ${n(usage.inputImageTokens)} · text ${n(usage.inputTextTokens)})` +
    ` · out ${n(usage.outputTokens)} tok · ${cost}\n` +
    `  | since restart: ${session.images} image${session.images === 1 ? '' : 's'} · $${session.costUsd.toFixed(2)}`;

  /* console.log so it's visible even when the JSON logger is quiet. */
  console.log(line);
  logger.info({ label, usage, session: sessionUsage() }, 'OpenAI image usage');
}
