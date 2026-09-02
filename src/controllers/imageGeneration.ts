import { Request, Response } from "express";

import { asyncHandler } from "../utils/asyncHandler";
import * as imageGenerationService from "../services/imageGeneration";
import { HttpStatus } from "../constants/httpstatus";
import { ApiResponse } from "../utils/apiResponse";
import { ImageJobModel } from "../models/imagejob";
import { logger } from "../config/logger";

export const generateVariants = asyncHandler(
  async (req: Request, res: Response) => {
    const jobs = await imageGenerationService.requestVariants(
      req.params.id,
      req.body.referenceImage,
      req.body.combinations,
      req.authUser?.id,
    );

    /* 202: the work is queued at Magnific, not finished. */
    ApiResponse.success(res, HttpStatus.OK, "Generation started", jobs);
  },
);

export const listImageJobs = asyncHandler(
  async (req: Request, res: Response) => {
    const jobs = await imageGenerationService.getJobsForProduct(req.params.id);
    ApiResponse.success(res, HttpStatus.OK, "Image jobs fetched", jobs);
  },
);

export const refreshImageJob = asyncHandler(
  async (req: Request, res: Response) => {
    const job = await imageGenerationService.refreshJob(req.params.id);
    ApiResponse.success(res, HttpStatus.OK, "Job refreshed", job);
  },
);

export const attachImage = asyncHandler(async (req: Request, res: Response) => {
  const job = await imageGenerationService.attachJobImage(
    req.params.id,
    req.body.imageUrl,
  );
  ApiResponse.success(res, HttpStatus.OK, "Image attached to product", job);
});

/**
 * Magnific's callback. Public by necessity — their servers can't hold our
 * Bearer token.
 *
 * The job is found by task_id, which is a value only Magnific and we know, so a
 * forged POST would need to guess it. It always returns 200: a non-2xx makes
 * Magnific retry, and retrying will not fix an unknown task.
 */
export const magnificWebhook = asyncHandler(
  async (req: Request, res: Response) => {
    const { task_id: taskId, status, generated } = req.body ?? {};

    if (!taskId) {
      logger.warn({ body: req.body }, "Magnific webhook with no task_id");
      return ApiResponse.success(res, HttpStatus.OK, "Ignored");
    }

    const job = await ImageJobModel.findOne({ taskId }).exec();

    if (!job) {
      logger.warn({ taskId }, "Magnific webhook for an unknown task");
      return ApiResponse.success(res, HttpStatus.OK, "Ignored");
    }

    if (status === "COMPLETED") {
      job.status = "completed";
      job.resultUrls = Array.isArray(generated) ? generated : [];
    } else if (status === "FAILED") {
      job.status = "failed";
      job.error = "Magnific reported a failed generation";
    }

    await job.save();
    logger.info({ taskId, status }, "Magnific webhook processed");

    ApiResponse.success(res, HttpStatus.OK, "Received");
  },
);
