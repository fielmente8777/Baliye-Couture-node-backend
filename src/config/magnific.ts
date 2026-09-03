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
    throw new Error(`Magnific ${response.status}: ${detail.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

/** Flux 2 Klein takes up to four reference images in numbered slots. */
const MODEL_PATH = "/text-to-image/flux-2-klein";

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
export async function generateWithReferences(
  input: GenerateInput,
): Promise<MagnificTask> {
  if (input.images.length === 0) {
    throw new Error("At least one reference image is required");
  }

  if (input.images.length > 4) {
    throw new Error("Flux 2 Klein accepts at most 4 reference images");
  }

  const [first, second, third, fourth] = input.images;

  const res = await call<{ data: MagnificTask }>(
    MODEL_PATH,
    "POST",
    {
      prompt: input.prompt,

      input_image: first,

      ...(second ? { input_image_2: second } : {}),
      ...(third ? { input_image_3: third } : {}),
      ...(fourth ? { input_image_4: fourth } : {}),

      aspect_ratio: input.aspectRatio ?? "traditional_3_4",

      resolution: "2k",

      output_format: input.outputFormat ?? "png",

      ...(input.webhookUrl
        ? { webhook_url: input.webhookUrl }
        : {}),
    },
  );

  return res.data;
}

export async function getTask(taskId: string): Promise<MagnificTask> {
  const res = await call<{ data: MagnificTask }>(
    `${MODEL_PATH}/${taskId}`,
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
