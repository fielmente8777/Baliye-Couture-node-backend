import { ApiError } from "../utils/apiError";
import { IUser } from "../models/user";
import * as userRepository from "../repositories/user.repository";
import { pushCustomerUpdate } from "./shopifyCustomer";
import { logger } from "@config/logger";

export async function getProfile(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

/**
 * Email is the login identity now — Shopify's Customer Account API owns it,
 * so it can only change by signing in with a different Shopify account, not
 * through this endpoint. Phone used to be gated behind an OTP-verified
 * change flow back when phone WAS the login identity; that requirement no
 * longer applies, so it is a normal editable field below (still kept unique
 * per account).
 */
const IMMUTABLE_FIELDS = [
  "isPhoneVerified",
  "email",
  "isEmailVerified",
  "role",
  "googleId",
  "microsoftId",
] as const;

export async function updateProfile(userId: string, data: Partial<IUser>) {
  const safe = { ...data };
  for (const field of IMMUTABLE_FIELDS) delete safe[field as keyof IUser];

  if (safe.phone) {
    const taken = await userRepository.findByPhone(safe.phone);
    if (taken && taken._id.toString() !== userId) {
      logger.warn(
        { userId, phone: safe.phone, conflictingUserId: taken._id.toString() },
        "[profile] phone update rejected — already registered to a different user",
      );
      throw ApiError.conflict("That number is already registered to another account");
    }
  }

  const user = await userRepository.updateById(userId, safe);

  logger.info(
    { userId, requestedPhone: safe.phone, savedPhone: user?.phone },
    "[profile] update result",
  );

  /* Keep Shopify in step, or its order notifications keep using stale
     details. Not awaited — a profile save should not fail on their outage. */
  if (user) void pushCustomerUpdate(user).catch(() => undefined);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function deleteProfile(userId: string) {
  const user = await userRepository.softDelete(userId);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}