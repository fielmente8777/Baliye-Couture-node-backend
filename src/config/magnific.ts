/**
 * Magnific (formerly Freepik) API client.
 *
 * Every AI endpoint is asynchronous: POST returns a task_id, and the result
 * arrives by polling GET /{task-id} or via webhook. Nothing here blocks on a
 * generation — they take 10-60s and would hold an Express worker open.
 */

import { env } from "./env";
import { logger } from "./logger";

const BASE_URL = "https://api.magnific.com/v1/ai";

export type MagnificStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface MagnificTask {
  task_id: string;
  status: MagnificStatus;
  generated: string[];
}

async function call<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  if (!env.magnific.apiKey)
    throw new Error("MAGNIFIC_API_KEY is not configured");

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "x-magnific-api-key": env.magnific.apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const detail = await response.text();
    logger.error(
      { path, status: response.status, detail },
      "Magnific request failed",
    );
    /* 600 chars: a Magnific validation error lists every bad field, and
       truncating at 200 hides all but the first. */
    throw new Error(`Magnific ${response.status}: ${detail.slice(0, 600)}`);
  }

  return (await response.json()) as T;
}

/** Flux 2 Klein takes up to four reference images in numbered slots. */
/**
 * Which Magnific model to call. Switchable with MAGNIFIC_MODEL because the two
 * behave very differently on this workload:
 *
 *   flux-2-klein           four references in numbered slots. Regenerates the
 *                          whole frame, which is why extraction drifts and
 *                          invents motifs.
 *   nano-banana-pro-flash  Gemini 3.1 Flash Image, up to 14 references, and
 *                          each one carries its own text label — so the model
 *                          is TOLD which image is the garment and which is the
 *                          motif source instead of inferring it from position.
 */
export type MagnificModel = "flux-2-klein" | "nano-banana-pro-flash";

/**
 * The two models name the same shapes differently, and both validate strictly:
 * Flux wants "traditional_3_4" and lowercase "2k", Nano Banana wants "3:4" and
 * uppercase "2K". Sending the wrong vocabulary is a 400 before any generation
 * starts, so the mapping lives here rather than at each call site.
 */
const ASPECT: Record<MagnificModel, Record<string, string>> = {
  "flux-2-klein": {
    traditional_3_4: "traditional_3_4",
    square_1_1: "square_1_1",
  },
  "nano-banana-pro-flash": {
    traditional_3_4: "3:4",
    square_1_1: "1:1",
  },
};

const RESOLUTION: Record<MagnificModel, string> = {
  "flux-2-klein": "2k",
  "nano-banana-pro-flash": "2K",
};

const modelPath = () => `/text-to-image/${env.magnific.model}`;

/**
 * Magnific validates webhook_url strictly, and a half-set env var — a bare
 * host, a placeholder, or trailing whitespace — fails the entire request with
 * a 400 before any generation starts. Send it only when it actually parses.
 */
export const resolveWebhookUrl = (): string | undefined => {
  const raw = env.magnific.webhookUrl?.trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw);

    /* Magnific's servers cannot reach a developer machine; sending localhost
       means the task completes and the callback is silently lost. */
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      logger.warn("MAGNIFIC_WEBHOOK_URL points at localhost — ignoring it");
      return undefined;
    }

    return url.toString();
  } catch {
    logger.warn({ raw }, "MAGNIFIC_WEBHOOK_URL is not a valid URL — ignoring it");
    return undefined;
  }
};

export interface GenerateInput {
  /**
   * Per-image descriptions, index-matched to `images`. Used by Nano Banana,
   * which accepts a label alongside each reference; ignored by Flux, which has
   * no equivalent field.
   */
  referenceLabels?: string[];
  images: string[];
  prompt: string;
  aspectRatio?: "traditional_3_4" | "square_1_1" | "vertical_1_2";
  webhookUrl?: string;
  outputFormat?: "png" | "jpeg";
}

/**
 * Flux 2 Klein — the only Magnific model that accepts multiple references,
 * which is what the two-image stages require: a target garment plus a motif
 * sheet. Single-reference models can describe embroidery but cannot copy it.
 */
/**
 * Nano Banana rejects prompts over 3000 characters outright. Truncating on a
 * sentence boundary is better than a 400: the closing sentences of these
 * prompts are the least load-bearing, and a slightly shortened prompt still
 * generates. Logged so a template that has grown too long gets noticed.
 */
const capPrompt = (prompt: string, limit = 3000) => {
  if (prompt.length <= limit) return prompt;

  const cut = prompt.slice(0, limit);
  const lastStop = cut.lastIndexOf(". ");
  const trimmed = lastStop > limit * 0.7 ? cut.slice(0, lastStop + 1) : cut;

  logger.warn(
    { original: prompt.length, sent: trimmed.length },
    "Prompt exceeded the provider limit and was truncated",
  );

  return trimmed;
};

export async function generateWithReferences(
  input: GenerateInput,
): Promise<MagnificTask> {
  if (input.images.length === 0)
    throw new Error("At least one reference image is required");

  /**
   * Nano Banana takes an array of labelled references. Naming each image is
   * the reason to prefer it here: "the base garment" and "the embroidery motif
   * source" are stated outright rather than implied by slot order, which is
   * exactly the ambiguity that made stage 2 unreliable.
   */
  if (env.magnific.model === "nano-banana-pro-flash") {
    const res = await call<{ data: MagnificTask }>(modelPath(), "POST", {
      prompt: capPrompt(input.prompt),
      reference_images: input.images.map((image, index) => ({
        image,
        text: input.referenceLabels?.[index] ?? `Reference ${index + 1}`,
        mime_type: "image/jpeg",
      })),
      aspect_ratio:
        ASPECT["nano-banana-pro-flash"][input.aspectRatio ?? "traditional_3_4"],
      resolution: RESOLUTION["nano-banana-pro-flash"],
      ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    });

    return res.data;
  }

  if (input.images.length > 4)
    throw new Error("Flux 2 Klein accepts at most 4 reference images");

  const [first, second, third, fourth] = input.images;

  const res = await call<{ data: MagnificTask }>(modelPath(), "POST", {
    prompt: input.prompt,
    input_image: first,
    ...(second ? { input_image_2: second } : {}),
    ...(third ? { input_image_3: third } : {}),
    ...(fourth ? { input_image_4: fourth } : {}),
    aspect_ratio: ASPECT["flux-2-klein"][input.aspectRatio ?? "traditional_3_4"],
    resolution: RESOLUTION["flux-2-klein"],
    output_format: input.outputFormat ?? "png",
    ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
  });

  return res.data;
}

export async function getTask(taskId: string): Promise<MagnificTask> {
  const res = await call<{ data: MagnificTask }>(
    `${modelPath()}/${taskId}`,
    "GET",
  );
  return res.data;
}

/** Kept so the older product-variant endpoints keep working. */
export async function generateVariant(input: {
  referenceImage: string;
  prompt: string;
  webhookUrl?: string;
}): Promise<MagnificTask> {
  return generateWithReferences({
    images: [input.referenceImage],
    prompt: input.prompt,
    webhookUrl: input.webhookUrl,
  });
}

export const getVariantTask = getTask;
