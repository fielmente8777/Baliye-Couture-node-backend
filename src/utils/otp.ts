import crypto from 'crypto';

/** Generates a numeric OTP of the given length (default 6 digits). */
export function generateOtp(length = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}

export function otpExpiryDate(minutes = 5): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}