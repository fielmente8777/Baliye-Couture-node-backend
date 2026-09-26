import { Request, Response } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as wishlistService from '../services/wishlist';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';

const uid = (req: Request) => {
  if (!req.authUser) throw ApiError.unauthorized();
  return req.authUser.id;
};

export const getWishlist = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Wishlist fetched', await wishlistService.getWishlist(uid(req)));
});

export const getWishlistRefs = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Wishlist ids fetched', await wishlistService.getWishlistRefs(uid(req)));
});

export const addToWishlist = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'Added to wishlist', await wishlistService.addToWishlist(uid(req), req.body));
});

export const removeFromWishlist = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(
    res,
    HttpStatus.OK,
    'Removed from wishlist',
    await wishlistService.removeFromWishlist(uid(req), req.params.itemId),
  );
});

export const removeByRef = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(
    res,
    HttpStatus.OK,
    'Removed from wishlist',
    await wishlistService.removeByRef(uid(req), req.body.kind, req.body.ref),
  );
});

export const moveToCart = asyncHandler(async (req: Request, res: Response) => {
  ApiResponse.success(
    res,
    HttpStatus.OK,
    'Moved to cart',
    await wishlistService.moveToCart(uid(req), req.params.itemId, req.body.measurementProfileId),
  );
});
