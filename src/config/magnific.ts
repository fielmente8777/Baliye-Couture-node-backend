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

/**
 * Flux Kontext Pro: reference image + prompt in, edited image out.
 *
 * Chosen over Mystic because Mystic is text-to-image only — it cannot preserve
 * the garment's cut from the uploaded photo, which is the entire point.
 */
export async function generateVariant(input: {
  referenceImage: string; // base64, no data: prefix
  prompt: string;
  webhookUrl?: string;
}): Promise<MagnificTask> {
  const res = await call<{ data: MagnificTask }>(
    "/text-to-image/flux-kontext-pro",
    "POST",
    {
      prompt: input.prompt,
      reference_images: [input.referenceImage],
      aspect_ratio: "traditional_3_4",
      ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    },
  );
  return res.data;
}

export async function getVariantTask(taskId: string): Promise<MagnificTask> {
  const res = await call<{ data: MagnificTask }>(
    `/text-to-image/flux-kontext-pro/${taskId}`,
    "GET",
  );
  return res.data;
}
