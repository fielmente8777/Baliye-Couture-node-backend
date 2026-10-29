import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { HttpStatus } from '../constants/httpstatus';
import * as catalog from '../services/adminCatalog';

export const getCatalog = asyncHandler(async (_req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Design catalogue fetched', await catalog.getCatalog());
});

export const createGarment = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.CREATED, 'Garment created', await catalog.createGarment(req.body));
});

export const updateGarment = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Garment updated', await catalog.updateGarment(req.params.id, req.body));
});

export const deleteGarment = asyncHandler(async (req: Request, res: Response) => {
  await catalog.deleteGarment(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Garment deleted');
});

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.CREATED, 'Step created', await catalog.createGroup(req.body));
});

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Step updated', await catalog.updateGroup(req.params.id, req.body));
});

export const createOption = asyncHandler(async (req: Request, res: Response) => {
  const option = await catalog.createOption(req.params.groupId, req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Option created', option);
});

export const updateOption = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Option updated', await catalog.updateOption(req.params.id, req.body));
});

export const deleteOption = asyncHandler(async (req: Request, res: Response) => {
  await catalog.deleteOption(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Option deleted');
});

export const uploadCatalogImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  const result = await catalog.setCatalogImage(req.body.key, req.file);
  ApiResponse.success(res, HttpStatus.OK, 'Image uploaded to Shopify', result);
});
