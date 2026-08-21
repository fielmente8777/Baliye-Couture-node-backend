import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import { cancelOrderSchema, createOrderSchema } from '../types/order';
import { cancelUserOrder, createOrder, deleteUserOrder, getOrderTracking, getUserOrderById, getUserOrders } from '../controllers/order';
import { idParamSchema } from '../types/measurement';

const orderRoutes = Router();

orderRoutes.use(authenticate, authorize(Role.USER));

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Place an order from my cart
 *     tags: [Orders]
 *   get:
 *     summary: List my orders
 *     tags: [Orders]
 */
orderRoutes.post('/', validate(createOrderSchema), createOrder);
orderRoutes.get('/', getUserOrders);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Get one of my orders
 *     tags: [Orders]
 *   delete:
 *     summary: Soft-delete an order from my history
 *     tags: [Orders]
 */
orderRoutes.get('/:id', validate(idParamSchema), getUserOrderById);
orderRoutes.delete('/:id', validate(idParamSchema), deleteUserOrder);

/**
 * @openapi
 * /orders/cancel/{id}:
 *   put:
 *     summary: Cancel one of my orders
 *     tags: [Orders]
 */
orderRoutes.put('/cancel/:id', validate(cancelOrderSchema),cancelUserOrder);

/**
 * @openapi
 * /orders/{id}/tracking:
 *   get:
 *     summary: Get the tracking history for one of my orders
 *     tags: [Orders]
 */
orderRoutes.get('/:id/tracking', validate(idParamSchema),getOrderTracking);

export default orderRoutes;