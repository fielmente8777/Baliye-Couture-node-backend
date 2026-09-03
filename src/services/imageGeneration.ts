import { randomUUID } from "crypto";
import { Types } from "mongoose";

import { env } from "@config/env";
import { generateVariant, getVariantTask } from "@config/magnific";
import { ImageJobModel } from "@models/imagejob";
import { OptionModel } from "@models/option";
import { OptionGroupModel } from "@models/optiongroup";
import { ProductModel } from "@models/product";
import { ApiError } from "@utils/apiError";

/**
 * Builds the prompt from the option catalog rather than free text.
 *
 * This is what makes a generated image mean something: the result is tied to a
 * specific fabric and embroidery the customer can actually select, so it can be
 * stored against those option ids and shown when they pick them.
 */
async function buildPrompt(
  selections: { groupId: string; optionId: string }[],
) {
  const optionIds = selections.map((s) => s.optionId);
  const options = await OptionModel.find({ _id: { $in: optionIds } }).exec();
  const groups = await OptionGroupModel.find({
    _id: { $in: selections.map((s) => s.groupId) },
  }).exec();

  const parts = selections.flatMap((selection) => {
    const group = groups.find((g) => g._id.toString() === selection.groupId);
    const option = options.find((o) => o._id.toString() === selection.optionId);
    if (!group || !option) return [];
    return [`${group.label.toLowerCase()}: ${option.label}`];
  });

  /* Explicitly hold the silhouette: we want a fabric swap, not a new garment. */
  return [
    "Product photograph of the same garment shown in the reference image.",
    "Keep the exact silhouette, cut, drape and pose unchanged.",
    `Change only the following: ${parts.join(", ")}.`,
    "Studio lighting, plain neutral background, full garment in frame.",
  ].join(" ");
}

export async function requestVariants(
  productId: string,
  referenceImage: string,
  combinations: { groupId: string; optionId: string }[][],
  adminId?: string,
) {
  const product = await ProductModel.findById(productId).exec();
  if (!product) throw ApiError.notFound("Product not found");

  /* Each combination is a separate paid generation — cap it. */
  if (combinations.length > 8) {
    throw ApiError.badRequest("Request at most 8 variants at a time");
  }

  const jobs = [];

  for (const selections of combinations) {
    const prompt = await buildPrompt(selections);

    const task = await generateVariant({
      referenceImage,
      prompt,
      webhookUrl: env.magnific.webhookUrl || undefined,
    });

    jobs.push(
      await ImageJobModel.create({
        stage: "variant",
        runId: randomUUID(),
        productId: product._id,
        taskId: task.task_id,
        status: "pending",
        selections: selections.map((s) => ({
          groupId: new Types.ObjectId(s.groupId),
          optionId: new Types.ObjectId(s.optionId),
        })),
        prompt,
        createdBy: adminId,
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

  const task = await getVariantTask(job.taskId);

  if (task.status === "COMPLETED") {
    job.status = "completed";
    job.resultUrls = task.generated;
  } else if (task.status === "FAILED") {
    job.status = "failed";
    job.error = "Generation failed";
  }

  await job.save();
  return job;
}

export function getJobsForProduct(productId: string) {
  return ImageJobModel.find({ productId }).sort({ createdAt: -1 }).exec();
}

/**
 * Promotes a finished generation onto the product as a colour-specific image,
 * so the storefront swaps it in when the customer selects that option (§20).
 */
export async function attachJobImage(jobId: string, imageUrl: string) {
  const job = await ImageJobModel.findById(jobId).exec();
  if (!job || job.status !== "completed") {
    throw ApiError.badRequest("That generation is not finished");
  }

  const colourSelection = job.selections[0];

  await ProductModel.updateOne(
    { _id: job.productId },
    {
      $push: {
        images: {
          url: imageUrl,
          alt: "Generated variant",
          type: "model",
          position: 99,
          colorOptionId: colourSelection?.optionId,
        },
      },
    },
  ).exec();

  return job;
}

export async function studioGenerate(
  referenceImage: string,
  prompt: string,
  variations: number,
  adminId?: string,
) {
  const fullPrompt = [
    "Product photograph of the same garment shown in the reference image.",
    "Keep the exact silhouette, cut, drape and pose unchanged.",
    prompt,
    "Studio lighting, plain neutral background, full garment in frame.",
  ].join(" ");

  const jobs = [];

  for (let i = 0; i < variations; i += 1) {
    const task = await generateVariant({
      referenceImage,
      prompt: fullPrompt,
      webhookUrl: env.magnific.webhookUrl || undefined,
    });

    jobs.push(
      await ImageJobModel.create({
        stage: "variant",
        runId: randomUUID(),
        taskId: task.task_id,
        status: "pending",
        selections: [],
        prompt: fullPrompt,
        createdBy: adminId,
      }),
    );
  }

  return jobs;
}

/** Studio history — jobs with no product attached. */
export function getStudioJobs(limit = 30) {
  return ImageJobModel.find({ productId: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
}
