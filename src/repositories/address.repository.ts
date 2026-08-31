import { AddressModel, IAddress } from '@models/address';

export function create(data: Partial<IAddress>) {
  return AddressModel.create(data);
}

export function findAllByUser(userId: string) {
  return AddressModel.find({ userId, isDeleted: false })
    .sort({ isDefault: -1, createdAt: 1 })
    .exec();
}

export function findByIdForUser(id: string, userId: string) {
  return AddressModel.findOne({ _id: id, userId, isDeleted: false }).exec();
}

export function countByUser(userId: string) {
  return AddressModel.countDocuments({ userId, isDeleted: false }).exec();
}

export function updateByIdForUser(id: string, userId: string, data: Partial<IAddress>) {
  return AddressModel.findOneAndUpdate(
    { _id: id, userId, isDeleted: false },
    data,
    { new: true }
  ).exec();
}

/** Clears the flag everywhere else so exactly one default survives. */
export function clearDefaultForUser(userId: string, exceptId?: string) {
  return AddressModel.updateMany(
    { userId, isDeleted: false, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { isDefault: false }
  ).exec();
}

export function softDeleteForUser(id: string, userId: string) {
  return AddressModel.findOneAndUpdate(
    { _id: id, userId, isDeleted: false },
    { isDeleted: true, isDefault: false },
    { new: true }
  ).exec();
}
