import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as profileService from '../services/profile';
import { ApiResponse } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpstatus';

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const user = await profileService.getProfile(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Profile fetched', user);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const user = await profileService.updateProfile(req.authUser.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Profile updated', user);
});

export const deleteProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  await profileService.deleteProfile(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Profile deleted');
});

export const uploadProfileImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  if (!req.file) throw ApiError.badRequest('No image file provided');

  const imagePath = `/${req.file.destination.split('/').pop()}/${req.file.filename}`;
  const user = await profileService.updateProfile(req.authUser.id, { profileImage: imagePath });
  ApiResponse.success(res, HttpStatus.OK, 'Profile image updated', user);
});

export const requestPhoneChange = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const result = await profileService.requestPhoneChange(req.authUser.id, req.body.phone);
  ApiResponse.success(res, HttpStatus.OK, "Verification code sent", result);
});

export const confirmPhoneChange = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const user = await profileService.confirmPhoneChange(
    req.authUser.id,
    req.body.phone,
    req.body.code,
  );
  ApiResponse.success(res, HttpStatus.OK, "Phone number updated", user);
});
