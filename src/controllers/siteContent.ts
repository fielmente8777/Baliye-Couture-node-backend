import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { HttpStatus } from '../constants/httpstatus';
import type { ContentPage } from '../models/sitecontent';
import * as siteContent from '../services/siteContent';

export const getContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await siteContent.getContent(req.params.page as ContentPage);
  ApiResponse.success(res, HttpStatus.OK, 'Content fetched', content);
});

export const saveContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await siteContent.saveContent(
    req.params.page as ContentPage,
    req.body.data,
    req.authUser?.id
  );
  ApiResponse.success(res, HttpStatus.OK, 'Content saved', content);
});

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  ApiResponse.success(res, HttpStatus.OK, 'Image uploaded to Shopify', await siteContent.uploadContentImage(req.file));
});
