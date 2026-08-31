import { IMeasurementProfile, MeasurementProfileModel } from '@models/measurementprofile';

export function create(data: Partial<IMeasurementProfile>) {
  return MeasurementProfileModel.create(data);
}

export function findAllByUser(userId: string) {
  return MeasurementProfileModel.find({ userId, isDeleted: false })
    .sort({ isDefault: -1, createdAt: 1 })
    .exec();
}

export function findByIdForUser(id: string, userId: string) {
  return MeasurementProfileModel.findOne({ _id: id, userId, isDeleted: false }).exec();
}

export function countByUser(userId: string) {
  return MeasurementProfileModel.countDocuments({ userId, isDeleted: false }).exec();
}

export function findByNameForUser(profileName: string, userId: string) {
  return MeasurementProfileModel.findOne({ profileName, userId, isDeleted: false }).exec();
}

export function updateByIdForUser(
  id: string,
  userId: string,
  data: Partial<IMeasurementProfile>
) {
  return MeasurementProfileModel.findOneAndUpdate(
    { _id: id, userId, isDeleted: false },
    data,
    { new: true }
  ).exec();
}

/** Clears the flag on every other profile so exactly one default survives. */
export function clearDefaultForUser(userId: string, exceptId?: string) {
  return MeasurementProfileModel.updateMany(
    { userId, isDeleted: false, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { isDefault: false }
  ).exec();
}

export function softDeleteForUser(id: string, userId: string) {
  return MeasurementProfileModel.findOneAndUpdate(
    { _id: id, userId, isDeleted: false },
    { isDeleted: true, isDefault: false },
    { new: true }
  ).exec();
}
