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

const measurementValuesSchema = z
  .array(
    z.object({
      templateId: z.string().length(24),
      value: z.number().positive(),
    })
  )
  .min(1);

export const createMeasurementProfileSchema = z.object({
  body: z.object({
    /** Optional — the server generates one from the user's name when omitted. */
    profileName: z.string().min(1).max(60).optional(),
    values: measurementValuesSchema,
    isDefault: z.boolean().optional(),
  }),
});

export const updateMeasurementProfileSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    profileName: z.string().min(1).max(60).optional(),
    values: measurementValuesSchema.optional(),
    isDefault: z.boolean().optional(),
  }),
});