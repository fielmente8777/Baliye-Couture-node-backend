import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { HttpStatus } from '../constants/httpstatus';
import type { ContentPage } from '../models/sitecontent';
import * as siteContent from '../services/siteContent';
import { writeContent as writeContentWithAi } from '../services/contentWriter';

export const getContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await siteContent.getContent(req.params.page as ContentPage);
  ApiResponse.success(res, HttpStatus.OK, 'Content fetched', content);
});

/** Changes whenever any page is saved. Never cached by browsers or proxies. */
export const getContentVersion = asyncHandler(async (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  ApiResponse.success(res, HttpStatus.OK, 'Content version', { version: await siteContent.contentVersion() });
});

export const saveContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await siteContent.saveContent(
    req.params.page as ContentPage,
    req.body.data,
    req.authUser?.id
  );
  ApiResponse.success(res, HttpStatus.OK, 'Content saved', content);
});

/** A suggestion only; the admin chooses to use it, and saves as usual. */
export const writeContent = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Suggestion written', { text: await writeContentWithAi(req.body) });
});

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  ApiResponse.success(res, HttpStatus.OK, 'Image uploaded to Shopify', await siteContent.uploadContentImage(req.file));
});
