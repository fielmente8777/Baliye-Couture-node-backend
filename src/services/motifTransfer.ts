/**
 * Two-stage embroidery transfer.
 *
 * Two stages, both on OpenAI's image edit endpoint:
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

import { env } from "@config/env";
import { generateWithReferences, getTask } from "@config/imageAI";
import {
  EXTRACT_MOTIFS_PROMPT,
  blendCompositePrompt,
  applyMotifSheetsPrompt,
  applyMotifsPrompt,
  extractFromViewsPrompt,
  extractRegionPrompt,
  type MotifRegion,
} from "@config/prompts";
import { IEmbroideryAsset } from '@models/embroideryasset';
import { ImageJobModel, IImageJob } from "@models/imagejob";
import { ApiError } from "@utils/apiError";
import { collectionNotes, getApprovedByIds } from './embroideryAssets';
import { CompositeResult, compositeEmbroidery, compositeFromPlan, describePieces } from './embroideryCompositor';
import { PlannedPiece, planFromReference } from './referenceLayout';
import { Landmarks } from './garmentLandmarks';
import { dilateMask, toPortrait } from './garmentRender';
import { onJobSettled, saveMask } from './blendFinalize';
import { saveGeneratedImage } from '@config/imageStore';

/* Finishes jobs the moment OpenAI returns (replaces Magnific's webhook). */
import "./imageTasks";

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
  /** The admin's notes on the embroidery: what is there and what it is made of. */
  notes?: string,
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
  const base =
    labelled.length === 1
      ? region
        ? extractRegionPrompt(region)
        : EXTRACT_MOTIFS_PROMPT
      : extractFromViewsPrompt(labelled.map((view) => ({ label: view.label })));
  /* The expert's notes help it find every element and keep true colours; they
     never license adding what the photos don't show. */
  const prompt = notes?.trim()
    ? `${base} Notes from the embroidery expert about this garment: "${notes.trim()}". Use them to recognise every element and its true colours and materials; never add anything the photographs do not show.`
    : base;

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
    label: "extract",
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
 * The sheet is passed by URL (our own stored copy) or as base64.
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
      /* Image 1 is the garment; the output keeps its exact framing. */
      images: [targetImage, ...labelled.map((sheet) => sheet.image)],
      referenceLabels: [
        "The BASE GARMENT. Keep its colour, fabric, cut, pose and silhouette exactly.",
        ...labelled.map(
          (sheet) =>
            `EMBROIDERY MOTIF SOURCE — the ${sheet.label}. Use only the motifs from this image; ignore its background.`,
        ),
      ],
      prompt,
      preserveFrame: true,
      label: "apply (sheets)",
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
    job.usage = task.usage;
  } else if (task.status === "FAILED") {
    job.status = "failed";
    job.error = task.error ?? "Image generation failed";
  }

  await job.save();

  /* Blend jobs: restore everything outside the embroidery, score drift. */
  if (job.status !== "pending") {
    await onJobSettled(job);
    return (await ImageJobModel.findById(jobId).exec()) ?? job;
  }

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

