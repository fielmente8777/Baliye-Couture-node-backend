import { GarmentTypeModel, IGarmentType } from '@models/garmenttype';

export function create(data: Partial<IGarmentType>) {
  return GarmentTypeModel.create(data);
}

export function findAll(filter: Record<string, unknown> = {}) {
  return GarmentTypeModel.find({ isDeleted: false, ...filter })
    .sort({ position: 1, name: 1 })
    .exec();
}

export function findById(id: string) {
  return GarmentTypeModel.findOne({ _id: id, isDeleted: false }).exec();
}

export function findBySlug(slug: string) {
  return GarmentTypeModel.findOne({ slug, isDeleted: false }).exec();
}

export function updateById(id: string, data: Partial<IGarmentType>) {
  return GarmentTypeModel.findOneAndUpdate({ _id: id, isDeleted: false }, data, {
    new: true,
  }).exec();
}

export function softDelete(id: string) {
  return GarmentTypeModel.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true, isActive: false },
    { new: true }
  ).exec();
}
