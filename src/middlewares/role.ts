import { NextFunction, Request, Response } from 'express';
import { Role } from '@constants/role';
import { ApiError } from '@utils/apiError';

export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser) {
      throw ApiError.unauthorized();
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      throw ApiError.forbidden('You do not have permission to perform this action');
    }
    next();
  };
};