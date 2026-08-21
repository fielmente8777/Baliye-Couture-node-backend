import { DesignOptionModel, IDesignOption } from '@models/designoption';

class DesignOptionRepository {
  create(data: Partial<IDesignOption>) {
    return DesignOptionModel.create(data);
  }

  findAll(filter: Record<string, unknown> = {}) {
    return DesignOptionModel.find(filter).sort({ category: 1, label: 1 }).exec();
  }

  findActiveByIds(ids: string[]) {
    return DesignOptionModel.find({ _id: { $in: ids }, isActive: true }).exec();
  }

  findById(id: string) {
    return DesignOptionModel.findById(id).exec();
  }

  updateById(id: string, data: Partial<IDesignOption>) {
    return DesignOptionModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  deleteById(id: string) {
    return DesignOptionModel.findByIdAndDelete(id).exec();
  }
}

export const designOptionRepository = new DesignOptionRepository();
