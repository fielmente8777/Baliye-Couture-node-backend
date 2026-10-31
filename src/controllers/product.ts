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

