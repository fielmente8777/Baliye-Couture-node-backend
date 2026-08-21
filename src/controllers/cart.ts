import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as cartService from '../services/cart';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';

export const getCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const cart = await cartService.getCart(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Cart fetched', cart);
});

export const addToCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const cart = await cartService.addItem(req.authUser.id, req.body.suitDesignId, req.body.quantity);
  ApiResponse.success(res, HttpStatus.CREATED, 'Item added to cart', cart);
});

export const updateCartItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const cart = await cartService.updateItemQuantity(req.authUser.id, req.params.id, req.body.quantity);
  ApiResponse.success(res, HttpStatus.OK, 'Cart item updated', cart);
});

export const removeCartItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const cart = await cartService.removeItem(req.authUser.id, req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Cart item removed', cart);
});

export const clearCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  await cartService.clearCart(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Cart cleared');
});