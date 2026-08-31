import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as addressService from '../services/address';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export const getAddresses = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const addresses = await addressService.getAddresses(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Addresses fetched', addresses);
});

export const getAddress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const address = await addressService.getAddressById(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Address fetched', address);
});

export const createAddress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const address = await addressService.createAddress(req.authUser.id, req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Address created', address);
});

export const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const address = await addressService.updateAddress(req.params.id, req.authUser.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Address updated', address);
});

export const deleteAddress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  await addressService.deleteAddress(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Address deleted');
});
