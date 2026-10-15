import { Request, Response } from "express";

import { asyncHandler } from "../utils/asyncHandler";
import * as imageGenerationService from "../services/imageGeneration";
import { HttpStatus } from "../constants/httpstatus";
import { ApiResponse } from "../utils/apiResponse";

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
