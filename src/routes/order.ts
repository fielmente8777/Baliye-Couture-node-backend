import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import {
  cancelOrderSchema,
  cancelShopifyOrderSchema,
  designCheckoutSchema,
  shopifyOrderParamSchema,
  shopifyReturnSchema,
} from '../types/order';
import {
  cancelUserOrder,
  deleteUserOrder,
  getOrderTracking,
  getUserOrderById,
  getUserOrders,
  getUserShopifyOrders,
  cancelUserShopifyOrder,
  getUserShopifyOrderDetail,
  requestUserShopifyReturn,
  startDesignCheckout,
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

/**
 * @openapi
 * /orders/shopify/checkout:
 *   post:
 *     summary: Pay for the cart's custom designs on Shopify
 *     description: >
 *       Creates (or refreshes) a Shopify draft order for the designs in the
 *       cart, priced by this server, and returns its checkout URL. Paying
 *       there creates the Shopify order; the designs then leave the cart.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/DesignCheckoutBody' }
 *     responses:
 *       200: { description: Checkout URL }
 */
orderRoutes.post('/shopify/checkout', validate(designCheckoutSchema), startDesignCheckout);

/* Ready-to-wear: cancel before dispatch (full refund), or request a return /
   replacement after delivery. :orderId is Shopify's numeric order id. */
/* One order with return statuses and exact returnable quantities. */
/**
 * @openapi
 * /orders/shopify/{orderId}:
 *   get:
 *     summary: One of my Shopify orders, with its items, fulfilment and returns
 *     description: >
 *       orderId is the numeric Shopify order id (the tail of its GID). Only the signed-in
 *       customer's own orders are returned.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: orderId, in: path, required: true, schema: { type: string }, description: Numeric Shopify order id }
 *     responses:
 *       200: { description: Order detail }
 *       404: { description: Not your order, or not found }
 */
orderRoutes.get('/shopify/:orderId', validate(shopifyOrderParamSchema), getUserShopifyOrderDetail);
/**
 * @openapi
 * /orders/shopify/{orderId}/cancel:
 *   post:
 *     summary: Cancel my ready-to-wear order before dispatch
 *     description: >
 *       Cancels the Shopify order with a full refund. Refused once it has been fulfilled.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: orderId, in: path, required: true, schema: { type: string }, description: Numeric Shopify order id }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CancelShopifyOrderBody' }
 *     responses:
 *       200: { description: Cancelled }
 *       400: { description: Already dispatched or cancelled }
 */
orderRoutes.post('/shopify/:orderId/cancel', validate(cancelShopifyOrderSchema), cancelUserShopifyOrder);
/**
 * @openapi
 * /orders/shopify/{orderId}/returns:
 *   post:
 *     summary: Ask to return or replace items from a delivered order
 *     description: >
 *       Creates a Shopify return request for the chosen line items, with a reason and
 *       whether the customer wants a replacement or a refund.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: orderId, in: path, required: true, schema: { type: string }, description: Numeric Shopify order id }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ShopifyReturnBody' }
 *     responses:
 *       201: { description: Return requested }
 *       400: { description: Not delivered yet, or invalid items }
 */
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
/**
 * @openapi
 * /orders/replacements:
 *   get:
 *     summary: All my replacement and alteration requests
 *     description: >
 *       Across every made-to-order order, newest first.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Replacement requests }
 */
orderRoutes.get('/replacements', getMyReplacements);

orderRoutes.get('/:id', validate(idParamSchema), getUserOrderById);

/* Replacement / alteration requests for a delivered order. */
/**
 * @openapi
 * /orders/{id}/replacements:
 *   post:
 *     summary: Request an alteration or replacement for a delivered item
 *     description: >
 *       For made-to-order (custom design) orders. itemIndex is the item's position in the order.
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateReplacementBody' }
 *     responses:
 *       201: { description: Request created }
 *       400: { description: Not delivered yet, or the item already has an open request }
 *   get:
 *     summary: Replacement and alteration requests for one of my orders
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Requests for this order }
 */
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
