import { z } from 'zod';

const objectId = z.string().length(24);
const password = z.string().min(8, 'Use at least 8 characters').max(100);

export const addMemberSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email('Enter a valid email').max(120),
    password,
  }),
});

export const updateMemberSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      password: password.optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change'),
});

export const memberParamSchema = z.object({
  params: z.object({ id: objectId }),
});
