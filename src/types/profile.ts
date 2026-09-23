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
