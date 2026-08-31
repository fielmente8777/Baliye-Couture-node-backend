import { z } from 'zod';

const addressFields = {
  fullName: z.string().min(2).max(100),
  street: z.string().min(3).max(300),
  landmark: z.string().max(150).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  /** Six digits for India; kept as a string so leading zeros survive. */
  pincode: z.string().regex(/^\d{4,10}$/, 'Enter a valid pincode'),
  country: z.string().max(100).optional(),
  phone: z.string().min(8).max(20).optional(),
  type: z.enum(['home', 'work', 'other']).optional(),
  isDefault: z.boolean().optional(),
};

export const createAddressSchema = z.object({
  body: z.object(addressFields),
});

export const updateAddressSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    fullName: addressFields.fullName.optional(),
    street: addressFields.street.optional(),
    landmark: addressFields.landmark,
    city: addressFields.city.optional(),
    state: addressFields.state.optional(),
    pincode: addressFields.pincode.optional(),
    country: addressFields.country,
    phone: addressFields.phone,
    type: addressFields.type,
    isDefault: addressFields.isDefault,
  }),
});

export const addressIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});
