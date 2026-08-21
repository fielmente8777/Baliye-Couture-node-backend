import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { asyncHandler } from '@utils/asyncHandler';
import { ApiResponse } from '@utils/apiResponse';
import { HttpStatus } from '@constants/httpstatus';
import { ApiError } from '@utils/apiError';
import * as adminRepository from '@repositories/admin.repository';
import * as userRepository from '@repositories/user.repository';
import { getPagination, buildMeta, buildSearchFilter } from '@utils/pagination';

export const getAdminProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const admin = await adminRepository.findById(req.authUser.id);
  if (!admin) throw ApiError.notFound('Admin not found');
  ApiResponse.success(res, HttpStatus.OK, 'Admin profile fetched', admin);
});

export const updateAdminProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const { password, ...rest } = req.body;
  const updates: Record<string, unknown> = { ...rest };

  if (password) {
    updates.passwordHash = await bcrypt.hash(password, 10);
  }

  const admin = await adminRepository.updateById(req.authUser.id, updates);
  if (!admin) throw ApiError.notFound('Admin not found');
  ApiResponse.success(res, HttpStatus.OK, 'Admin profile updated', admin);
});

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req);
  const filter = buildSearchFilter(req.query.search, ['name', 'email', 'phone']);
  const [users, total] = await Promise.all([
    userRepository.findAll(filter, skip, limit),
    userRepository.count(filter),
  ]);
  ApiResponse.success(res, HttpStatus.OK, 'Users fetched', users, buildMeta(page, limit, total));
});