import { NextFunction, Request, Response } from 'express';

import { HttpStatus } from '@constants/httpstatus';
import * as teamService from '@services/team';
import { ApiError } from '@utils/apiError';
import { ApiResponse } from '@utils/apiResponse';
import { asyncHandler } from '@utils/asyncHandler';

/** Team routes are for owners; members get a 403. */
export const requireOwner = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.authUser || !(await teamService.isOwner(req.authUser.id))) {
    throw ApiError.forbidden('Only the account owner can manage the team');
  }
  next();
});

export const getTeam = asyncHandler(async (_req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Team fetched', await teamService.listTeam());
});

export const addMember = asyncHandler(async (req: Request, res: Response) => {
  const member = await teamService.addMember(req.authUser!.id, req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Team member added', member);
});

export const updateMember = asyncHandler(async (req: Request, res: Response) => {
  const member = await teamService.updateMember(req.params.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Team member updated', member);
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  await teamService.removeMember(req.authUser!.id, req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Team member removed');
});
