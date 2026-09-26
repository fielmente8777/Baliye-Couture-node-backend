import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middlewares/auth';
import { REQUIRED_SCOPES, adminGraphQL, isShopifyConfigured, shopifyAuthMode } from '../config/shopify';
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
        hint: 'Set SHOPIFY_STORE_DOMAIN plus SHOPIFY_APP_CLIENT_ID and SHOPIFY_APP_CLIENT_SECRET (or a legacy SHOPIFY_ADMIN_TOKEN), then restart',
      });
    }

    try {
      const result = await adminGraphQL<{
        shop: { name: string; myshopifyDomain: string; plan: { displayName: string } };
        currentAppInstallation: { accessScopes: { handle: string }[] };
      }>(`query {
        shop { name myshopifyDomain plan { displayName } }
        currentAppInstallation { accessScopes { handle } }
      }`);

      /* What the token can ACTUALLY do — the Dev Dashboard shows what was
         requested, which only applies once the version is released and the
         store has approved it. write_x implies read_x. */
      const granted = result.currentAppInstallation.accessScopes.map((s) => s.handle);
      const has = (scope: string) =>
        granted.includes(scope) || (scope.startsWith('read_') && granted.includes(scope.replace('read_', 'write_')));
      const missing = REQUIRED_SCOPES.filter((scope) => !has(scope));
      const authMode = shopifyAuthMode();

      ApiResponse.success(res, HttpStatus.OK, missing.length ? 'Shopify connected — scopes missing' : 'Shopify connected', {
        configured: true,
        shop: result.shop.name,
        domain: result.shop.myshopifyDomain,
        plan: result.shop.plan.displayName,
        authMode,
        grantedScopes: granted,
        missingScopes: missing,
        hint: missing.length
          ? authMode === 'static_token'
            ? 'The backend is using SHOPIFY_ADMIN_TOKEN, whose scopes are fixed when that token was created — Dev Dashboard changes do not affect it. Set SHOPIFY_APP_CLIENT_ID and SHOPIFY_APP_CLIENT_SECRET instead (and remove SHOPIFY_ADMIN_TOKEN), then restart.'
            : 'Release the app version that lists these scopes, approve the updated permissions in Shopify admin → Settings → Apps, then call this again.'
          : undefined,
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
