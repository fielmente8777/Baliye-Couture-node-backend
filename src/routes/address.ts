import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import {
  addressIdParamSchema,
  createAddressSchema,
  updateAddressSchema,
} from '../types/address';
import {
  createAddress,
  deleteAddress,
  getAddress,
  getAddresses,
  updateAddress,
} from '../controllers/address';

const addressRoutes = Router();

addressRoutes.use(authenticate, authorize(Role.USER));

/**
 * @openapi
 * /addresses:
 *   get:
 *     summary: List my saved addresses
 *     description: Default first, then oldest to newest.
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Addresses
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     summary: Save a new address
 *     description: The first address a user saves becomes their default automatically.
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateAddressBody' }
 *     responses:
 *       201: { description: Address created }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
addressRoutes.get('/', getAddresses);
addressRoutes.post('/', validate(createAddressSchema), createAddress);

/**
 * @openapi
 * /addresses/{id}:
 *   get:
 *     summary: Get one of my addresses
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Address }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: Update one of my addresses
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateAddressBody' }
 *     responses:
 *       200: { description: Address updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete one of my addresses
 *     description: Soft delete. If it was the default, the next address becomes default.
 *     tags: [Addresses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Address deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
addressRoutes.get('/:id', validate(addressIdParamSchema), getAddress);
addressRoutes.put('/:id', validate(updateAddressSchema), updateAddress);
addressRoutes.delete('/:id', validate(addressIdParamSchema), deleteAddress);

export default addressRoutes;
