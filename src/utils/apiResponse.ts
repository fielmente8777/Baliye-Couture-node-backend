import { Response } from 'express';

interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export function success(
  res: Response,
  statusCode: number,
  message: string,
  data: unknown = {},
  meta?: Meta
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function error(res: Response, statusCode: number, message: string, errors: unknown[] = []) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
}

/**
 * Kept as a namespace object so existing `ApiResponse.success(...)` call
 * sites keep working — it is a plain object of functions, not a class.
 */
export const ApiResponse = { success, error };
