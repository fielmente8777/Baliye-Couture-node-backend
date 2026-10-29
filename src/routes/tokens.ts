import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { getMyWallet } from '../controllers/tokens';

const tokenRoutes = Router();

tokenRoutes.use(authenticate, authorize(Role.USER));

/**
 * @openapi
 * /tokens/me:
 *   get:
 *     summary: My design-token wallet
 *     description: >
 *       Balance, what each AI preview costs, the packs on offer and the last 30
 *       changes. `enabled` is false while the token system is switched off.
 *     tags: [Tokens]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Wallet }
 */
tokenRoutes.get('/me', getMyWallet);

export default tokenRoutes;
