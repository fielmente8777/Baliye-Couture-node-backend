import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { upload } from '../middlewares/file';
import { validate } from '../middlewares/validate';
import { updateProfileSchema,
  requestPhoneChangeSchema,
  confirmPhoneChangeSchema } from '../types/profile';
import {
  deleteProfile,
  getProfile,
  updateProfile,
  requestPhoneChange,
  confirmPhoneChange,
  uploadProfileImage,
} from '../controllers/profile';

const profileRoutes = Router();

profileRoutes.use(authenticate, authorize(Role.USER));

/**
 * @openapi
 * /profile:
 *   get:
 *     summary: Get the current user's profile
 *     description: Identified from the Bearer token — there are no parameters.
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profile fetched
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   put:
 *     summary: Update the current user's profile
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateProfileBody' }
 *     responses:
 *       200: { description: Profile updated }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   delete:
 *     summary: Soft-delete the current user's profile
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile deleted }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
profileRoutes.get('/', getProfile);
profileRoutes.put('/', validate(updateProfileSchema), updateProfile);
profileRoutes.delete('/', deleteProfile);

/**
 * @openapi
 * /profile/phone/request:
 *   post:
 *     summary: Start changing my phone number
 *     description: >
 *       Sends a code to the NEW number. Verifying the new number is what proves
 *       the customer controls it — a plain profile update cannot change phone,
 *       because it is the login identity.
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RequestPhoneChangeBody' }
 *     responses:
 *       200: { description: Code sent }
 *       409: { description: That number belongs to another account }
 */
profileRoutes.post('/phone/request', validate(requestPhoneChangeSchema), requestPhoneChange);

/**
 * @openapi
 * /profile/phone/confirm:
 *   post:
 *     summary: Confirm the code and update my phone number
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ConfirmPhoneChangeBody' }
 *     responses:
 *       200: { description: Phone updated }
 *       400: { description: Invalid or expired code }
 */
profileRoutes.post('/phone/confirm', validate(confirmPhoneChangeSchema), confirmPhoneChange);

/**
 * @openapi
 * /profile/image:
 *   post:
 *     summary: Upload a profile image
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [profileImage]
 *             properties:
 *               profileImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200: { description: Profile image updated }
 *       400: { description: No image file provided or file type rejected }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
profileRoutes.post('/image', upload.single('profileImage'), uploadProfileImage);

export default profileRoutes;
