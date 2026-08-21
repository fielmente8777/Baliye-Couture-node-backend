import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as orderService from '../services/order';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';
import { buildMeta, getPagination } from '../utils/pagination';
import { OrderStatus } from '../constants/orderstatus';

// ---- User ----
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const order = await orderService.placeOrder(req.authUser.id, req.body.shippingAddress);
  ApiResponse.success(res, HttpStatus.CREATED, 'Order placed successfully', order);
});

export const getUserOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const { page, limit, skip } = getPagination(req);
  const [orders, total] = await orderService.getUserOrders(req.authUser.id, skip, limit);
  ApiResponse.success(res, HttpStatus.OK, 'Orders fetched', orders, buildMeta(page, limit, total));
});

export const getUserOrderById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const order = await orderService.getUserOrderById(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Order fetched', order);
});

export const cancelUserOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const order = await orderService.cancelUserOrder(req.params.id, req.authUser.id, req.body.reason);
  ApiResponse.success(res, HttpStatus.OK, 'Order cancelled', order);
});

export const deleteUserOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  await orderService.deleteUserOrderHistory(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Order removed from history');
});

export const getOrderTracking = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const tracking = await orderService.getTracking(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Order tracking fetched', tracking);
});

// ---- Admin ----
export const getAllOrdersAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req);
  const status = req.query.status as OrderStatus | undefined;
  const [orders, total] = await orderService.getAllOrdersAdmin(status ? { status } : {}, skip, limit);
  ApiResponse.success(res, HttpStatus.OK, 'Orders fetched', orders, buildMeta(page, limit, total));
});

export const getOrderByIdAdmin = asyncHandler(async (req: Request, res: Response) => {
  const order = await orderService.getOrderByIdAdmin(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Order fetched', order);
});

export const updateOrderStatusAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const order = await orderService.updateStatusAdmin(
    req.params.id,
    req.authUser.id,
    req.body.status,
    req.body.remarks
  );
  ApiResponse.success(res, HttpStatus.OK, 'Order status updated', order);
});

export const cancelOrderAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const order = await orderService.cancelOrderAdmin(req.params.id, req.authUser.id, req.body.reason);
  ApiResponse.success(res, HttpStatus.OK, 'Order cancelled', order);
});

export const deleteOrderAdmin = asyncHandler(async (req: Request, res: Response) => {
  await orderService.deleteOrderAdmin(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Order deleted');
});