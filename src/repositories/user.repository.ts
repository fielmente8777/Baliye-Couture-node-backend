import { IUser, UserModel } from '@models/user';

export function create(data: Partial<IUser>) {
  return UserModel.create(data);
}

export function findById(id: string) {
  return UserModel.findOne({ _id: id, isDeleted: false }).exec();
}

export function findByEmail(email: string) {
  return UserModel.findOne({ email, isDeleted: false }).exec();
}

export function findByPhone(phone: string) {
  return UserModel.findOne({ phone, isDeleted: false }).exec();
}

export function findByGoogleId(googleId: string) {
  return UserModel.findOne({ googleId, isDeleted: false }).exec();
}

export function findAll(filter: Record<string, unknown> = {}, skip = 0, limit = 10) {
  return UserModel.find({ ...filter, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function count(filter: Record<string, unknown> = {}) {
  return UserModel.countDocuments({ ...filter, isDeleted: false }).exec();
}

export function updateById(id: string, data: Partial<IUser> | Record<string, unknown>) {
  return UserModel.findOneAndUpdate({ _id: id, isDeleted: false }, data, { new: true }).exec();
}

export function softDelete(id: string) {
  return UserModel.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true, isActive: false },
    { new: true }
  ).exec();
}

