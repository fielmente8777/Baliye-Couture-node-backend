import { z } from 'zod';
import { CONTENT_PAGES } from '../models/sitecontent';

const pageParams = z.object({ page: z.enum(CONTENT_PAGES) });

export const contentPageParamSchema = z.object({ params: pageParams });

export const saveContentSchema = z.object({
  params: pageParams,
  body: z.object({
    /* Free-form on purpose: each page has its own shape, owned by the frontend. */
    data: z.record(z.unknown()),
  }),
});
