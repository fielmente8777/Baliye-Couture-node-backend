import { IOtp, OtpModel } from '@models/otp';

export function create(data: Partial<IOtp>) {
  return OtpModel.create(data);
}

export function findLatestByPhone(phone: string) {
  return OtpModel.findOne({ phone, verified: false }).sort({ createdAt: -1 }).exec();
}

export function incrementAttempts(id: string) {
  return OtpModel.findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true }).exec();
}

export function markVerified(id: string) {
  return OtpModel.findByIdAndUpdate(id, { verified: true }, { new: true }).exec();
}

export function invalidateAllForPhone(phone: string) {
  return OtpModel.updateMany({ phone, verified: false }, { verified: true }).exec();
}

