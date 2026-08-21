import { IMeasurementTemplate, MeasurementTemplateModel } from '@models/measurementtemplate';

class MeasurementTemplateRepository {
  create(data: Partial<IMeasurementTemplate>) {
    return MeasurementTemplateModel.create(data);
  }

  findAll() {
    return MeasurementTemplateModel.find().sort({ displayOrder: 1, name: 1 }).exec();
  }

  findAllActive() {
    return MeasurementTemplateModel.find({ isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .exec();
  }

  findById(id: string) {
    return MeasurementTemplateModel.findById(id).exec();
  }

  updateById(id: string, data: Partial<IMeasurementTemplate>) {
    return MeasurementTemplateModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  deleteById(id: string) {
    return MeasurementTemplateModel.findByIdAndDelete(id).exec();
  }
}

export const measurementTemplateRepository = new MeasurementTemplateRepository();
