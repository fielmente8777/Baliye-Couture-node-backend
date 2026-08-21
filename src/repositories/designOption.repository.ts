import { DesignOptionModel, IDesignOption } from '@models/designoption';

export function create(data: Partial<IDesignOption>) {
  return DesignOptionModel.create(data);
}

export function findAll(filter: Record<string, unknown> = {}) {
  return DesignOptionModel.find(filter).sort({ category: 1, label: 1 }).exec();
}

export function findActiveByIds(ids: string[]) {
  return DesignOptionModel.find({ _id: { $in: ids }, isActive: true }).exec();
}

export function findById(id: string) {
  return DesignOptionModel.findById(id).exec();
}

export function updateById(id: string, data: Partial<IDesignOption>) {
  return DesignOptionModel.findByIdAndUpdate(id, data, { new: true }).exec();
}

export function deleteById(id: string) {
  return DesignOptionModel.findByIdAndDelete(id).exec();
}

