import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import {
  cancelOrderSchema,
  cancelShopifyOrderSchema,
  createOrderSchema,
  shopifyOrderParamSchema,
  shopifyReturnSchema,
} from '../types/order';
import {
  cancelUserOrder,
  createOrder,
  deleteUserOrder,
  getOrderTracking,
  getUserOrderById,
  getUserOrders,
  getUserShopifyOrders,
  cancelUserShopifyOrder,
  getUserShopifyOrderDetail,
  requestUserShopifyReturn,
} from '../controllers/order';
import { idParamSchema } from '../types/measurement';
import {
  createReplacement,
  getMyReplacements,
  getOrderReplacements,
} from '../controllers/replacement';
import { createReplacementSchema, orderIdParamSchema } from '../types/replacement';

const orderRoutes = Router();

orderRoutes.use(authenticate, authorize(Role.USER));

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Place an order from my cart
 *     description: >
 *       Fails if the cart is empty or the user has no saved measurements.
 *       Clears the cart on success and emits an ORDER_PLACED notification.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateOrderBody' }
 *     responses:
 *       201:
 *         description: Order placed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400: { description: Cart is empty, or measurements are missing }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   get:
 *     summary: List my orders
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: Paginated order history
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
orderRoutes.post('/', validate(createOrderSchema), createOrder);
orderRoutes.get('/', getUserOrders);

/**
 * @openapi
 * /orders/shopify:
 *   get:
 *     summary: List my ready-to-wear orders from Shopify
 *     description: >
 *       Orders placed through Shopify's hosted checkout, read live from the
 *       Shopify Admin API (matched by linked customer id or email). Newest
 *       first. Must stay registered above /orders/{id}.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Shopify orders
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
/* Registered before /:id — otherwise "shopify" is treated as an order id
   and rejected by idParamSchema. */
orderRoutes.get('/shopify', getUserShopifyOrders);

/* Ready-to-wear: cancel before dispatch (full refund), or request a return /
   replacement after delivery. :orderId is Shopify's numeric order id. */
/* One order with return statuses and exact returnable quantities. */
orderRoutes.get('/shopify/:orderId', validate(shopifyOrderParamSchema), getUserShopifyOrderDetail);
orderRoutes.post('/shopify/:orderId/cancel', validate(cancelShopifyOrderSchema), cancelUserShopifyOrder);
orderRoutes.post('/shopify/:orderId/returns', validate(shopifyReturnSchema), requestUserShopifyReturn);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Get one of my orders
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Order detail }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Soft-delete an order from my history
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Order removed from history }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
/* Before /:id, like /shopify. */
orderRoutes.get('/replacements', getMyReplacements);

orderRoutes.get('/:id', validate(idParamSchema), getUserOrderById);

/* Replacement / alteration requests for a delivered order. */
orderRoutes.post('/:id/replacements', validate(createReplacementSchema), createReplacement);
orderRoutes.get('/:id/replacements', validate(orderIdParamSchema), getOrderReplacements);
orderRoutes.delete('/:id', validate(idParamSchema), deleteUserOrder);

/**
 * @openapi
 * /orders/cancel/{id}:
 *   put:
 *     summary: Cancel one of my orders
 *     description: Only permitted while the order has not reached a terminal status.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CancelOrderBody' }
 *     responses:
 *       200: { description: Order cancelled }
 *       400: { description: Order is already delivered or cancelled }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
orderRoutes.put('/cancel/:id', validate(cancelOrderSchema), cancelUserOrder);

/**
 * @openapi
 * /orders/{id}/tracking:
 *   get:
 *     summary: Get the tracking history for one of my orders
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: Chronological status entries
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
orderRoutes.get('/:id/tracking', validate(idParamSchema), getOrderTracking);

export default orderRoutes;
