import { Request, Response } from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import * as tokenService from '../services/tokens';
import * as aiCreditService from '../services/aiCredit';
import { HttpStatus } from '../constants/httpstatus';
import { ApiResponse } from '../utils/apiResponse';

/** Balance, costs, packs and recent history for the signed-in customer. */
export const getMyWallet = asyncHandler(async (req: Request, res: Response) => {
  const wallet = await tokenService.getWallet(req.authUser!.id);
  ApiResponse.success(res, HttpStatus.OK, 'Wallet fetched', wallet);
});

export const grantTokens = asyncHandler(async (req: Request, res: Response) => {
  const result = await tokenService.grantTokens({ ...req.body, adminId: req.authUser?.id });
  ApiResponse.success(res, HttpStatus.OK, 'Tokens updated', result);
});

export const getCreditStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await tokenService.getCreditStats();
  ApiResponse.success(res, HttpStatus.OK, 'Credit stats fetched', stats);
});

/** The store's own AI credit (prepaid OpenAI balance). */
export const getAiCredit = asyncHandler(async (_req: Request, res: Response) => {
  ApiResponse.success(res, HttpStatus.OK, 'AI credit fetched', await aiCreditService.getAiCredit());
});

export const recordAiCredit = asyncHandler(async (req: Request, res: Response) => {
  const credit = await aiCreditService.recordAiCredit({ ...req.body, adminId: req.authUser?.id });
  ApiResponse.success(res, HttpStatus.OK, 'AI credit saved', credit);
});

export const getUserLedger = asyncHandler(async (req: Request, res: Response) => {
  const ledger = await tokenService.listLedger(req.params.userId);
  ApiResponse.success(res, HttpStatus.OK, 'Token history fetched', ledger);
});
