import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import * as userRepository from "@repositories/user.repository";
import * as adminRepository from "@repositories/admin.repository";
import * as otpRepository from "@repositories/otp.repository";
import * as refreshTokenRepository from "@repositories/refreshToken.repository";
import { generateOtp, otpExpiryDate } from "@utils/otp";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@utils/jwt";
import { ApiError } from "@utils/apiError";
import { syncCustomerInBackground } from './shopifyCustomer';
import { fetchCustomer } from '@config/shopifyAuth';
import { Role } from "@constants/role";
import { env } from "@config/env";
import { logger } from "@config/logger";
import { smsChannel } from "@interfaces/sms";
import { sendWhatsAppOtp } from "./whatsapp";

const googleClient = new OAuth2Client(env.google.clientId);
const OTP_MAX_ATTEMPTS = 5;

/**
 * Pre-registers a user profile (name/email/phone) ahead of their first OTP
 * or Google login. Actual authentication still happens via /auth/send-otp
 * + /auth/verify-otp or /auth/google — this just avoids forcing every field
 * to be collected inside the OTP flow.
 */
export async function register(data: {
  name: string;
  email?: string;
  phone?: string;
}) {
  if (!data.email && !data.phone) {
    throw ApiError.badRequest("Either email or phone is required to register");
  }

  if (data.phone) {
    const existing = await userRepository.findByPhone(data.phone);
    if (existing)
      throw ApiError.conflict(
        "An account with this phone number already exists",
      );
  }
  if (data.email) {
    const existing = await userRepository.findByEmail(data.email);
    if (existing)
      throw ApiError.conflict("An account with this email already exists");
  }

  return userRepository.create(data);
}

export async function sendOtp(phone: string): Promise<void> {
  const code = generateOtp(6);
  const codeHash = await bcrypt.hash(code, 10);
  const whatsappPhone = phone.startsWith("+") ? phone.slice(1) : phone;

  await otpRepository.invalidateAllForPhone(phone);
  await otpRepository.create({
    phone,
    codeHash,
    expiresAt: otpExpiryDate(5),
  });

  try {
    await sendWhatsAppOtp({
      phone: whatsappPhone,
      otp: code,
      accessToken:
        "EAALT8SAnyZAgBQ2ziWzIF7zkMfHQ75liBVVjYcRoZBnTmf6hbMFpJkS6BfsI5teq8rHlXrUfND74sewZBK1zzfiqnZBa9shhN4fCMZCjdYlHF0yNqGOt6fauCpSiuvyHak8Le9tvJUIDKM8brJ5ejR0ZAGUV3wZCgREqDStQ40rRQzwqUx2N2Lkh4PtDjsXrf6S8wZDZD",
      phoneNumberId: "888070077730641",
      templateName: "data_export_verification_code",
      languageCode: "en",
    });
    // await smsChannel.send({
    //   to: phone,
    //   title: "Your OTP",
    //   message: `Your verification code is ${code}. It expires in 5 minutes.`,
    // });
  } catch (err: any) {
    console.log(err?.response?.data);
    // logger.error({ err, phone }, "Failed to send OTP SMS");
    // Do not leak delivery failures to the client — OTP is still stored/valid.
  }
}

/**
 * Validates a code and consumes it. Shared by login and by the phone-change
 * flow, so both enforce the same expiry and attempt limits.
 */
export async function assertOtpValid(phone: string, code: string) {
  const otp = await otpRepository.findLatestByPhone(phone);
  if (!otp)
    throw ApiError.badRequest("No OTP request found for this phone number");
  if (otp.expiresAt < new Date()) throw ApiError.badRequest("OTP has expired");
  if (otp.attempts >= OTP_MAX_ATTEMPTS)
    throw ApiError.badRequest("Too many incorrect attempts");

  const isValid = await bcrypt.compare(code, otp.codeHash);
  if (!isValid) {
    await otpRepository.incrementAttempts(otp._id.toString());
    throw ApiError.badRequest("Invalid OTP");
  }

  await otpRepository.markVerified(otp._id.toString());
}

export async function verifyOtpAndLogin(phone: string, code: string) {
  await assertOtpValid(phone, code);

  let user = await userRepository.findByPhone(phone);
  if (!user) {
    user = await userRepository.create({ phone, isPhoneVerified: true });
  } else if (!user.isPhoneVerified) {
    user = await userRepository.updateById(user._id.toString(), {
      isPhoneVerified: true,
    });
  }

  if (!user) throw ApiError.internal("Failed to create or fetch user");

  await userRepository.updateById(user._id.toString(), {
    lastLoginAt: new Date(),
  });

  /* Link to Shopify in the background. Deliberately not awaited: sign-in must
     not wait on, or fail because of, a Shopify round trip. Retries on the
     customer's next login if it does not succeed. */
  syncCustomerInBackground(user);

  return issueTokens(user._id.toString(), Role.USER);
}

/**
 * Microsoft / Outlook login.
 *
 * The client sends a Graph access token from MSAL. We do not trust it: we call
 * Graph with it, and the profile Graph returns is the proof. A forged token
 * simply fails that call.
 */
