import { Router } from 'express';
import authRoutes from './auth';
import profileRoutes from './profile';
import measurementRoutes from './measurement';
import designRoutes from './design';
import cartRoutes from './cart';
import orderRoutes from './order';
import addressRoutes from './address';
import customDesignRoutes from './design.v2';
import catalogRoutes from './catalog';
import adminRoutes from './admin';

const router = Router();

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/measurements', measurementRoutes);
router.use('/design', designRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/addresses', addressRoutes);
router.use('/designs', customDesignRoutes);
router.use('/', catalogRoutes);
router.use('/admin', adminRoutes);

export default router;
