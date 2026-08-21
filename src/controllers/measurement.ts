import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as measurementService from '../services/measurement';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

// ---- Admin ----
export const createMeasurementTemplate = asyncHandler(async (req: Request, res: Response) => {
  const template = await measurementService.createTemplate(req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Measurement template created', template);
});

export const getMeasurementTemplates = asyncHandler(async (req: Request, res: Response) => {
  const activeOnly = req.query.active === 'true';
  const templates = await measurementService.getAllTemplates(activeOnly);
  ApiResponse.success(res, HttpStatus.OK, 'Measurement templates fetched', templates);
});

export const updateMeasurementTemplate = asyncHandler(async (req: Request, res: Response) => {
  const template = await measurementService.updateTemplate(req.params.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Measurement template updated', template);
});

export const deleteMeasurementTemplate = asyncHandler(async (req: Request, res: Response) => {
  await measurementService.deleteTemplate(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Measurement template deleted');
});

// ---- User ----
export const getUserMeasurements = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const measurements = await measurementService.getUserMeasurements(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Measurements fetched', measurements);
});

export const updateUserMeasurements = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const measurements = await measurementService.updateUserMeasurements(req.authUser.id, req.body.values);
  ApiResponse.success(res, HttpStatus.OK, 'Measurements updated', measurements);
});