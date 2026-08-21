import { IUserMeasurement, UserMeasurementModel } from '@models/usermeasurement';

export function findByUserId(userId: string) {
  return UserMeasurementModel.findOne({ userId }).exec();
}

export function upsertForUser(userId: string, data: Partial<IUserMeasurement>): Promise<IUserMeasurement> {
  return UserMeasurementModel.findOneAndUpdate(
    { userId },
    { ...data, userId },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).exec() as Promise<IUserMeasurement>;
}

