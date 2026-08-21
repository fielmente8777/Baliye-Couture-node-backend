import { z } from 'zod';

export const sendOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(15),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(15),
    code: z.string().length(6),
  }),
});

export const googleLoginSchema = z.object({
  body: z.object({
    idToken: z.string().min(10),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().optional(),
    phone: z.string().min(8).max(15).optional(),
  }),
});

export const adminLoginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10),
  }),
});