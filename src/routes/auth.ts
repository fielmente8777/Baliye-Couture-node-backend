import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { adminLoginSchema, googleLoginSchema, refreshTokenSchema, registerSchema, sendOtpSchema, verifyOtpSchema } from '../types/auth';
import { otpRateLimiter } from '../middlewares/ratelimit';
import { authenticate } from '../middlewares/auth';
import { adminLogin, getMe, googleLogin, logout, refreshToken, register, sendOtp, verifyOtp } from '../controllers/auth';
const authRoutes = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Pre-register a user profile before first login
 *     tags: [Auth]
 */
authRoutes.post('/register', validate(registerSchema), register);

/**
 * @openapi
 * /auth/send-otp:
 *   post:
 *     summary: Send an OTP to a phone number
 *     tags: [Auth]
 */
authRoutes.post('/send-otp', otpRateLimiter, validate(sendOtpSchema),sendOtp);

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP and log in (creates user if not exists)
 *     tags: [Auth]
 */
authRoutes.post('/verify-otp', validate(verifyOtpSchema),verifyOtp);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Admin login with email/password
 *     tags: [Auth]
 */
authRoutes.post('/login', validate(adminLoginSchema), adminLogin);

/**
 * @openapi
 * /auth/google:
 *   post:
 *     summary: Google OAuth login/registration
 *     tags: [Auth]
 */
authRoutes.post('/google', validate(googleLoginSchema),googleLogin);

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     summary: Exchange a valid refresh token for a new token pair
 *     tags: [Auth]
 */
authRoutes.post('/refresh-token', validate(refreshTokenSchema),refreshToken);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Revoke a refresh token
 *     tags: [Auth]
 */
authRoutes.post('/logout', validate(refreshTokenSchema), logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the currently authenticated user/admin
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
authRoutes.get('/me', authenticate, getMe);

export default authRoutes;