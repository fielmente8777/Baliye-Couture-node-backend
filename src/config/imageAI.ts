/**
 * Image AI provider — OpenAI Images API (gpt-image models).
 *
 * Replaces Magnific. The rest of the backend still talks in "tasks": start a
 * generation, get a task_id back at once, poll it until COMPLETED or FAILED.
 * OpenAI's edit endpoint is a single long request instead (30–90 s), so this
 * module runs each request in the background and keeps its result in memory
 * under a task id. Callers (motifTransfer, designRender, imageGeneration) did
 * not have to change shape.
 *
 * What this module guarantees to callers:
 *   - Every input may be base64, a data: URL, or an http(s) URL (our own
 *     /uploads files are read from disk).
 *   - With `preserveFrame`, the output lines up pixel-for-pixel with the first
 *     input image, whatever output sizes the model supports: the input is
 *     padded to the output shape before sending and the output cropped back.
 *     The blend step's restore/drift check depends on that alignment.
 *   - Results are saved to our own storage; URLs never expire.
 *   - Failures carry a readable reason (bad key, unverified organisation,
 *     no credit, safety filter…), which the studio shows as-is.
 */

import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

import { env } from './env';
import { saveGeneratedImage } from './imageStore';
import { logger } from './logger';
import { ImageUsage, OpenAIImageUsage, logImageUsage, toImageUsage } from './imageUsage';
import { ApiError } from '../utils/apiError';

/* ------------------------------------------------------------------------ */
/* Public types                                                              */
/* ------------------------------------------------------------------------ */

export type TaskStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface ImageTask {
  task_id: string;
  status: TaskStatus;
  /** URLs in our own storage. */
  generated: string[];
  /** Why it failed, in words an operator can act on. */
  error?: string;
  /** Tokens and estimated cost, once completed. */
  usage?: ImageUsage;
}

export interface GenerateInput {
  /** base64 (no prefix), a data: URL, or an http(s) URL. Up to 16. */
  images: string[];
  /** One line per image, in order — folded into the prompt. */
  referenceLabels?: string[];
  prompt: string;
  /** Output shape when not preserving the frame. Default 3:4 portrait. */
  aspectRatio?: 'traditional_3_4' | 'square_1_1' | 'vertical_1_2';
  /** Output must line up pixel-for-pixel with images[0] (blend / edit jobs). */
  preserveFrame?: boolean;
  /**
   * Where the model may paint, over images[0]: single-channel, 255 = edit.
   * Sent to OpenAI as its mask (transparent = edit).
   */
  mask?: { data: Buffer; width: number; height: number };
  /** low | medium | high | xhigh | max | auto. Defaults to OPENAI_IMAGE_QUALITY. */
  quality?: string;
  /** Magnific-only; ignored. OpenAI has no image webhooks. */
  webhookUrl?: string;
  /** Always PNG now; kept for call-site compatibility. */
  outputFormat?: 'png' | 'jpeg';
  /** Shown in the usage log: "extract", "apply", "render", "variant". */
  label?: string;
}

/* ------------------------------------------------------------------------ */
/* Configuration                                                             */
/* ------------------------------------------------------------------------ */

const MAX_IMAGES = 16;
/** Longest edge sent. Larger costs more upload time, adds no usable detail. */
const MAX_INPUT_EDGE = 2048;
/** Longest edge requested when the model accepts custom sizes. */
const OUTPUT_LONG_EDGE = 2048;
/** Sizes every gpt-image model accepts. */
const FIXED_SIZES: Array<[number, number]> = [
  [1024, 1024],
  [1536, 1024],
  [1024, 1536],
];

const ASPECT: Record<NonNullable<GenerateInput['aspectRatio']>, number> = {
  traditional_3_4: 3 / 4,
  square_1_1: 1,
  vertical_1_2: 1 / 2,
};

/* Learned per model at runtime, so one 400 isn't repeated on every call. */
const noCustomSizes = new Set<string>();
const noInputFidelity = new Set<string>();

function assertConfigured() {
  if (!env.openai.apiKey) {
    throw new ApiError(500, 'OPENAI_API_KEY is not set on the server — add it to .env and restart');
  }
}

