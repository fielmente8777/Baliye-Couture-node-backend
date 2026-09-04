import { Request, Response } from "express";

import { asyncHandler } from "../utils/asyncHandler";
import * as motifService from "../services/motifTransfer";
import { HttpStatus } from "../constants/httpstatus";
import { ApiResponse } from "../utils/apiResponse";

/** Stage 1 — queue a motif extraction from a donor garment. */
export const extractMotifs = asyncHandler(async (req: Request, res: Response) => {
  /* Accept either shape: views[] from the new UI, donorImage from anything
     still on the old contract. */
  const views = req.body.views ?? [{ image: req.body.donorImage }];

  const job = await motifService.extractMotifs(
    views,
    req.authUser?.id,
    req.body.runId,
    req.body.region,
  );

  /* 202: queued at Magnific, not finished. */
  ApiResponse.success(res, HttpStatus.ACCEPTED, "Extraction started", job);
});

/** Stage 2 — apply a finished motif sheet to a target garment. */
export const applyMotifs = asyncHandler(async (req: Request, res: Response) => {
  const sheets = req.body.sheets ?? [{ image: req.body.motifSheetImage }];

  const jobs = await motifService.applyMotifs(
    req.body.targetImage,
    sheets,
    {
      extra: req.body.instruction,
      variations: req.body.variations,
      sourceJobId: req.body.sourceJobId,
      runId: req.body.runId,
      adminId: req.authUser?.id,
    },
  );

  ApiResponse.success(res, HttpStatus.ACCEPTED, "Generation started", jobs);
});

export const getRun = asyncHandler(async (req: Request, res: Response) => {
  const jobs = await motifService.refreshRun(req.params.runId);
  ApiResponse.success(res, HttpStatus.OK, "Run fetched", jobs);
});

export const listRuns = asyncHandler(async (_req: Request, res: Response) => {
  const jobs = await motifService.listRuns();
  ApiResponse.success(res, HttpStatus.OK, "Runs fetched", jobs);
});
