import { ApiError } from "../utils/apiError";
import { IUser } from "../models/user";
import * as userRepository from "../repositories/user.repository";
import * as authService from "./auth";
import { pushCustomerUpdate } from "./shopifyCustomer";

export async function getProfile(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

/**
 * Phone is the login identity, so it is never changed by a plain profile
 * update — it silently dropped before, which is why editing it appeared to do
 * nothing. Use requestPhoneChange + confirmPhoneChange instead.
 */
const IMMUTABLE_FIELDS = [
  "phone",
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
  console.log("data kya hai bata do", data);
  const user = await userRepository.updateById(userId, safe);

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

/**
 * Step 1 of changing a phone number: send a code to the NEW number.
 *
 * Verifying the new number rather than the old one is what proves the customer
 * actually controls it — otherwise a stolen session could redirect a login
 * identity to an attacker's handset.
 */
export async function requestPhoneChange(userId: string, phone: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound("User not found");

  if (user.phone === phone) {
    throw ApiError.badRequest("That is already your number");
  }

  const taken = await userRepository.findByPhone(phone);
  if (taken && taken._id.toString() !== userId) {
    throw ApiError.conflict("That number is already registered to another account");
  }

  await authService.sendOtp(phone);
  return { phone };
}

/** Step 2: confirm the code and move the number onto the account. */
export async function confirmPhoneChange(
  userId: string,
  phone: string,
  code: string,
) {
  const taken = await userRepository.findByPhone(phone);
  if (taken && taken._id.toString() !== userId) {
    throw ApiError.conflict("That number is already registered to another account");
  }

  await authService.assertOtpValid(phone, code);

  const user = await userRepository.updateById(userId, {
    phone,
    isPhoneVerified: true,
  });

  if (!user) throw ApiError.notFound("User not found");

  /* The number Shopify sends order updates to must follow the change. */
  void pushCustomerUpdate(user).catch(() => undefined);

  return user;
}
