import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { upload } from '../middlewares/file';
import { validate } from '../middlewares/validate';
import { updateProfileSchema } from '../types/profile';
import { deleteProfile, getProfile, updateProfile, uploadProfileImage } from '../controllers/profile';

const profileRoutes = Router();

profileRoutes.use(authenticate, authorize(Role.USER));

/**
 * @openapi
 * /profile:
 *   get:
 *     summary: Get the current user's profile
 *     tags: [Profile]
 *   put:
 *     summary: Update the current user's profile
 *     tags: [Profile]
 *   delete:
 *     summary: Soft-delete the current user's profile
 *     tags: [Profile]
 */
profileRoutes.get('/', getProfile);
profileRoutes.put('/', validate(updateProfileSchema), updateProfile);
profileRoutes.delete('/', deleteProfile);
profileRoutes.post('/image', upload.single('profileImage'), uploadProfileImage);

export default profileRoutes;