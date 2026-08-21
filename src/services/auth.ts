import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { userRepository } from '@repositories/user.repository';
import { adminRepository } from '@repositories/admin.repository';
import { otpRepository } from '@repositories/otp.repository';
import { refreshTokenRepository } from '@repositories/refreshToken.repository';
import { generateOtp, otpExpiryDate } from '@utils/otp';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@utils/jwt';
import { ApiError } from '@utils/apiError';
import { Role } from '@constants/role';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { smsChannel } from '@interfaces/sms';

const googleClient = new OAuth2Client(env.google.clientId);
const OTP_MAX_ATTEMPTS = 5;

class AuthService {
  /**
   * Pre-registers a user profile (name/email/phone) ahead of their first OTP
   * or Google login. Actual authentication still happens via /auth/send-otp
   * + /auth/verify-otp or /auth/google — this just avoids forcing every field
   * to be collected inside the OTP flow.
   */
  async register(data: { name: string; email?: string; phone?: string }) {
    if (!data.email && !data.phone) {
      throw ApiError.badRequest('Either email or phone is required to register');
    }

    if (data.phone) {
      const existing = await userRepository.findByPhone(data.phone);
      if (existing) throw ApiError.conflict('An account with this phone number already exists');
    }
    if (data.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing) throw ApiError.conflict('An account with this email already exists');
    }

    return userRepository.create(data);
  }

  async sendOtp(phone: string): Promise<void> {
    const code = generateOtp(6);
    const codeHash = await bcrypt.hash(code, 10);

    await otpRepository.invalidateAllForPhone(phone);
    await otpRepository.create({
      phone,
      codeHash,
      expiresAt: otpExpiryDate(5),
    });

    try {
      await smsChannel.send({
        to: phone,
        title: 'Your OTP',
        message: `Your verification code is ${code}. It expires in 5 minutes.`,
      });
    } catch (err) {
      logger.error({ err, phone }, 'Failed to send OTP SMS');
      // Do not leak delivery failures to the client — OTP is still stored/valid.
    }
  }

  async verifyOtpAndLogin(phone: string, code: string) {
    const otp = await otpRepository.findLatestByPhone(phone);
    if (!otp) throw ApiError.badRequest('No OTP request found for this phone number');
    if (otp.expiresAt < new Date()) throw ApiError.badRequest('OTP has expired');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw ApiError.badRequest('Too many incorrect attempts');

    const isValid = await bcrypt.compare(code, otp.codeHash);
    if (!isValid) {
      await otpRepository.incrementAttempts(otp._id.toString());
      throw ApiError.badRequest('Invalid OTP');
    }

    await otpRepository.markVerified(otp._id.toString());

    let user = await userRepository.findByPhone(phone);
    if (!user) {
      user = await userRepository.create({ phone, isPhoneVerified: true });
    } else if (!user.isPhoneVerified) {
      user = await userRepository.updateById(user._id.toString(), { isPhoneVerified: true });
    }

    if (!user) throw ApiError.internal('Failed to create or fetch user');

    await userRepository.updateById(user._id.toString(), { lastLoginAt: new Date() });

    return this.issueTokens(user._id.toString(), Role.USER);
  }

  async googleLogin(idToken: string) {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.google.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) throw ApiError.unauthorized('Invalid Google token');

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
      user = await userRepository.updateById(user._id.toString(), { googleId: payload.sub });
    }

    if (!user) throw ApiError.internal('Failed to create or fetch user');

    await userRepository.updateById(user._id.toString(), { lastLoginAt: new Date() });

    return this.issueTokens(user._id.toString(), Role.USER);
  }

  async adminLogin(email: string, password: string) {
    const admin = await adminRepository.findByEmail(email, true);
    if (!admin) throw ApiError.unauthorized('Invalid credentials');

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid) throw ApiError.unauthorized('Invalid credentials');

    if (!admin.isActive) throw ApiError.forbidden('Admin account is deactivated');

    await adminRepository.updateById(admin._id.toString(), { lastLoginAt: new Date() });

    return this.issueTokens(admin._id.toString(), Role.ADMIN);
  }

  async issueTokens(userId: string, role: Role) {
    const accessToken = signAccessToken({ sub: userId, role });
    const refreshToken = signRefreshToken({ sub: userId, role });

    const decoded = verifyRefreshToken(refreshToken) as { exp?: number };
    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 86400000);

    await refreshTokenRepository.create({
      token: refreshToken,
      userId: userId as unknown as never,
      role,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const stored = await refreshTokenRepository.findValidByToken(refreshToken);
    if (!stored) throw ApiError.unauthorized('Refresh token has been revoked or expired');

    await refreshTokenRepository.revoke(refreshToken);

    return this.issueTokens(payload.sub, payload.role);
  }

  async logout(refreshToken: string) {
    await refreshTokenRepository.revoke(refreshToken);
  }
}

export const authService = new AuthService();