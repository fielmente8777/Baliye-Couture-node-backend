import { ISuitDesign, SuitDesignModel } from '@models/suit';

export function create(data: Partial<ISuitDesign>) {
  return SuitDesignModel.create(data);
}

export function findByIdForUser(id: string, userId: string) {
  return SuitDesignModel.findOne({ _id: id, userId, isDeleted: false }).exec();
}

export function findAllByUser(userId: string, skip = 0, limit = 10) {
  return SuitDesignModel.find({ userId, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countByUser(userId: string) {
  return SuitDesignModel.countDocuments({ userId, isDeleted: false }).exec();
}

export function updateByIdForUser(id: string, userId: string, data: Partial<ISuitDesign>) {
  return SuitDesignModel.findOneAndUpdate({ _id: id, userId, isDeleted: false }, data, {
    new: true,
  }).exec();
}

export function softDeleteForUser(id: string, userId: string) {
  return SuitDesignModel.findOneAndUpdate(
    { _id: id, userId, isDeleted: false },
    { isDeleted: true },
    { new: true }
  ).exec();
}

