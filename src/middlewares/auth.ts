import { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { verifyAccessToken } from '../utils/jwt';

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token is required');
  }

  const token = header.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    req.authUser = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
});

/**
 * Reads the user when a token is sent, carries on as a guest when none is.
 * A token that IS sent must still be valid — an expired one gets the 401 the
 * client needs to refresh, rather than being silently treated as a guest.
 */
export const optionalAuthenticate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers.authorization) return next();
    return authenticate(req, res, next);
  },
);