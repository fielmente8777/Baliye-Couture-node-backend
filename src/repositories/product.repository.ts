import { IProduct, ProductModel } from '@models/product';

export function create(data: Partial<IProduct>) {
  return ProductModel.create(data);
}

export function findAll(filter: Record<string, unknown> = {}, skip = 0, limit = 12, sort: Record<string, 1 | -1> = { createdAt: -1 }) {
  return ProductModel.find({ isDeleted: false, ...filter })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .exec();
}

export function count(filter: Record<string, unknown> = {}) {
  return ProductModel.countDocuments({ isDeleted: false, ...filter }).exec();
}

export function findById(id: string) {
  return ProductModel.findOne({ _id: id, isDeleted: false }).exec();
}

export function findBySlug(slug: string) {
  return ProductModel.findOne({ slug, isDeleted: false }).exec();
}

export function updateById(id: string, data: Partial<IProduct>) {
  return ProductModel.findOneAndUpdate({ _id: id, isDeleted: false }, data, {
    new: true,
  }).exec();
}

export function softDelete(id: string) {
  return ProductModel.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true, status: 'archived' },
    { new: true }
  ).exec();
}
