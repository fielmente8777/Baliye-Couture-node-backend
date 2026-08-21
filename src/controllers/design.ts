import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as designService from '../services/design';
import { ApiResponse } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpstatus';
import { ApiError } from '../utils/apiError';
import { buildMeta, getPagination } from '../utils/pagination';

// ---- Admin: design options ----
export const createDesignOption = asyncHandler(async (req: Request, res: Response) => {
  const option = await designService.createOption(req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Design option created', option);
});

export const getDesignOptions = asyncHandler(async (req: Request, res: Response) => {
  const options = await designService.getOptions(req.query.category as string | undefined);
  ApiResponse.success(res, HttpStatus.OK, 'Design options fetched', options);
});

export const updateDesignOption = asyncHandler(async (req: Request, res: Response) => {
  const option = await designService.updateOption(req.params.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Design option updated', option);
});

export const deleteDesignOption = asyncHandler(async (req: Request, res: Response) => {
  await designService.deleteOption(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Design option deleted');
});

// ---- User: suit designs ----
export const createDesign = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const design = await designService.createDesign(req.authUser.id, req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Suit design created', design);
});

export const getDesigns = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const { page, limit, skip } = getPagination(req);
  const [designs, total] = await designService.getUserDesigns(req.authUser.id, skip, limit);
  ApiResponse.success(res, HttpStatus.OK, 'Suit designs fetched', designs, buildMeta(page, limit, total));
});

export const getDesignById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const design = await designService.getUserDesignById(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Suit design fetched', design);
});

export const updateDesign = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const design = await designService.updateDesign(req.params.id, req.authUser.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Suit design updated', design);
});

export const deleteDesign = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  await designService.deleteDesign(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Suit design deleted');
});