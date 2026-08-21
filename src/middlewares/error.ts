import { NextFunction, Request, Response } from 'express';
import { ApiError } from '@utils/apiError';
import { ApiResponse } from '@utils/apiResponse';
import { HttpStatus } from '@constants/httpstatus';
import { logger } from '@config/logger';

export function notFoundHandler(req: Request, res: Response) {
  ApiResponse.error(res, HttpStatus.NOT_FOUND, `Route not found: ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    if (!err.isOperational) {
      logger.error({ err }, 'Non-operational ApiError');
    }
    return ApiResponse.error(res, err.statusCode, err.message, err.errors);
  }

  // Mongoose duplicate key error
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    const keyValue = (err as { keyValue?: Record<string, unknown> }).keyValue;
    return ApiResponse.error(
      res,
      HttpStatus.CONFLICT,
      `Duplicate value for field: ${Object.keys(keyValue || {}).join(', ')}`
    );
  }

  // Mongoose validation error
  if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'ValidationError') {
    return ApiResponse.error(res, HttpStatus.BAD_REQUEST, 'Validation failed', [
      (err as { message?: string }).message,
    ]);
  }

  logger.error({ err }, 'Unhandled error');
  const message = err instanceof Error ? err.message : 'Internal server error';
  return ApiResponse.error(res, HttpStatus.INTERNAL_SERVER_ERROR, message);
}