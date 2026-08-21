import { Router } from 'express';
import { authorize } from '../middlewares/role';
import { authenticate } from '../middlewares/auth';
import { Role } from '../constants/role';
import { addToCart, clearCart, getCart, removeCartItem, updateCartItem } from '../controllers/cart';
import { addToCartSchema, updateCartItemSchema } from '../types/cart';
import { validate } from '../middlewares/validate';

const cartRoutes = Router();

cartRoutes.use(authenticate, authorize(Role.USER));

/**
 * @openapi
 * /cart:
 *   get:
 *     summary: Get my cart
 *     tags: [Cart]
 *   post:
 *     summary: Add a suit design to my cart
 *     tags: [Cart]
 *   delete:
 *     summary: Clear my cart
 *     tags: [Cart]
 */
cartRoutes.get('/', getCart);
cartRoutes.post('/', validate(addToCartSchema), addToCart);
cartRoutes.delete('/', clearCart);

/**
 * @openapi
 * /cart/{id}:
 *   put:
 *     summary: Update quantity of a cart item
 *     tags: [Cart]
 *   delete:
 *     summary: Remove an item from my cart
 *     tags: [Cart]
 */
cartRoutes.put('/:id', validate(updateCartItemSchema), updateCartItem);
cartRoutes.delete('/:id', removeCartItem);

export default cartRoutes;