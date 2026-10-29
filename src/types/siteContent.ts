import { z } from 'zod';
import { CONTENT_PAGES } from '../models/sitecontent';

const pageParams = z.object({ page: z.enum(CONTENT_PAGES) });

export const contentPageParamSchema = z.object({ params: pageParams });

/** "Write with AI" in the content editor. */
export const writeContentSchema = z.object({
  body: z.object({
    action: z.enum(['write', 'improve', 'shorter', 'longer', 'fix', 'custom']),
    text: z.string().max(20000).optional(),
    instruction: z.string().max(1000).optional(),
    field: z.string().max(200).optional(),
    format: z.enum(['html', 'plain']).default('plain'),
  }),
});

export const saveContentSchema = z.object({
  params: pageParams,
  body: z.object({
    /* Free-form on purpose: each page has its own shape, owned by the frontend. */
    data: z.record(z.unknown()),
  }),
});
