import { Response } from 'express';

interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export class ApiResponse {
  static success(res: Response, statusCode: number, message: string, data: unknown = {}, meta?: Meta) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      ...(meta ? { meta } : {}),
    });
  }

  static error(res: Response, statusCode: number, message: string, errors: unknown[] = []) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }
}