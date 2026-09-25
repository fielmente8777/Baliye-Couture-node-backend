import { Request, Response } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import * as renderService from '../services/designRender';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';

/** Stepper: returns the exact preview at once; the blended image follows. */
export const renderDesign = asyncHandler(async (req: Request, res: Response) => {
  const result = await renderService.renderDesign(req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Design rendered', result);
});

export const getRender = asyncHandler(async (req: Request, res: Response) => {
  const result = await renderService.getRender(req.params.key);
  ApiResponse.success(res, HttpStatus.OK, 'Render fetched', result);
});

export const createBaseGarment = asyncHandler(async (req: Request, res: Response) => {
  const base = await renderService.createBaseGarment(req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Base garment saved', base);
});

export const listBaseGarments = asyncHandler(async (req: Request, res: Response) => {
  const bases = await renderService.listBaseGarments(
    req.query.garmentTypeId as string | undefined,
  );
  ApiResponse.success(res, HttpStatus.OK, 'Base garments fetched', bases);
});

export const deleteBaseGarment = asyncHandler(async (req: Request, res: Response) => {
  const base = await renderService.deleteBaseGarment(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Base garment deleted', base);
});

export const setEmbroideryCollection = asyncHandler(async (req: Request, res: Response) => {
  const option = await renderService.setEmbroideryCollection(
    req.params.optionId,
    req.body.collectionId,
  );
  ApiResponse.success(res, HttpStatus.OK, 'Embroidery option linked', option);
});

export const clearRenders = asyncHandler(async (req: Request, res: Response) => {
  const result = await renderService.clearRenders(req.body?.garmentTypeId);
  ApiResponse.success(res, HttpStatus.OK, 'Render cache cleared', result);
});
