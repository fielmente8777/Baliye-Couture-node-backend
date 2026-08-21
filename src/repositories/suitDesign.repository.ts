import { ISuitDesign, SuitDesignModel } from '@models/suit';

class SuitDesignRepository {
  create(data: Partial<ISuitDesign>) {
    return SuitDesignModel.create(data);
  }

  findByIdForUser(id: string, userId: string) {
    return SuitDesignModel.findOne({ _id: id, userId, isDeleted: false }).exec();
  }

  findAllByUser(userId: string, skip = 0, limit = 10) {
    return SuitDesignModel.find({ userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  countByUser(userId: string) {
    return SuitDesignModel.countDocuments({ userId, isDeleted: false }).exec();
  }

  updateByIdForUser(id: string, userId: string, data: Partial<ISuitDesign>) {
    return SuitDesignModel.findOneAndUpdate({ _id: id, userId, isDeleted: false }, data, {
      new: true,
    }).exec();
  }

  softDeleteForUser(id: string, userId: string) {
    return SuitDesignModel.findOneAndUpdate(
      { _id: id, userId, isDeleted: false },
      { isDeleted: true },
      { new: true }
    ).exec();
  }
}

export const suitDesignRepository = new SuitDesignRepository();
