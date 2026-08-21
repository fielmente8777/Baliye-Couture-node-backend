import { IRefreshToken, RefreshTokenModel } from '@models/refreshtoken';

class RefreshTokenRepository {
  create(data: Partial<IRefreshToken>) {
    return RefreshTokenModel.create(data);
  }

  findValidByToken(token: string) {
    return RefreshTokenModel.findOne({
      token,
      revoked: false,
      expiresAt: { $gt: new Date() },
    }).exec();
  }

  revoke(token: string) {
    return RefreshTokenModel.findOneAndUpdate({ token }, { revoked: true }, { new: true }).exec();
  }

  revokeAllForUser(userId: string) {
    return RefreshTokenModel.updateMany({ userId, revoked: false }, { revoked: true }).exec();
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
