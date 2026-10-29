import { Request, Response } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import * as settingsService from '../services/settings';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';

/** Public: the storefront reads which features to show. */
export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  /* The admin's switch must reach open tabs at once — never let a browser or proxy keep it. */
  res.set('Cache-Control', 'no-store');
  ApiResponse.success(res, HttpStatus.OK, 'Settings fetched', await settingsService.getSettings());
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await settingsService.updateSettings(req.body, req.authUser?.id);
  ApiResponse.success(res, HttpStatus.OK, 'Settings saved', settings);
});