export async function microsoftLogin(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw ApiError.unauthorized("Invalid Microsoft token");

  const profile = (await response.json()) as {
    id: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };

  const email = profile.mail || profile.userPrincipalName;
  if (!profile.id) throw ApiError.unauthorized("Invalid Microsoft token");

  let user = await userRepository.findByMicrosoftId(profile.id);

  if (!user && email) {
    user = await userRepository.findByEmail(email);
  }

  if (!user) {
    user = await userRepository.create({
      microsoftId: profile.id,
      email,
      name: profile.displayName,
      isEmailVerified: true,
    });
  } else if (!user.microsoftId) {
    user = await userRepository.updateById(user._id.toString(), {
      microsoftId: profile.id,
    });
  }

  if (!user) throw ApiError.internal("Failed to create or fetch user");

  await userRepository.updateById(user._id.toString(), {
    lastLoginAt: new Date(),
  });

  /* Link to Shopify in the background. Deliberately not awaited: sign-in must
     not wait on, or fail because of, a Shopify round trip. Retries on the
     customer's next login if it does not succeed. */
  syncCustomerInBackground(user);

  return issueTokens(user._id.toString(), Role.USER);
}

export async function googleLogin(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.google.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub)
    throw ApiError.unauthorized("Invalid Google token");

  let user = await userRepository.findByGoogleId(payload.sub);

  if (!user && payload.email) {
    user = await userRepository.findByEmail(payload.email);
  }

  if (!user) {
    user = await userRepository.create({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      profileImage: payload.picture,
      isEmailVerified: !!payload.email_verified,
    });
  } else if (!user.googleId) {
    user = await userRepository.updateById(user._id.toString(), {
      googleId: payload.sub,
    });
  }

  if (!user) throw ApiError.internal("Failed to create or fetch user");

  await userRepository.updateById(user._id.toString(), {
    lastLoginAt: new Date(),
  });

  /* Link to Shopify in the background. Deliberately not awaited: sign-in must
     not wait on, or fail because of, a Shopify round trip. Retries on the
     customer's next login if it does not succeed. */
  syncCustomerInBackground(user);

  return issueTokens(user._id.toString(), Role.USER);
}

export async function adminLogin(email: string, password: string) {
  const admin = await adminRepository.findByEmail(email, true);
  if (!admin) throw ApiError.unauthorized("Invalid credentials");

  const isValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isValid) throw ApiError.unauthorized("Invalid credentials");

  if (!admin.isActive) throw ApiError.forbidden("Admin account is deactivated");

  await adminRepository.updateById(admin._id.toString(), {
    lastLoginAt: new Date(),
  });

  return issueTokens(admin._id.toString(), Role.ADMIN);
}

export async function issueTokens(userId: string, role: Role) {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, role });

  const decoded = verifyRefreshToken(refreshToken) as { exp?: number };
  const expiresAt = decoded.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 30 * 86400000);

  await refreshTokenRepository.create({
    token: refreshToken,
    userId: userId as unknown as never,
    role,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export async function refreshTokens(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const stored = await refreshTokenRepository.findValidByToken(refreshToken);
  if (!stored)
    throw ApiError.unauthorized("Refresh token has been revoked or expired");

  await refreshTokenRepository.revoke(refreshToken);

  return issueTokens(payload.sub, payload.role);
}

export async function logout(refreshToken: string) {
  await refreshTokenRepository.revoke(refreshToken);
}

/**
 * Sign in with a Shopify customer access token.
 *
 * Shopify owns authentication: the customer signed in on Shopify's hosted page
 * with a one-time code. We verify the token by reading the customer behind it —
 * a forged or expired token gets a 401 there — then find or create our own user
 * and issue our own JWT.
 *
 * Doing it this way means Shopify is the login provider while measurements,
 * designs, reviews and orders stay keyed to our userId. Re-keying all of that
 * to Shopify's customer ids is the 2-4 week version of this change; this is the
 * afternoon version, and the customer experience is identical.
 */
export async function shopifyLogin(accessToken: string) {
  const profile = await fetchCustomer(accessToken);
  if (!profile.id) throw ApiError.unauthorized('Invalid Shopify session');

  const email = profile.emailAddress?.emailAddress;
  const phone = profile.phoneNumber?.phoneNumber;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || undefined;

  let user = await userRepository.findByShopifyCustomerId(profile.id);

  /**
   * Match an existing account before creating one.
   *
   * Someone who signed up here by phone last month and now signs in through
   * Shopify with the same email must land on THEIR account — with their saved
   * measurements and designs — not a new empty one.
   */
  if (!user && email) user = await userRepository.findByEmail(email);
  if (!user && phone) user = await userRepository.findByPhone(phone);

  if (!user) {
    user = await userRepository.create({
      shopifyCustomerId: profile.id,
      email,
      phone,
      name,
      /* Shopify verified whichever identifier they signed in with. */
      isEmailVerified: Boolean(email),
      isPhoneVerified: Boolean(phone),
    });
  } else if (!user.shopifyCustomerId) {
    user = await userRepository.updateById(user._id.toString(), {
      shopifyCustomerId: profile.id,
      /* Fill gaps only — never overwrite what the customer set here. */
      ...(user.email ? {} : email ? { email, isEmailVerified: true } : {}),
      ...(user.phone ? {} : phone ? { phone, isPhoneVerified: true } : {}),
      ...(user.name ? {} : name ? { name } : {}),
    });
  }

  if (!user) throw ApiError.internal('Could not create your account');

  return issueTokens(user._id.toString(), Role.USER);
}
