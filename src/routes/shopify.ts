import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middlewares/auth';
import { adminGraphQL, isShopifyConfigured } from '../config/shopify';
import { syncCustomer } from '../services/shopifyCustomer';
import * as userRepository from '../repositories/user.repository';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const shopifyRoutes = Router();

/**
 * @openapi
 * /shopify/status:
 *   get:
 *     summary: Check the Shopify connection
 *     description: >
 *       Confirms the store domain and Admin token work, without creating
 *       anything. Use this first after adding credentials — a wrong token
 *       otherwise only shows up as a silent sync failure in the logs.
 *     tags: [Shopify]
 *     security: []
 *     responses:
 *       200: { description: Shop name and plan, or a clear reason it failed }
 */
shopifyRoutes.get(
  '/status',
  asyncHandler(async (_req, res) => {
    if (!isShopifyConfigured()) {
      return ApiResponse.success(res, HttpStatus.OK, 'Shopify is not configured', {
        configured: false,
        hint: 'Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN, then restart',
      });
    }

    try {
      const result = await adminGraphQL<{
        shop: { name: string; myshopifyDomain: string; plan: { displayName: string } };
      }>(`query { shop { name myshopifyDomain plan { displayName } } }`);

      ApiResponse.success(res, HttpStatus.OK, 'Shopify connected', {
        configured: true,
        shop: result.shop.name,
        domain: result.shop.myshopifyDomain,
        plan: result.shop.plan.displayName,
      });
    } catch (error) {
      ApiResponse.success(res, HttpStatus.OK, 'Shopify connection failed', {
        configured: true,
        connected: false,
        error: (error as Error).message,
      });
    }
  }),
);

/**
 * @openapi
 * /shopify/sync-me:
 *   post:
 *     summary: Link my account to a Shopify customer now
 *     description: >
 *       Normally happens in the background at login. This forces it and
 *       reports the result, which is the quickest way to prove the mirror
 *       works end to end.
 *     tags: [Shopify]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The linked Shopify customer id, or why it failed }
 */
shopifyRoutes.post(
  '/sync-me',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.authUser) throw ApiError.unauthorized();

    const user = await userRepository.findById(req.authUser.id);
    if (!user) throw ApiError.notFound('User not found');

    const shopifyCustomerId = await syncCustomer(user);

    ApiResponse.success(res, HttpStatus.OK, 'Sync attempted', {
      shopifyCustomerId,
      linked: Boolean(shopifyCustomerId),
    });
  }),
);

export default shopifyRoutes;
