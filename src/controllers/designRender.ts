import { Request, Response } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import * as renderService from '../services/designRender';
import * as colourService from '../services/colourRender';
import '../services/imageTasks';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';

/** Stepper: the suit photo re-dyed to the chosen colour; poll until ready. */
export const recolourPhoto = asyncHandler(async (req: Request, res: Response) => {
  const result = await colourService.recolourPhoto(req.body, req.authUser?.id);
  ApiResponse.success(res, HttpStatus.OK, 'Recolour started', result);
});

/** Free check: is this colour already generated (or generating)? null if not. */
export const lookupColourRender = asyncHandler(async (req: Request, res: Response) => {
  const result = await colourService.lookupColourRender(req.body);
  ApiResponse.success(res, HttpStatus.OK, 'Recolour looked up', result);
});

export const getColourRender = asyncHandler(async (req: Request, res: Response) => {
  const result = await colourService.getColourRender(req.params.key);
  ApiResponse.success(res, HttpStatus.OK, 'Recolour fetched', result);
});

export const setEmbroideryCollection = asyncHandler(async (req: Request, res: Response) => {
  const option = await renderService.setEmbroideryCollection(
    req.params.optionId,
    req.body.collectionId,
  );
  ApiResponse.success(res, HttpStatus.OK, 'Embroidery option linked', option);
});