const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${env.openai.apiKey}`,
  ...(env.openai.organization ? { 'OpenAI-Organization': env.openai.organization } : {}),
});

/* ------------------------------------------------------------------------ */
/* Task store                                                                */
/* ------------------------------------------------------------------------ */

type StoredTask = ImageTask & { finishedAt?: number };

const tasks = new Map<string, StoredTask>();
const TASK_TTL_MS = 3 * 60 * 60 * 1000;

/* Finished tasks are only needed until the job document has been updated. */
setInterval(() => {
  const cutoff = Date.now() - TASK_TTL_MS;
  for (const [id, task] of tasks) if (task.finishedAt && task.finishedAt < cutoff) tasks.delete(id);
}, 10 * 60 * 1000).unref();

type SettledHandler = (task: ImageTask) => Promise<void> | void;
let settledHandler: SettledHandler | null = null;

/**
 * Called once per task when it finishes — replaces Magnific's webhook.
 * services/imageTasks.ts registers the handler that updates the ImageJob.
 */
export function onTaskSettled(handler: SettledHandler) {
  settledHandler = handler;
}

/* Tier-1 OpenAI accounts get 5 images/minute; a small queue keeps a studio
   run of 4 variations from tripping the limit all at once. */
let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  const max = Math.max(1, env.openai.concurrency);
  if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

/* ------------------------------------------------------------------------ */
/* Image loading and shaping                                                 */
/* ------------------------------------------------------------------------ */

async function loadSource(source: string): Promise<Buffer> {
  const value = source.trim();

  if (value.startsWith('http://') || value.startsWith('https://')) {
    /* Our own files: read from disk rather than over the network — works
       behind ngrok, localhost or a private network alike. */
    const marker = '/uploads/';
    const index = value.indexOf(marker);
    if (index !== -1) {
      const root = path.resolve(process.cwd(), env.upload.dir);
      const relative = decodeURIComponent(value.slice(index + marker.length).split(/[?#]/)[0]);
      const local = path.resolve(root, relative);
      if (local.startsWith(root + path.sep)) {
        try {
          return await readFile(local);
        } catch {
          /* not on this server — fetch it */
        }
      }
    }

    const response = await fetch(value, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw ApiError.badRequest(`Could not load a reference image (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  return Buffer.from(value.replace(/^data:[^;]+;base64,/, ''), 'base64');
}

/** PNG, upright, longest edge ≤ 2048. PNG keeps fine thread and bead detail. */
async function toPng(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: MAX_INPUT_EDGE, height: MAX_INPUT_EDGE, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw ApiError.badRequest('One of the images could not be read — upload it as JPG or PNG');
  }
}

