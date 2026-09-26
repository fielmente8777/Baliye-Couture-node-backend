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
wishlistRoutes.get('/', getWishlist);

/** Only ids — call once per page to fill the heart icons. */
wishlistRoutes.get('/ids', getWishlistRefs);

wishlistRoutes.post('/', validate(addWishlistSchema), addToWishlist);

/** Un-heart from a product card, where the wishlist item id isn't known. */
wishlistRoutes.post('/remove', validate(removeByRefSchema), removeByRef);

wishlistRoutes.delete('/:itemId', validate(wishlistItemParamSchema), removeFromWishlist);

wishlistRoutes.post('/:itemId/move-to-cart', validate(moveToCartSchema), moveToCart);

export default wishlistRoutes;
