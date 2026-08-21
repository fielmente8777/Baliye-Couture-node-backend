import { z } from 'zod';

export const createMeasurementTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(50),
    unit: z.enum(['in', 'cm']).default('in'),
    defaultValue: z.number().optional(),
    description: z.string().max(300).optional(),
    displayOrder: z.number().optional(),
  }),
});

export const updateMeasurementTemplateSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name: z.string().min(1).max(50).optional(),
    unit: z.enum(['in', 'cm']).optional(),
    defaultValue: z.number().optional(),
    description: z.string().max(300).optional(),
    displayOrder: z.number().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export const updateUserMeasurementSchema = z.object({
  body: z.object({
    values: z
      .array(
        z.object({
          templateId: z.string().length(24),
          value: z.number().positive(),
        })
      )
      .min(1),
  }),
});