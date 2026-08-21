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
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Cart with populated suit designs
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     summary: Add a suit design to my cart
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AddToCartBody' }
 *     responses:
 *       200: { description: Item added }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { description: Suit design not found }
 *   delete:
 *     summary: Clear my cart
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cart cleared }
 */
cartRoutes.get('/', getCart);
cartRoutes.post('/', validate(addToCartSchema), addToCart);
cartRoutes.delete('/', clearCart);

/**
 * @openapi
 * /cart/{id}:
 *   put:
 *     summary: Update the quantity of a cart item
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateCartItemBody' }
 *     responses:
 *       200: { description: Quantity updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Remove an item from my cart
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Item removed }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
cartRoutes.put('/:id', validate(updateCartItemSchema), updateCartItem);
cartRoutes.delete('/:id', removeCartItem);

export default cartRoutes;
