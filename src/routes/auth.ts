import { Router } from 'express';
import { validate } from '../middlewares/validate';
import {
  adminLoginSchema,
  googleLoginSchema,
  microsoftLoginSchema,
  refreshTokenSchema,
  registerSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from '../types/auth';
import { otpRateLimiter } from '../middlewares/ratelimit';
import { authenticate } from '../middlewares/auth';
import {
  adminLogin,
  getMe,
  googleLogin,
  microsoftLogin,
  logout,
  refreshToken,
  register,
  sendOtp,
  verifyOtp,
} from '../controllers/auth';

const authRoutes = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Pre-register a user profile before first login
 *     description: >
 *       Stores name/email/phone ahead of the first OTP or Google login so the
 *       OTP flow does not have to collect every field. This does NOT log the
 *       user in and returns no tokens.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RegisterBody' }
 *     responses:
 *       201:
 *         description: User profile created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409:
 *         description: An account with this phone or email already exists
 */
authRoutes.post('/register', validate(registerSchema), register);

/**
 * @openapi
 * /auth/send-otp:
 *   post:
 *     summary: Send a 6-digit OTP to a phone number
 *     description: >
 *       Rate limited. If Twilio credentials are absent the OTP is still stored
 *       and valid — read it from the `otps` collection during local testing.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SendOtpBody' }
 *     responses:
 *       200: { description: OTP sent }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { description: Too many OTP requests — try again later }
 */
authRoutes.post('/send-otp', otpRateLimiter, validate(sendOtpSchema), sendOtp);

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     summary: Verify an OTP and log in (creates the user if new)
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VerifyOtpBody' }
 *     responses:
 *       200:
 *         description: Logged in — copy accessToken into the Authorize dialog
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthTokens' }
 *       400: { description: OTP invalid, expired, or too many attempts }
 */
authRoutes.post('/verify-otp', validate(verifyOtpSchema), verifyOtp);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Admin login with email and password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminLoginBody' }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthTokens' }
 *       401: { description: Invalid credentials }
 */
authRoutes.post('/login', validate(adminLoginSchema), adminLogin);

/**
 * @openapi
 * /auth/google:
 *   post:
 *     summary: Google OAuth login / registration
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/GoogleLoginBody' }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthTokens' }
 *       401: { description: Google token could not be verified }
 */
authRoutes.post('/google', validate(googleLoginSchema), googleLogin);

/**
 * @openapi
 * /auth/microsoft:
 *   post:
 *     summary: Microsoft / Outlook login
 *     description: >
 *       Send the Microsoft Graph access token obtained by MSAL in the browser.
 *       The server validates it by calling Graph `/me` and creates the account
 *       on first sign-in.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MicrosoftLoginBody' }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthTokens' }
 *       401: { description: Microsoft token could not be verified }
 */
authRoutes.post('/microsoft', validate(microsoftLoginSchema), microsoftLogin);

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     summary: Exchange a valid refresh token for a new token pair
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RefreshTokenBody' }
 *     responses:
 *       200:
 *         description: New token pair issued
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthTokens' }
 *       401: { description: Refresh token invalid, expired or revoked }
 */
authRoutes.post('/refresh-token', validate(refreshTokenSchema), refreshToken);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Revoke a refresh token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RefreshTokenBody' }
 *     responses:
 *       200: { description: Refresh token revoked }
 */
authRoutes.post('/logout', validate(refreshTokenSchema), logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the currently authenticated user or admin
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The authenticated account
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
authRoutes.get('/me', authenticate, getMe);

export default authRoutes;
