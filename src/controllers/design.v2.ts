import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as designService from '../services/design.v2';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { getPagination } from '../utils/pagination';

export const getDesignConfig = asyncHandler(async (req: Request, res: Response) => {
  const config = await designService.getDesignConfig({
    garmentTypeId: req.query.garmentTypeId as string | undefined,
    productId: req.query.productId as string | undefined,
  });
  ApiResponse.success(res, HttpStatus.OK, 'Design configuration fetched', config);
});

export const quotePrice = asyncHandler(async (req: Request, res: Response) => {
  const pricing = await designService.quotePrice(req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Price calculated', pricing);
});

export const createDesign = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const design = await designService.createDesign(req.authUser.id, req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Design saved', design);
});

export const getMyDesigns = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const { skip, limit } = getPagination(req);
  const designs = await designService.getMyDesigns(req.authUser.id, skip, limit);
  ApiResponse.success(res, HttpStatus.OK, 'Designs fetched', designs);
});

export const getDesignById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const design = await designService.getDesignById(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Design fetched', design);
});

export const deleteDesign = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  await designService.deleteDesign(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Design deleted');
});
