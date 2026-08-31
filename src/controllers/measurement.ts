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

// ---- User: measurement profiles ----
export const getMeasurementProfiles = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const profiles = await measurementService.getProfiles(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Measurement profiles fetched', profiles);
});

export const getMeasurementProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const profile = await measurementService.getProfileById(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Measurement profile fetched', profile);
});

export const createMeasurementProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const profile = await measurementService.createProfile(req.authUser.id, req.body);
  ApiResponse.success(res, HttpStatus.CREATED, 'Measurement profile created', profile);
});

export const updateMeasurementProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const profile = await measurementService.updateProfile(req.params.id, req.authUser.id, req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Measurement profile updated', profile);
});

export const deleteMeasurementProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  await measurementService.deleteProfile(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, 'Measurement profile deleted');
});
