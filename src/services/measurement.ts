import { measurementTemplateRepository } from '@repositories/measurementTemplate.repository';
import { userMeasurementRepository } from '@repositories/userMeasurement.repository';
import { ApiError } from '@utils/apiError';
import { IMeasurementTemplate } from '@models/measurementtemplate';

class MeasurementService {
  // ---- Admin: templates ----
  createTemplate(data: Partial<IMeasurementTemplate>) {
    return measurementTemplateRepository.create(data);
  }

  getAllTemplates(activeOnly = false) {
    return activeOnly ? measurementTemplateRepository.findAllActive() : measurementTemplateRepository.findAll();
  }

  async updateTemplate(id: string, data: Partial<IMeasurementTemplate>) {
    const template = await measurementTemplateRepository.updateById(id, data);
    if (!template) throw ApiError.notFound('Measurement template not found');
    return template;
  }

  async deleteTemplate(id: string) {
    const template = await measurementTemplateRepository.deleteById(id);
    if (!template) throw ApiError.notFound('Measurement template not found');
    return template;
  }

  // ---- User: values ----
  async getUserMeasurements(userId: string) {
    const existing = await userMeasurementRepository.findByUserId(userId);
    if (existing) return existing;

    // First-time fetch: seed the user's measurement doc from active templates
    const templates = await measurementTemplateRepository.findAllActive();
    const values = templates.map((t) => ({
      templateId: t._id,
      name: t.name,
      value: t.defaultValue ?? 0,
      unit: t.unit,
    }));

    return userMeasurementRepository.upsertForUser(userId, { values });
  }

  async updateUserMeasurements(userId: string, values: { templateId: string; value: number }[]) {
    const templates = await measurementTemplateRepository.findAllActive();
    const templateMap = new Map(templates.map((t) => [t._id.toString(), t]));

    const resolvedValues = values.map((v) => {
      const template = templateMap.get(v.templateId);
      if (!template) {
        throw ApiError.badRequest(`Unknown measurement template: ${v.templateId}`);
      }
      return {
        templateId: template._id,
        name: template.name,
        value: v.value,
        unit: template.unit,
      };
    });

    return userMeasurementRepository.upsertForUser(userId, { values: resolvedValues });
  }
}

export const measurementService = new MeasurementService();