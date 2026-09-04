/**
 * Two-stage embroidery transfer.
 *
 * Reproduces the Magnific Spaces canvas in code:
 *
 *   stage 1  donor garment ──► isolated motif sheet on white
 *   stage 2  target garment + motif sheet ──► finished garment
 *
 * Stage 1 exists because copying trim directly from a photographed garment
 * fails: the model sees the donor's fabric colour and drags it across too.
 * Flattening the motifs onto white first strips everything except the trim,
 * which is what makes stage 2 faithful.
 *
 * Both stages are asynchronous. Stage 2 cannot be queued until stage 1 has an
 * image, so the caller runs extract, waits, then calls apply.
 */

import { randomUUID } from "crypto";

import {
  generateWithReferences,
  getTask,
  resolveWebhookUrl,
} from "@config/magnific";
import {
  EXTRACT_MOTIFS_PROMPT,
  applyMotifSheetsPrompt,
  applyMotifsPrompt,
  extractFromViewsPrompt,
  extractRegionPrompt,
  type MotifRegion,
} from "@config/prompts";
import { ImageJobModel, IImageJob } from "@models/imagejob";
import { ApiError } from "@utils/apiError";

const webhook = resolveWebhookUrl;

/**
 * Stage 1 — isolate the trim from a donor garment.
 *
 * `region` narrows the request to a single border, which is markedly more
 * faithful than asking for a whole sheet: the operator crops to the neckline,
 * runs it, then crops to a cuff and runs it again. Omitting `region` keeps the
 * old whole-garment behaviour.
 */
export interface DonorViewInput {
  /** Base64 without a data: prefix. */
  image: string;
  /** What this photograph shows: "front", "left sleeve", "hem detail". */
  label?: string;
}

/**
 * Stage 1 — isolate the trim from one or more photographs of a garment.
 *
 * Several angles of the same dress give a far more complete sheet than one:
 * a front shot rarely shows the cuff clearly and never shows the back. The
 * prompt states explicitly that these are one garment, so a border appearing
 * in two photographs is extracted once rather than twice.
 *
 * `region` narrows a single cropped view to one border, which remains the most
 * faithful mode when you only care about the neckline.
 */
export async function extractMotifs(
  views: DonorViewInput[],
  adminId?: string,
  runId = randomUUID(),
  region?: MotifRegion,
) {
  if (views.length === 0) {
    throw ApiError.badRequest("Upload at least one photograph of the garment");
  }

  const labelled = views.map((view, index) => ({
    ...view,
    label: view.label?.trim() || `view ${index + 1} of the garment`,
  }));

  /* A single cropped region gets the tighter single-piece prompt; several
     angles get the multi-view one that de-duplicates repeated borders. */
  const prompt =
    labelled.length === 1
      ? region
        ? extractRegionPrompt(region)
        : EXTRACT_MOTIFS_PROMPT
      : extractFromViewsPrompt(labelled.map((view) => ({ label: view.label })));

  const task = await generateWithReferences({
    images: labelled.map((view) => view.image),
    referenceLabels: labelled.map(
      (view) => `Photograph of the same garment: ${view.label}.`,
    ),
    prompt,
    /*
     * Portrait canvas gives long embroidery borders more usable space. The
     * model must preserve the visible embroidery rather than rearranging it
     * into a new design.
     */
    aspectRatio: "traditional_3_4",
    outputFormat: "png",
    webhookUrl: webhook(),
  });

  return ImageJobModel.create({
    stage: "extract",
    region,
    runId,
    taskId: task.task_id,
    status: "pending",
    selections: [],
    prompt,
    createdBy: adminId,
  });
}

/**
 * Stage 2 — apply a finished motif sheet to a target garment.
 *
 * The sheet is passed by URL because it is Magnific's own output; fetching and
 * re-encoding it to base64 would cost a round trip for no benefit.
 */
export interface MotifSheetInput {
  /** A URL from stage 1, or base64 for a sheet uploaded from disk. */
  image: string;
  /** Where it belongs: "neckline sheet", "cuff sheet", "hem sheet". */
  label?: string;
}

export async function applyMotifs(
  targetImage: string,
  sheets: MotifSheetInput[],
  options: {
    extra?: string;
    variations?: number;
    sourceJobId?: string;
    runId?: string;
    adminId?: string;
  } = {},
) {
  if (sheets.length === 0) {
    throw ApiError.badRequest("Provide at least one embroidery sheet");
  }

  const labelled = sheets.map((sheet, index) => ({
    ...sheet,
    label: sheet.label?.trim() || `motif sheet ${index + 1}`,
  }));

  const runId = options.runId ?? randomUUID();

  /* One sheet keeps the original wording; several are named individually so
     the model places each where it belongs rather than guessing. */
  const prompt =
    labelled.length === 1
      ? applyMotifsPrompt(options.extra)
      : applyMotifSheetsPrompt(
          labelled.map((sheet) => sheet.label),
          options.extra,
        );
  const variations = Math.min(Math.max(options.variations ?? 1, 1), 4);

  const jobs: IImageJob[] = [];

  for (let i = 0; i < variations; i += 1) {
    const task = await generateWithReferences({
      /* Slot order still matters for Flux; the labels make it explicit for
         Nano Banana, which is the point of using it. */
      images: [targetImage, ...labelled.map((sheet) => sheet.image)],
      referenceLabels: [
        "The BASE GARMENT. Keep its colour, fabric, cut, pose and silhouette exactly.",
        ...labelled.map(
          (sheet) =>
            `EMBROIDERY MOTIF SOURCE — the ${sheet.label}. Use only the motifs from this image; ignore its background.`,
        ),
      ],
      prompt,
      webhookUrl: webhook(),
    });

    jobs.push(
      await ImageJobModel.create({
        stage: "apply",
        runId,
        sourceJobId: options.sourceJobId,
        taskId: task.task_id,
        status: "pending",
        selections: [],
        prompt,
        createdBy: options.adminId,
      }),
    );
  }

  return jobs;
}

/** Polling fallback for when no webhook URL is configured. */
export async function refreshJob(jobId: string) {
  const job = await ImageJobModel.findById(jobId).exec();
  if (!job) throw ApiError.notFound("Job not found");
  if (job.status !== "pending") return job;

  const task = await getTask(job.taskId);

  if (task.status === "COMPLETED") {
    job.status = "completed";
    job.resultUrls = task.generated;
  } else if (task.status === "FAILED") {
    job.status = "failed";
    job.error = "Magnific reported a failed generation";
  }

  await job.save();
  return job;
}

/** Refreshes every pending job in one run, for the polling UI. */
export async function refreshRun(runId: string) {
  const jobs = await ImageJobModel.find({ runId }).sort({ createdAt: 1 }).exec();

  await Promise.all(
    jobs
      .filter((job) => job.status === "pending")
      .map((job) => refreshJob(job._id.toString()).catch(() => undefined)),
  );

  return ImageJobModel.find({ runId }).sort({ createdAt: 1 }).exec();
}

export function getRun(runId: string) {
  return ImageJobModel.find({ runId }).sort({ createdAt: 1 }).exec();
}

/** Studio history, newest run first. */
export function listRuns(limit = 20) {
  return ImageJobModel.find({ productId: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(limit * 4)
    .exec();
}
