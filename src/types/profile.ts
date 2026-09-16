import { z } from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    gender: z.enum(["male", "female", "other"]).optional(),
    dob: z.coerce.date().optional(),
    address: z.string().max(300).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    phone: z.string().min(8).max(20).optional(),
  }),
});

/** E.164 with the country code — "+919876543210". */
const e164 = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Include the country code, e.g. +919876543210");

export const requestPhoneChangeSchema = z.object({
  body: z.object({ phone: e164 }),
});

export const confirmPhoneChangeSchema = z.object({
  body: z.object({
    phone: e164,
    code: z.string().length(6, "The code is 6 digits"),
  }),
});
