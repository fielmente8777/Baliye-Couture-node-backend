import * as garmentTypeRepository from '@repositories/garmentType.repository';
import { IGarmentType } from '@models/garmenttype';
import { ApiError } from '@utils/apiError';
import { resolveConfigs } from './customization';

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The "What do you want to design?" picker (§27). Only designable, active types
 * are offered — a garment type can exist for products while being unavailable
 * to design from scratch.
 */
export function getDesignableTypes(family?: string) {
  return garmentTypeRepository.findAll({
    isActive: true,
    isDesignable: true,
    ...(family ? { family } : {}),
  });
}

/** Admin listing — includes inactive and non-designable types. */
export function getAllTypes() {
  return garmentTypeRepository.findAll();
}

export async function getTypeBySlug(slug: string) {
  const type = await garmentTypeRepository.findBySlug(slug);
  if (!type) throw ApiError.notFound('Garment type not found');
  return type;
}

/**
 * Admin view of one type with its option groups expanded, so the dashboard can
 * render the configured steps without resolving ids itself.
 */
export async function getTypeWithOptions(id: string) {
  const type = await garmentTypeRepository.findById(id);
  if (!type) throw ApiError.notFound('Garment type not found');

  const groups = await resolveConfigs(type.optionConfigs);

  return {
    ...type.toObject(),
    resolvedGroups: groups.map((g) => ({
      groupId: g.group._id,
      code: g.group.code,
      label: g.group.label,
      inputType: g.group.inputType,
      isRequired: g.config.isRequired,
      position: g.config.position,
      options: g.options,
    })),
  };
}

export async function createType(data: Partial<IGarmentType>) {
  const slug = data.slug || slugify(data.name ?? '');
  if (!slug) throw ApiError.badRequest('A garment type needs a name');

  const existing = await garmentTypeRepository.findBySlug(slug);
  if (existing) throw ApiError.conflict('A garment type with that name already exists');

  return garmentTypeRepository.create({ ...data, slug });
}

export async function updateType(id: string, data: Partial<IGarmentType>) {
  const type = await garmentTypeRepository.updateById(id, data);
  if (!type) throw ApiError.notFound('Garment type not found');
  return type;
}

export async function deleteType(id: string) {
  const type = await garmentTypeRepository.softDelete(id);
  if (!type) throw ApiError.notFound('Garment type not found');
  return type;
}
