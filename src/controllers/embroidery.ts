import { Request, Response } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import * as assetService from '../services/embroideryAssets';
import * as motifService from '../services/motifTransfer';
import { detectLandmarks } from '../services/garmentLandmarks';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';

/** Splits a finished extraction into named, reusable assets. */
export const buildAssets = asyncHandler(async (req: Request, res: Response) => {
  const result = await assetService.buildAssetsFromJob(req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Embroidery assets created', result);
});

export const getCollections = asyncHandler(async (_req: Request, res: Response) => {
  const collections = await assetService.listCollections();
  ApiResponse.success(res, HttpStatus.OK, 'Collections fetched', collections);
});

export const getAssets = asyncHandler(async (req: Request, res: Response) => {
  const assets = await assetService.listAssets(
    req.query.collectionId as string | undefined,
    req.query.approvedOnly === 'true',
  );
  ApiResponse.success(res, HttpStatus.OK, 'Assets fetched', assets);
});

export const updateAsset = asyncHandler(async (req: Request, res: Response) => {
  const asset = await assetService.updateAsset(req.params.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Asset updated', asset);
});

export const approveAsset = asyncHandler(async (req: Request, res: Response) => {
  const asset = await assetService.setApproval(req.params.id, req.body.isApproved);
  ApiResponse.success(res, HttpStatus.OK, 'Asset updated', asset);
});

export const removeAsset = asyncHandler(async (req: Request, res: Response) => {
  await assetService.deleteAsset(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Asset deleted');
});

/**
 * Reports where the garment's landmarks are, and how confident that is.
 *
 * The studio calls this when a blank suit is uploaded: high confidence means
 * placement can proceed, low confidence means the operator must mark them.
 */
export const findLandmarks = asyncHandler(async (req: Request, res: Response) => {
  const landmarks = await detectLandmarks(Buffer.from(req.body.image, 'base64'));
  ApiResponse.success(res, HttpStatus.OK, 'Landmarks detected', landmarks);
});

/** Stage 2 with deterministic placement. */
export const applyAssets = asyncHandler(async (req: Request, res: Response) => {
  const result = await motifService.applyAssets(req.body.targetImage, req.body.assetIds, {
    extra: req.body.instruction,
    variations: req.body.variations,
    runId: req.body.runId,
    landmarks: req.body.landmarks,
    adminId: req.authUser?.id,
  });

  ApiResponse.success(res, HttpStatus.ACCEPTED, 'Generation started', result);
});

/** Composite preview — free, so placement can be checked before generating. */
export const previewPlacement = asyncHandler(async (req: Request, res: Response) => {
  const result = await motifService.previewPlacement(
    req.body.targetImage,
    req.body.assetIds,
    req.body.landmarks,
  );

  ApiResponse.success(res, HttpStatus.OK, 'Preview rendered', result);
});
