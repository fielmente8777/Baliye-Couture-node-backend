import * as garmentTypeRepository from '@repositories/garmentType.repository';
import { ApiError } from '@utils/apiError';

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

export async function getTypeBySlug(slug: string) {
  const type = await garmentTypeRepository.findBySlug(slug);
  if (!type) throw ApiError.notFound('Garment type not found');
  return type;
}

