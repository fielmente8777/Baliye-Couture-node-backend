import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as productService from '../services/product';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';
import { getPagination } from '../utils/pagination';

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { skip, limit, page } = getPagination(req);
  const { items, total } = await productService.listProducts(req.query, skip, limit, true);

  ApiResponse.success(res, HttpStatus.OK, 'Products fetched', items, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

export const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProductBySlug(req.params.slug);
  ApiResponse.success(res, HttpStatus.OK, 'Product fetched', product);
});

export const getRelatedProducts = asyncHandler(async (req: Request, res: Response) => {
  const products = await productService.getRelated(req.params.slug);
  ApiResponse.success(res, HttpStatus.OK, 'Related products fetched', products);
});

/* ---- Admin ---- */

export const listAllProducts = asyncHandler(async (req: Request, res: Response) => {
  const { skip, limit, page } = getPagination(req);
  const { items, total } = await productService.listProducts(req.query, skip, limit, false);

  ApiResponse.success(res, HttpStatus.OK, 'Products fetched', items, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProductById(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Product fetched', product);
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.createProduct(req.body, req.authUser?.id);
  ApiResponse.success(res, HttpStatus.CREATED, 'Product created', product);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.updateProduct(req.params.id, req.body, req.authUser?.id);
  ApiResponse.success(res, HttpStatus.OK, 'Product updated', product);
});

export const setProductStatus = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.setStatus(req.params.id, req.body.status, req.authUser?.id);
  ApiResponse.success(res, HttpStatus.OK, 'Product status updated', product);
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteProduct(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Product archived');
});
