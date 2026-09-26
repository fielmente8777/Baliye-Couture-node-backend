import { Request, Response } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as replacementService from '../services/replacement';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';
import { buildMeta, getPagination } from '../utils/pagination';
import { ReplacementStatus } from '../models/replacementrequest';

export const createReplacement = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const request = await replacementService.createRequest(req.authUser.id, req.params.id, req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Request submitted', request);
});

export const getOrderReplacements = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const list = await replacementService.listForOrder(req.authUser.id, req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Requests fetched', list);
});

export const getMyReplacements = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const list = await replacementService.listMine(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Requests fetched', list);
});

export const adminListReplacements = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req);
  const [list, total] = await replacementService.adminList(
    req.query.status as ReplacementStatus | undefined,
    skip,
    limit,
  );
  ApiResponse.success(res, HttpStatus.OK, 'Requests fetched', list, buildMeta(page, limit, total));
});

export const adminUpdateReplacement = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const request = await replacementService.adminUpdate(
    req.params.id,
    req.authUser.id,
    req.body.status,
    req.body.note,
  );
  ApiResponse.success(res, HttpStatus.OK, 'Request updated', request);
});
