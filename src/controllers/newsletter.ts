import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpstatus';
import * as newsletter from '../services/newsletter';

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  await newsletter.subscribe(req.body.email, req.body.source);
  ApiResponse.success(res, HttpStatus.OK, "You're on the list");
});

export const listSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const search = typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined;
  const { items, total, totalPages } = await newsletter.listSubscribers({ search, page, limit });
  ApiResponse.success(res, HttpStatus.OK, 'Subscribers fetched', items, { page, limit, total, totalPages });
});

export const exportSubscribers = asyncHandler(async (_req: Request, res: Response) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="newsletter-subscribers.csv"');
  res.send(await newsletter.subscribersCsv());
});

export const removeSubscriber = asyncHandler(async (req: Request, res: Response) => {
  await newsletter.removeSubscriber(req.params.id);
  ApiResponse.success(res, HttpStatus.OK, 'Subscriber removed');
});
