import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as garmentTypeService from '../services/garmentType';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';

export const getDesignableTypes = asyncHandler(async (req: Request, res: Response) => {
  const types = await garmentTypeService.getDesignableTypes(req.query.family as string);
  ApiResponse.success(res, HttpStatus.OK, 'Garment types fetched', types);
});

export const getGarmentTypeBySlug = asyncHandler(async (req: Request, res: Response) => {
  const type = await garmentTypeService.getTypeBySlug(req.params.slug);
  ApiResponse.success(res, HttpStatus.OK, 'Garment type fetched', type);
});

export const getAllGarmentTypes = asyncHandler(async (_req: Request, res: Response) => {
  const types = await garmentTypeService.getAllTypes();
  ApiResponse.success(res, HttpStatus.OK, 'Garment types fetched', types);
});

export const getGarmentTypeWithOptions = asyncHandler(async (req: Request, res: Response) => {
  const type = await garmentTypeService.getTypeWithOptions(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Garment type fetched', type);
});

export const createGarmentType = asyncHandler(async (req: Request, res: Response) => {
  const type = await garmentTypeService.createType(req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Garment type created', type);
});

export const updateGarmentType = asyncHandler(async (req: Request, res: Response) => {
  const type = await garmentTypeService.updateType(req.params.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Garment type updated', type);
});

export const deleteGarmentType = asyncHandler(async (req: Request, res: Response) => {
  await garmentTypeService.deleteType(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Garment type deleted');
});
