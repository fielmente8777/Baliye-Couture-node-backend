import { Router } from 'express';
import authRoutes from './auth';
import profileRoutes from './profile';
import measurementRoutes from './measurement';
import designRoutes from './design';
import cartRoutes from './cart';
import orderRoutes from './order';

const router = Router();

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/measurements', measurementRoutes);
router.use('/design', designRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
// router.use('/admin', adminRoutes);

export default router;
