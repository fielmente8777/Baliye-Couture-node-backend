import { IMeasurementTemplate, MeasurementTemplateModel } from '@models/measurementtemplate';

export function create(data: Partial<IMeasurementTemplate>) {
  return MeasurementTemplateModel.create(data);
}

export function findAll() {
  return MeasurementTemplateModel.find().sort({ displayOrder: 1, name: 1 }).exec();
}

export function findAllActive() {
  return MeasurementTemplateModel.find({ isActive: true })
    .sort({ displayOrder: 1, name: 1 })
    .exec();
}

export function findById(id: string) {
  return MeasurementTemplateModel.findById(id).exec();
}

export function updateById(id: string, data: Partial<IMeasurementTemplate>) {
  return MeasurementTemplateModel.findByIdAndUpdate(id, data, { new: true }).exec();
}

export function deleteById(id: string) {
  return MeasurementTemplateModel.findByIdAndDelete(id).exec();
}

