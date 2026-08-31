import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import * as authService from '../services/auth';
import { HttpStatus } from '../constants/httpstatus';
import { ApiError } from '../utils/apiError';
import { Role } from '../constants/role';
import * as adminRepository from '../repositories/admin.repository';
import * as userRepository from '../repositories/user.repository';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.register(req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Registered successfully', user);
});

export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  await authService.sendOtp(req.body.phone);
  ApiResponse.success(res, HttpStatus.OK, 'OTP sent successfully');
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.verifyOtpAndLogin(req.body.phone, req.body.code);
  ApiResponse.success(res, HttpStatus.OK, 'Login successful', tokens);
});

export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.googleLogin(req.body.idToken);
  ApiResponse.success(res, HttpStatus.OK, 'Login successful', tokens);
});

export const microsoftLogin = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.microsoftLogin(req.body.accessToken);
  ApiResponse.success(res, HttpStatus.OK, 'Login successful', tokens);
});

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.adminLogin(req.body.email, req.body.password);
  ApiResponse.success(res, HttpStatus.OK, 'Login successful', tokens);
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.refreshTokens(req.body.refreshToken);
  ApiResponse.success(res, HttpStatus.OK, 'Token refreshed', tokens);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.body.refreshToken);
  ApiResponse.success(res, HttpStatus.OK, 'Logged out successfully');
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();

  const entity =
    req.authUser.role === Role.ADMIN
      ? await adminRepository.findById(req.authUser.id)
      : await userRepository.findById(req.authUser.id);

  if (!entity) throw ApiError.notFound('Account not found');

  ApiResponse.success(res, HttpStatus.OK, 'Current user fetched', {
    role: req.authUser.role,
    profile: entity,
  });
});