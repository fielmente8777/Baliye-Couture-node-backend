import { GarmentTypeModel } from '@models/garmenttype';

export function findAll(filter: Record<string, unknown> = {}) {
  return GarmentTypeModel.find({ isDeleted: false, ...filter })
    .sort({ position: 1, name: 1 })
    .exec();
}

export function findBySlug(slug: string) {
  return GarmentTypeModel.findOne({ slug, isDeleted: false }).exec();
}