async function dims(png: Buffer) {
  const meta = await sharp(png).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** A size with this aspect, both sides divisible by 16 (custom-size models). */
function customSize(aspect: number): [number, number] {
  const a = Math.min(3, Math.max(1 / 3, aspect));
  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
  return a >= 1
    ? [OUTPUT_LONG_EDGE, round16(OUTPUT_LONG_EDGE / a)]
    : [round16(OUTPUT_LONG_EDGE * a), OUTPUT_LONG_EDGE];
}

function closestFixedSize(aspect: number): [number, number] {
  return FIXED_SIZES.reduce((best, size) =>
    Math.abs(Math.log(size[0] / size[1] / aspect)) < Math.abs(Math.log(best[0] / best[1] / aspect)) ? size : best,
  );
}

function pickSize(model: string, aspect: number): [number, number] {
  return noCustomSizes.has(model) ? closestFixedSize(aspect) : customSize(aspect);
}

/** Average colour of the image edges — what padding is filled with. */
async function edgeColour(png: Buffer, width: number, height: number) {
  const strip = async (left: number, top: number, w: number, h: number) => {
    const { data } = await sharp(png)
      .extract({ left, top, width: w, height: h })
      .removeAlpha()
      .resize(1, 1)
      .raw()
      .toBuffer({ resolveWithObject: true });
    return [data[0], data[1], data[2]];
  };
  const samples = await Promise.all([
    strip(0, 0, width, 1),
    strip(0, height - 1, width, 1),
    strip(0, 0, 1, height),
    strip(width - 1, 0, 1, height),
  ]);
  const avg = (c: number) => Math.round(samples.reduce((s, p) => s + p[c], 0) / samples.length);
  return { r: avg(0), g: avg(1), b: avg(2) };
}

interface Framed {
  /** Exactly width×height of the requested output. */
  image: Buffer;
  mask?: Buffer;
  /** Where the original sits inside the output, in output pixels. */
  box: { left: number; top: number; width: number; height: number };
  original: { width: number; height: number };
}

/**
 * Pads images[0] (and its mask) to the output's shape, then scales to the
 * exact output size. Nothing is cropped, so the model sees the whole garment,
 * and the returned box lets the output be cut back to the original frame.
 */
async function frameForOutput(
  primary: Buffer,
  mask: GenerateInput['mask'] | undefined,
  [outW, outH]: [number, number],
): Promise<Framed> {
  const { width, height } = await dims(primary);
  const target = outW / outH;

  let padX = 0;
  let padY = 0;
  if (width / height > target) padY = Math.round(width / target) - height;
  else padX = Math.round(height * target) - width;

  const extend = {
    top: Math.floor(padY / 2),
    bottom: Math.ceil(padY / 2),
    left: Math.floor(padX / 2),
    right: Math.ceil(padX / 2),
  };
  const paddedW = width + padX;
  const paddedH = height + padY;

  /* Separate passes: sharp always applies extend AFTER resize within one
     pipeline, which would pad the already-resized image. */
  const background = await edgeColour(primary, width, height);
  const padded = await sharp(primary).removeAlpha().extend({ ...extend, background }).png().toBuffer();
  const image = await sharp(padded).resize(outW, outH, { fit: 'fill' }).png().toBuffer();

  let maskPng: Buffer | undefined;
  if (mask) {
    /* OpenAI masks: transparent = may edit, opaque = keep. Ours: 255 = edit. */
    const editable = await sharp(mask.data, { raw: { width: mask.width, height: mask.height, channels: 1 } })
      .resize(width, height, { fit: 'fill' })
      .extractChannel(0)
      .raw()
      .toBuffer();
    const alpha = Buffer.alloc(editable.length);
    for (let i = 0; i < editable.length; i += 1) alpha[i] = 255 - editable[i];

    const rgba = await sharp({
      create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .joinChannel(alpha, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
    const paddedMask = await sharp(rgba)
      .extend({ ...extend, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    maskPng = await sharp(paddedMask).resize(outW, outH, { fit: 'fill' }).png().toBuffer();
  }

  const sx = outW / paddedW;
  const sy = outH / paddedH;
  return {
    image,
    mask: maskPng,
    box: {
      left: Math.round(extend.left * sx),
      top: Math.round(extend.top * sy),
      width: Math.min(outW, Math.round(width * sx)),
      height: Math.min(outH, Math.round(height * sy)),
    },
    original: { width, height },
  };
}

/** Cuts a framed output back to the original input's frame and size. */
async function unframe(output: Buffer, framed: Framed, [outW, outH]: [number, number]) {
  const { box, original } = framed;
  const left = Math.max(0, Math.min(box.left, outW - 1));
  const top = Math.max(0, Math.min(box.top, outH - 1));
  /* Three passes: one sharp pipeline holds a single resize, so chaining
     resize → extract → resize would silently drop the first resize. */
  const sized = await sharp(output).resize(outW, outH, { fit: 'fill' }).png().toBuffer();
  const cropped = await sharp(sized)
    .extract({
      left,
      top,
      width: Math.min(box.width, outW - left),
      height: Math.min(box.height, outH - top),
    })
    .png()
    .toBuffer();
  return sharp(cropped).resize(original.width, original.height, { fit: 'fill' }).png().toBuffer();
}

/* ------------------------------------------------------------------------ */
/* OpenAI request                                                            */
/* ------------------------------------------------------------------------ */

interface OpenAIErrorBody {
  error?: { message?: string; type?: string; code?: string | null; param?: string | null };
}

class OpenAIError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    public param: string | undefined,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

const pngBlob = (buffer: Buffer) => new Blob([new Uint8Array(buffer)], { type: 'image/png' });

async function callEdits(args: {
  model: string;
  prompt: string;
  images: Buffer[];
  mask?: Buffer;
  size: [number, number];
  quality: string;
  inputFidelity: boolean;
}): Promise<{ images: Buffer[]; usage: ImageUsage }> {
  const form = new FormData();
  form.append('model', args.model);
  form.append('prompt', args.prompt);

  const field = args.images.length === 1 ? 'image' : 'image[]';
  args.images.forEach((image, i) => form.append(field, pngBlob(image), `image-${i + 1}.png`));
  if (args.mask) form.append('mask', pngBlob(args.mask), 'mask.png');

  form.append('size', `${args.size[0]}x${args.size[1]}`);
  form.append('quality', args.quality);
  form.append('output_format', 'png');
  form.append('n', '1');
  if (args.inputFidelity) form.append('input_fidelity', 'high');
  if (env.openai.moderation) form.append('moderation', env.openai.moderation);

  let response: Response;
  try {
    response = await fetch(`${env.openai.baseUrl}/images/edits`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: AbortSignal.timeout(env.openai.timeoutMs),
    });
  } catch (error) {
    const timedOut = (error as Error).name === 'TimeoutError';
    throw new OpenAIError(
      0,
      timedOut ? 'timeout' : 'network',
      undefined,
      timedOut
        ? `OpenAI took longer than ${Math.round(env.openai.timeoutMs / 1000)}s`
        : 'Could not reach OpenAI — network error from the server',
    );
  }

  const text = await response.text();

  if (!response.ok) {
    let body: OpenAIErrorBody = {};
    try {
      body = JSON.parse(text) as OpenAIErrorBody;
    } catch {
      /* not JSON */
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new OpenAIError(
      response.status,
      body.error?.code ?? body.error?.type ?? undefined,
      body.error?.param ?? undefined,
      body.error?.message || text.slice(0, 400) || response.statusText,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }

  const payload = JSON.parse(text) as {
    data?: { b64_json?: string; url?: string }[];
    usage?: OpenAIImageUsage;
    size?: string;
    quality?: string;
  };
  const usage = toImageUsage(payload.usage, {
    model: args.model,
    size: payload.size ?? `${args.size[0]}x${args.size[1]}`,
    quality: payload.quality ?? args.quality,
  });

  const out: Buffer[] = [];
  for (const item of payload.data ?? []) {
    if (item.b64_json) out.push(Buffer.from(item.b64_json, 'base64'));
    else if (item.url) out.push(await loadSource(item.url));
  }
  if (out.length === 0) throw new OpenAIError(502, 'empty', undefined, 'OpenAI returned no image');
  return { images: out, usage };
}

/** Plain-language reason for the studio and the logs. */
function explain(error: unknown, model: string): string {
  if (error instanceof ApiError) return error.message;
  if (!(error instanceof OpenAIError)) return (error as Error)?.message || 'Image generation failed';

  const { status, code, message } = error;
  if (status === 401) return 'OpenAI rejected the API key — check OPENAI_API_KEY on the server.';
  if (status === 403 && /verif/i.test(message)) {
    return 'Your OpenAI organisation must be verified to use image models: platform.openai.com → Settings → Organization → General → Verify Organization. It can take a few minutes to apply.';
  }
  if (status === 404 || code === 'model_not_found') {
    return `Model "${model}" isn't available to this API key — set OPENAI_IMAGE_MODEL to a model your account can use (e.g. gpt-image-2).`;
  }
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') {
    return 'OpenAI credit is used up — add credit at platform.openai.com → Settings → Billing.';
  }
  if (status === 429) return 'OpenAI rate limit reached — wait a minute and try again.';
  if (code === 'moderation_blocked' || /safety system|moderation/i.test(message)) {
    return "OpenAI's safety filter blocked this request. Try a different photo (a garment on a mannequin works best).";
  }
  if (code === 'timeout') return `${message} — try again, or lower OPENAI_IMAGE_QUALITY.`;
  if (status >= 500 || status === 0) return `OpenAI is having problems (${message}) — try again shortly.`;
  return `OpenAI rejected the request: ${message}`;
}

/** Prompt with the per-image labels folded in (OpenAI has no label field). */
function buildPrompt(input: GenerateInput): string {
  const labels =
    input.referenceLabels?.length || input.images.length > 1
      ? 'Input images, in order:\n' +
        input.images
          .map((_, i) => `Image ${i + 1}: ${input.referenceLabels?.[i]?.trim() || 'reference image'}`)
          .join('\n') +
        '\n\n'
      : '';

  const frame = input.preserveFrame
    ? '\n\nKeep the exact framing of image 1: same crop, scale, position and background. Do not zoom, crop, rotate or recompose.'
    : '';
  const mask = input.mask ? ' Only change the area inside the mask.' : '';

  return `${labels}${input.prompt.trim()}${frame}${mask}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One generation, with the adjustments a model may need: no custom sizes
 * (fall back to fixed ones), no input_fidelity (drop it), rate limits and
 * transient errors (wait and retry).
 */
async function generate(input: GenerateInput, pngs: Buffer[]): Promise<{ images: Buffer[]; usage: ImageUsage }> {
  const model = env.openai.imageModel;
  const quality = input.quality || env.openai.quality;
  const prompt = buildPrompt(input);

  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let size: [number, number];
    let framed: Framed | undefined;
    let images = pngs;

    if (input.preserveFrame) {
      const { width, height } = await dims(pngs[0]);
      size = pickSize(model, width / height);
      framed = await frameForOutput(pngs[0], input.mask, size);
      images = [framed.image, ...pngs.slice(1)];
    } else {
      size = pickSize(model, ASPECT[input.aspectRatio ?? 'traditional_3_4']);
    }

    try {
      const result = await callEdits({
        model,
        prompt,
        images,
        mask: framed?.mask,
        size,
        quality,
        inputFidelity: !noInputFidelity.has(model),
      });
      const outputs = framed
        ? await Promise.all(result.images.map((o) => unframe(o, framed!, size)))
        : result.images;
      return { images: outputs, usage: { ...result.usage, calls: attempt } };
    } catch (error) {
      lastError = error;
      if (!(error instanceof OpenAIError)) throw error;

      const about = `${error.param ?? ''} ${error.message}`;

      if (error.status === 400 && /input_fidelity/i.test(about) && !noInputFidelity.has(model)) {
        noInputFidelity.add(model);
        logger.warn({ model }, 'Model does not accept input_fidelity — retrying without it');
        continue;
      }
      if (error.status === 400 && /\bsize\b/i.test(about) && !noCustomSizes.has(model)) {
        noCustomSizes.add(model);
        logger.warn({ model }, 'Model does not accept custom sizes — using the nearest standard size');
        continue;
      }
      const transient =
        (error.status === 429 && error.code !== 'insufficient_quota') ||
        error.status >= 500 ||
        error.code === 'network';
      if (transient && attempt < 4) {
        const wait = error.retryAfterMs ?? 8_000 * attempt;
        logger.warn({ status: error.status, wait }, 'OpenAI busy — retrying');
        await sleep(Math.min(wait, 60_000));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

/* ------------------------------------------------------------------------ */
/* Public API — same shape the services already use                          */
/* ------------------------------------------------------------------------ */

/**
 * Starts a generation and returns its task at once. Inputs are loaded and
 * checked first, so a bad photo fails the HTTP request instead of the job.
 */
export async function generateWithReferences(input: GenerateInput): Promise<ImageTask> {
  assertConfigured();
  if (input.images.length === 0) throw ApiError.badRequest('At least one reference image is required');
  if (input.images.length > MAX_IMAGES) {
    throw ApiError.badRequest(`Send at most ${MAX_IMAGES} images per generation`);
  }

  const pngs = await Promise.all(input.images.map(async (image) => toPng(await loadSource(image))));

  const task: StoredTask = { task_id: `oa_${randomUUID()}`, status: 'IN_PROGRESS', generated: [] };
  tasks.set(task.task_id, task);

  void (async () => {
    try {
      const { images: outputs, usage } = await withSlot(() => generate(input, pngs));
      const urls: string[] = [];
      for (const output of outputs) urls.push(await saveGeneratedImage(output.toString('base64'), 'png'));
      task.status = 'COMPLETED';
      task.generated = urls;
      task.usage = usage;
      logImageUsage(input.label ?? 'image', usage);
    } catch (error) {
      task.status = 'FAILED';
      task.error = explain(error, env.openai.imageModel);
      logger.error({ taskId: task.task_id, err: error, reason: task.error }, 'Image generation failed');
    }
    task.finishedAt = Date.now();

    try {
      await settledHandler?.({ ...task });
    } catch (error) {
      logger.error({ err: error, taskId: task.task_id }, 'Post-processing a finished image task failed');
    }
  })();

  return { ...task };
}

/** Current state of a task. Unknown ids were lost to a restart (or are Magnific's). */
export async function getTask(taskId: string): Promise<ImageTask> {
  const task = tasks.get(taskId);
  if (task) {
    return { task_id: task.task_id, status: task.status, generated: task.generated, error: task.error, usage: task.usage };
  }

  return {
    task_id: taskId,
    status: 'FAILED',
    generated: [],
    error: taskId.startsWith('oa_')
      ? 'The server restarted while this image was generating — run it again.'
      : 'This job was started with the previous image provider — run it again.',
  };
}

/**
 * Confirms the key works and the model is available — without generating
 * (and paying for) an image. Backs GET /api/v1/ai/status.
 */
export async function checkImageProvider() {
  const model = env.openai.imageModel;
  if (!env.openai.apiKey) {
    return { provider: 'openai', configured: false, model, hint: 'Set OPENAI_API_KEY in .env and restart' };
  }

  try {
    const response = await fetch(`${env.openai.baseUrl}/models/${encodeURIComponent(model)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      return {
        provider: 'openai',
        configured: true,
        model,
        available: true,
        quality: env.openai.quality,
        renderQuality: env.openai.renderQuality,
        hint: 'Image generation also needs a verified organisation; if the first generation fails with a verification message, verify at platform.openai.com → Settings → Organization.',
      };
    }
    const body = (await response.json().catch(() => ({}))) as OpenAIErrorBody;
    const error = new OpenAIError(
      response.status,
      body.error?.code ?? undefined,
      undefined,
      body.error?.message ?? response.statusText,
    );
    return { provider: 'openai', configured: true, model, available: false, error: explain(error, model) };
  } catch (error) {
    return { provider: 'openai', configured: true, model, available: false, error: (error as Error).message };
  }
}
