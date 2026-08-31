import { AnyZodObject, ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import * as addressTypes from '../types/address';
import * as authTypes from '../types/auth';
import * as customDesignTypes from '../types/customdesign';
import * as cartTypes from '../types/cart';
import * as designTypes from '../types/design';
import * as measurementTypes from '../types/measurement';
import * as orderTypes from '../types/order';
import * as profileTypes from '../types/profile';

/**
 * Swagger request bodies are generated from the same Zod schemas the
 * `validate` middleware enforces at runtime. One source of truth: if a field
 * is added to a schema, the docs pick it up on the next restart. Nothing to
 * keep in sync by hand.
 */
const bodySchemas: Record<string, AnyZodObject> = {
  RegisterBody: authTypes.registerSchema,
  SendOtpBody: authTypes.sendOtpSchema,
  VerifyOtpBody: authTypes.verifyOtpSchema,
  AdminLoginBody: authTypes.adminLoginSchema,
  GoogleLoginBody: authTypes.googleLoginSchema,
  MicrosoftLoginBody: authTypes.microsoftLoginSchema,
  RefreshTokenBody: authTypes.refreshTokenSchema,

  UpdateProfileBody: profileTypes.updateProfileSchema,

  CreateAddressBody: addressTypes.createAddressSchema,
  UpdateAddressBody: addressTypes.updateAddressSchema,

  CreateMeasurementTemplateBody: measurementTypes.createMeasurementTemplateSchema,
  UpdateMeasurementTemplateBody: measurementTypes.updateMeasurementTemplateSchema,
  CreateMeasurementProfileBody: measurementTypes.createMeasurementProfileSchema,
  UpdateMeasurementProfileBody: measurementTypes.updateMeasurementProfileSchema,

  CreateDesignOptionBody: designTypes.createDesignOptionSchema,
  UpdateDesignOptionBody: designTypes.updateDesignOptionSchema,
  CreateSuitDesignBody: designTypes.createSuitDesignSchema,

  QuotePriceBody: customDesignTypes.quotePriceSchema,
  CreateCustomDesignBody: customDesignTypes.createDesignSchema,
  UpdateSuitDesignBody: designTypes.updateSuitDesignSchema,

  AddToCartBody: cartTypes.addToCartSchema,
  UpdateCartItemBody: cartTypes.updateCartItemSchema,

  CreateOrderBody: orderTypes.createOrderSchema,
  UpdateOrderStatusBody: orderTypes.updateOrderStatusSchema,
  CancelOrderBody: orderTypes.cancelOrderSchema,
};

/**
 * The validate middleware wraps everything as { body, params, query }, so the
 * `body` branch is what an API consumer actually posts. Pull it out; skip any
 * schema that has no body (params-only schemas like idParamSchema).
 */
function extractBody(schema: AnyZodObject): ZodTypeAny | null {
  const shape = schema.shape as Record<string, ZodTypeAny | undefined>;
  return shape.body ?? null;
}

export function buildZodComponents(): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [name, schema] of Object.entries(bodySchemas)) {
    const body = extractBody(schema);
    if (!body) continue;

    /**
     * `as ZodTypeAny` keeps TS from trying to resolve the full recursive
     * generic of every schema at once (TS2589 on deeply nested objects like
     * createSuitDesignSchema). The runtime behaviour is unchanged.
     */
    const json = (zodToJsonSchema as (
      schema: unknown,
      opts: { target: string; $refStrategy: string }
    ) => Record<string, unknown>)(body, {
      target: 'openApi3',
      $refStrategy: 'none',
    });

    out[name] = json;
  }

  return out;
}