/** Studio history, newest run first. */
export function listRuns(limit = 20) {
  return ImageJobModel.find({ productId: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(limit * 4)
    .exec();
}

/**
 * Builds the layout image, from one of three sources, best first:
 *   plan       — a layout already read (the preview's), reused so the
 *                generation matches what the admin approved exactly
 *   reference  — a photo of the finished source design: one vision call reads
 *                where every piece sits on it
 *   neither    — each asset's stored region default
 */
async function layoutFor(
  portrait: Awaited<ReturnType<typeof toPortrait>>,
  assets: IEmbroideryAsset[],
  assetIds: string[],
  options: { landmarks?: Landmarks; referenceImage?: string; plan?: PlannedPiece[] },
): Promise<{ composite: Omit<CompositeResult, 'landmarks'> & { landmarks?: CompositeResult['landmarks'] }; plan?: PlannedPiece[] }> {
  const plan = options.plan?.length
    ? options.plan
    : options.referenceImage
      ? await planFromReference(Buffer.from(options.referenceImage, 'base64'), portrait.buffer, assets)
      : undefined;

  if (plan) return { composite: await compositeFromPlan(portrait.buffer, assets, plan), plan };

  const composite = await compositeEmbroidery(
    portrait.buffer,
    assets,
    /* Seed from the asset set, so the same design scatters butis identically
       every time while different designs differ. */
    assetIds.join('').length,
    options.landmarks ? portrait.mapLandmarks(options.landmarks) : undefined,
  );
  return { composite };
}

/**
 * Stage 2, deterministic placement.
 *
 * Composites approved assets onto the blank garment using their stored
 * landmark anchors, then hands that layout to the generator purely to blend
 * and relight. Placement becomes arithmetic; only realism is generated.
 *
 * Cost is unchanged — the compositing step is free, and there is still exactly
 * one generation call per variation.
 */
export async function applyAssets(
  targetImage: string,
  assetIds: string[],
  options: {
    extra?: string;
    variations?: number;
    runId?: string;
    adminId?: string;
    /** Landmarks marked by an operator, when auto-detection is unreliable. */
    landmarks?: Landmarks;
    /** Photo of the finished source design: copy its layout. */
    referenceImage?: string;
    /** A layout already read by the preview — wins over `referenceImage`. */
    plan?: PlannedPiece[];
  } = {},
) {
  const assets = await getApprovedByIds(assetIds);

  if (assets.length === 0) {
    throw ApiError.badRequest(
      'None of those embroidery assets are approved — approve them first',
    );
  }

  /* 3:4 in, 3:4 out — otherwise the model reframes and the restore step
     cannot line its output up with the composite. */
  const portrait = await toPortrait(Buffer.from(targetImage, 'base64'));

  const { composite, plan } = await layoutFor(portrait, assets, assetIds, options);

  const runId = options.runId ?? randomUUID();
  /* The admin's notes say what the work is made of (zari reads as metal,
     resham as thread): they shape the blend, never the placement. */
  const notes = await collectionNotes(assets[0].collectionId);
  const prompt = blendCompositePrompt(options.extra, [
    ...(notes ? [`Expert notes on this embroidery: ${notes}.`] : []),
    ...describePieces(assets),
  ]);
  const variations = Math.min(Math.max(options.variations ?? 1, 1), 4);
  const layout = composite.buffer.toString('base64');

  /* Saved once per run: when each variation finishes, only the pixels inside
     the (slightly grown) embroidery mask are taken from the model. */
  const loose = await dilateMask(
    composite.embroideryMask,
    composite.width,
    composite.height,
    Math.max(4, Math.round(composite.width * 0.012)),
  );
  const [compositeUrl, maskUrl, tightMaskUrl] = await Promise.all([
    saveGeneratedImage(layout, 'png', { temporary: true }),
    saveMask(loose, composite.width, composite.height, true),
    saveMask(composite.embroideryMask, composite.width, composite.height, true),
  ]);

  const jobs: IImageJob[] = [];

  for (let i = 0; i < variations; i += 1) {
    const task = await generateWithReferences({
      images: [layout],
      referenceLabels: [
        'A garment with embroidery already correctly positioned. Blend it in; do not move anything.',
      ],
      prompt,
      /* Output lines up with the composite, and the mask tells OpenAI where
         the embroidery is — the only area it should touch. */
      preserveFrame: true,
      mask: { data: loose, width: composite.width, height: composite.height },
      quality: env.openai.quality,
      label: 'apply (studio blend)',
    });

    jobs.push(
      await ImageJobModel.create({
        stage: 'apply',
        runId,
        taskId: task.task_id,
        status: 'pending',
        selections: [],
        prompt,
        compositeUrl,
        maskUrl,
        tightMaskUrl,
        createdBy: options.adminId,
      }),
    );
  }

  return { jobs, placedCount: composite.placedCount, landmarks: composite.landmarks, plan };
}

/**
 * Renders the composite without generating anything.
 *
 * Free, instant, and it shows exactly where every piece will land. Without it
 * the only way to check placement is to spend a generation and wait a minute,
 * which makes tuning an asset's offset prohibitively slow.
 */
export async function previewPlacement(
  targetImage: string,
  assetIds: string[],
  options: { landmarks?: Landmarks; referenceImage?: string; plan?: PlannedPiece[] } = {},
) {
  const assets = await getApprovedByIds(assetIds);

  if (assets.length === 0) {
    throw ApiError.badRequest(
      'None of those embroidery pieces are approved — approve them first',
    );
  }

  const portrait = await toPortrait(Buffer.from(targetImage, 'base64'));
  const { composite, plan } = await layoutFor(portrait, assets, assetIds, options);

  return {
    /* Returned inline rather than saved: a preview is throwaway, and writing
       a file per slider nudge would fill the uploads directory. */
    preview: `data:image/png;base64,${composite.buffer.toString('base64')}`,
    placedCount: composite.placedCount,
    landmarks: composite.landmarks,
    /* Sent back with Generate, so the paid image uses this exact layout
       rather than a second reading that could differ. */
    plan,
  };
}
