import { Router } from 'express';

import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import {
  addWishlistSchema,
  moveToCartSchema,
  removeByRefSchema,
  wishlistItemParamSchema,
} from '../types/wishlist';
import {
  addToWishlist,
  getWishlist,
  getWishlistRefs,
  moveToCart,
  removeByRef,
  removeFromWishlist,
} from '../controllers/wishlist';

const wishlistRoutes = Router();

wishlistRoutes.use(authenticate, authorize(Role.USER));

/** Full list for the My Wishlist page. */
/**
 * @openapi
 * /wishlist:
 *   get:
 *     summary: My wishlist
 *     description: >
 *       Saved products, custom designs and Shopify products, newest first.
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Wishlist items }
 *   post:
 *     summary: Save something to my wishlist
 *     description: >
 *       kind decides which id is required: productId, customDesignId or shopifyProductId.
 *       Saving the same thing twice changes nothing.
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AddWishlistBody' }
 *     responses:
 *       200: { description: The wishlist after saving }
 *       400: { description: The wishlist is full }
 *       404: { description: Product or design not found }
 */
wishlistRoutes.get('/', getWishlist);

/** Only ids — call once per page to fill the heart icons. */
/**
 * @openapi
 * /wishlist/ids:
 *   get:
 *     summary: Ids of everything in my wishlist
 *     description: >
 *       Lightweight, for showing filled hearts on product cards.
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Ids by kind }
 */
wishlistRoutes.get('/ids', getWishlistRefs);

wishlistRoutes.post('/', validate(addWishlistSchema), addToWishlist);

/** Un-heart from a product card, where the wishlist item id isn't known. */
/**
 * @openapi
 * /wishlist/remove:
 *   post:
 *     summary: Remove by what it is rather than by wishlist item id
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RemoveWishlistBody' }
 *     responses:
 *       200: { description: Removed }
 */
wishlistRoutes.post('/remove', validate(removeByRefSchema), removeByRef);

/**
 * @openapi
 * /wishlist/{itemId}:
 *   delete:
 *     summary: Remove a wishlist item
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: itemId, in: path, required: true, schema: { type: string }, description: Wishlist item id }
 *     responses:
 *       200: { description: Removed }
 *       404: { description: Not found }
 */
wishlistRoutes.delete('/:itemId', validate(wishlistItemParamSchema), removeFromWishlist);

/**
 * @openapi
 * /wishlist/{itemId}/move-to-cart:
 *   post:
 *     summary: Move a saved custom design to the cart
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: itemId, in: path, required: true, schema: { type: string }, description: Wishlist item id }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MoveToCartBody' }
 *     responses:
 *       200: { description: Moved to the cart }
 *       404: { description: Not found }
 */
wishlistRoutes.post('/:itemId/move-to-cart', validate(moveToCartSchema), moveToCart);

export default wishlistRoutes;
