import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as orderService from '../services/order';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';
import { buildMeta, getPagination } from '../utils/pagination';
import { OrderStatus } from '../constants/orderstatus';
import * as userRepository from '../repositories/user.repository';
import {
  cancelShopifyOrder,
  getShopifyOrderDetail,
  getShopifyOrdersForUser,
  requestShopifyReturn,
} from '../services/shopifyOrders';

// ---- User ----
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const order = await orderService.placeOrder(
    req.authUser.id,
    req.body.shippingAddress,
    req.body.measurementProfileId,
    req.body.shippingAddressId
  );
  ApiResponse.success(res, HttpStatus.CREATED, 'Order placed successfully', order);
});

export const getUserOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const { page, limit, skip } = getPagination(req);
  const [orders, total] = await orderService.getUserOrders(req.authUser.id, skip, limit);
  ApiResponse.success(res, HttpStatus.OK, 'Orders fetched', orders, buildMeta(page, limit, total));
});

/** Ready-to-wear orders placed through Shopify's checkout, read live from Shopify. */
export const getUserShopifyOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const user = await userRepository.findById(req.authUser.id);
  if (!user) throw ApiError.notFound('User not found');
  const orders = await getShopifyOrdersForUser(user);
  ApiResponse.success(res, HttpStatus.OK, 'Shopify orders fetched', orders);
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
/* ---- Shopify (ready-to-wear) order actions ---- */

async function currentUser(req: Request) {
  if (!req.authUser) throw ApiError.unauthorized();
  const user = await userRepository.findById(req.authUser.id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export const cancelUserShopifyOrder = asyncHandler(async (req: Request, res: Response) => {
  const result = await cancelShopifyOrder(await currentUser(req), req.params.orderId, req.body.reason);
  ApiResponse.success(res, HttpStatus.OK, 'Order cancelled — your refund is on its way', result);
});

export const requestUserShopifyReturn = asyncHandler(async (req: Request, res: Response) => {
  const result = await requestShopifyReturn(await currentUser(req), req.params.orderId, req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Return requested', result);
});

export const getUserShopifyOrderDetail = asyncHandler(async (req: Request, res: Response) => {
  const order = await getShopifyOrderDetail(await currentUser(req), req.params.orderId);
  ApiResponse.success(res, HttpStatus.OK, 'Shopify order fetched', order);
});
