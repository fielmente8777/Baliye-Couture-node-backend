import { z } from 'zod';

const objectId = z.string().length(24);

export const createReplacementSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    itemIndex: z.number().int().min(0),
    type: z.enum(['alteration', 'replacement']),
    reason: z.enum(['fit_issue', 'wrong_item', 'damaged', 'defect', 'not_as_designed', 'other']),
    description: z.string().trim().min(10, 'Tell us a little more about the problem').max(1000),
    photos: z.array(z.string().min(100)).max(4).optional(),
  }),
});

export const orderIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const replacementListQuerySchema = z.object({
  query: z.object({
    status: z.enum(['requested', 'approved', 'rejected', 'in_progress', 'completed']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const updateReplacementSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(['approved', 'rejected', 'in_progress', 'completed']),
    note: z.string().trim().max(500).optional(),
  }),
});
