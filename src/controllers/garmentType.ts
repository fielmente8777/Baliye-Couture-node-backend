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

