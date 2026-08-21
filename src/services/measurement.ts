import * as measurementTemplateRepository from '@repositories/measurementTemplate.repository';
import * as userMeasurementRepository from '@repositories/userMeasurement.repository';
import { ApiError } from '@utils/apiError';
import { IMeasurementTemplate } from '@models/measurementtemplate';

// ---- Admin: templates ----
export function createTemplate(data: Partial<IMeasurementTemplate>) {
  return measurementTemplateRepository.create(data);
}

export function getAllTemplates(activeOnly = false) {
  return activeOnly ? measurementTemplateRepository.findAllActive() : measurementTemplateRepository.findAll();
}

export async function updateTemplate(id: string, data: Partial<IMeasurementTemplate>) {
  const template = await measurementTemplateRepository.updateById(id, data);
  if (!template) throw ApiError.notFound('Measurement template not found');
  return template;
}

export async function deleteTemplate(id: string) {
  const template = await measurementTemplateRepository.deleteById(id);
  if (!template) throw ApiError.notFound('Measurement template not found');
  return template;
}

// ---- User: values ----
export async function getUserMeasurements(userId: string) {
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

export async function updateUserMeasurements(userId: string, values: { templateId: string; value: number }[]) {
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
