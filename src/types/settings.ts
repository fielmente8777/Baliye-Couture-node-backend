import { z } from 'zod';

export const updateSettingsSchema = z.object({
  body: z
    .object({
      creditsEnabled: z.boolean(),
      /** "How to measure" video — a YouTube/Vimeo link or a direct .mp4. "" removes it. */
      measureVideoUrl: z.union([z.literal(''), z.string().trim().url().max(500)]),
    })
    .partial()
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Nothing to update'),
});
