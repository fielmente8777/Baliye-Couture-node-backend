import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { Role } from '../constants/role';
import { verifyAccessToken } from '../utils/jwt';

/** A signed-in admin: the panel loads and uploads a lot, and an admin token can't be had without logging in. */
function isAdmin(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  try {
    return verifyAccessToken(header.slice(7)).role === Role.ADMIN;
  } catch {
    return false;
  }
}

/**
 * The designer asks every few seconds whether a preview is ready, for up to
 * 90 s. Those checks are free reads of one key; the paid start is limited by
 * renderRateLimiter.
 */
const isPreviewStatusCheck = (req: Request) =>
  req.method === 'GET' && /\/designs\/(recolour|render)\/[^/]+$/.test(req.path);

export const globalRateLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  skip: (req) => isPreviewStatusCheck(req) || isAdmin(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    errors: [],
  },
});

/**
 * Design renders. Cached combinations cost nothing, but a NEW combination
 * queues one paid generation — this stops one visitor clicking through
 * hundreds of combinations and running up the OpenAI bill.
 */
export const renderRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many design previews, please wait a few minutes',
    errors: [],
  },
});

/** Stricter limiter for OTP send endpoint to prevent SMS abuse. */
export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later',
    errors: [],
  },
});
/** Newsletter sign-up form: a person signs up once, a script signs up thousands. */
export const newsletterRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sign-ups from here, please try again later',
    errors: [],
  },
});
