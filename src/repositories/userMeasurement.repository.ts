import { IUserMeasurement, UserMeasurementModel } from '@models/usermeasurement';

class UserMeasurementRepository {
  findByUserId(userId: string) {
    return UserMeasurementModel.findOne({ userId }).exec();
  }

  upsertForUser(userId: string, data: Partial<IUserMeasurement>): Promise<IUserMeasurement> {
    return UserMeasurementModel.findOneAndUpdate(
      { userId },
      { ...data, userId },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec() as Promise<IUserMeasurement>;
  }
}

export const userMeasurementRepository = new UserMeasurementRepository();
