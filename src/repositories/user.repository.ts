import { IUser, UserModel } from '@models/user';

class UserRepository {
  create(data: Partial<IUser>) {
    return UserModel.create(data);
  }

  findById(id: string) {
    return UserModel.findOne({ _id: id, isDeleted: false }).exec();
  }

  findByEmail(email: string) {
    return UserModel.findOne({ email, isDeleted: false }).exec();
  }

  findByPhone(phone: string) {
    return UserModel.findOne({ phone, isDeleted: false }).exec();
  }

  findByGoogleId(googleId: string) {
    return UserModel.findOne({ googleId, isDeleted: false }).exec();
  }

  findAll(filter: Record<string, unknown> = {}, skip = 0, limit = 10) {
    return UserModel.find({ ...filter, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  count(filter: Record<string, unknown> = {}) {
    return UserModel.countDocuments({ ...filter, isDeleted: false }).exec();
  }

  updateById(id: string, data: Partial<IUser> | Record<string, unknown>) {
    return UserModel.findOneAndUpdate({ _id: id, isDeleted: false }, data, { new: true }).exec();
  }

  softDelete(id: string) {
    return UserModel.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true, isActive: false },
      { new: true }
    ).exec();
  }
}

export const userRepository = new UserRepository();
