import { IRefreshToken, RefreshTokenModel } from '@models/refreshtoken';

export function create(data: Partial<IRefreshToken>) {
  return RefreshTokenModel.create(data);
}

export function findValidByToken(token: string) {
  return RefreshTokenModel.findOne({
    token,
    revoked: false,
    expiresAt: { $gt: new Date() },
  }).exec();
}

export function revoke(token: string) {
  return RefreshTokenModel.findOneAndUpdate({ token }, { revoked: true }, { new: true }).exec();
}

export function revokeAllForUser(userId: string) {
  return RefreshTokenModel.updateMany({ userId, revoked: false }, { revoked: true }).exec();
}

