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
  applyMotifsPrompt,
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
export async function extractMotifs(
  donorImage: string,
  adminId?: string,
  runId = randomUUID(),
  region?: MotifRegion,
) {
  const prompt = region ? extractRegionPrompt(region) : EXTRACT_MOTIFS_PROMPT;

  const task = await generateWithReferences({
    images: [donorImage],
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
export async function applyMotifs(
  targetImage: string,
  motifSheetImage: string,
  options: {
    extra?: string;
    variations?: number;
    sourceJobId?: string;
    runId?: string;
    adminId?: string;
  } = {},
) {
  const runId = options.runId ?? randomUUID();
  const prompt = applyMotifsPrompt(options.extra);
  const variations = Math.min(Math.max(options.variations ?? 1, 1), 4);

  const jobs: IImageJob[] = [];

  for (let i = 0; i < variations; i += 1) {
    const task = await generateWithReferences({
      /* Slot order is load-bearing: structure comes from the first image. */
      images: [targetImage, motifSheetImage],
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
