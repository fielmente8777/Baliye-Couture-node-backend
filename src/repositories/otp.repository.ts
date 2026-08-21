import { IOtp, OtpModel } from '@models/otp';

class OtpRepository {
  create(data: Partial<IOtp>) {
    return OtpModel.create(data);
  }

  findLatestByPhone(phone: string) {
    return OtpModel.findOne({ phone, verified: false }).sort({ createdAt: -1 }).exec();
  }

  incrementAttempts(id: string) {
    return OtpModel.findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true }).exec();
  }

  markVerified(id: string) {
    return OtpModel.findByIdAndUpdate(id, { verified: true }, { new: true }).exec();
  }

  invalidateAllForPhone(phone: string) {
    return OtpModel.updateMany({ phone, verified: false }, { verified: true }).exec();
  }
}

export const otpRepository = new OtpRepository();
