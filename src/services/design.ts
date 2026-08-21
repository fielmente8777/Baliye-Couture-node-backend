import { designOptionRepository } from '@repositories/designOption.repository';
import { suitDesignRepository } from '@repositories/suitDesign.repository';
import { ApiError } from '@utils/apiError';
import { IDesignOption } from '@models/designoption';
import { ISuitDesign } from '@models/suit';

const OPTION_FIELDS: (keyof ISuitDesign)[] = [
  'suitType',
  'color',
  'fabric',
  'lapel',
  'buttons',
  'pocketStyle',
  'collar',
  'sleeveStyle',
  'backStyle',
  'vent',
  'lining',
  'fit',
  'pantStyle',
  'pleats',
  'cuffs',
];

class DesignService {
  // ---- Admin: design options catalog ----
  createOption(data: Partial<IDesignOption>) {
    return designOptionRepository.create(data);
  }

  getOptions(category?: string) {
    return designOptionRepository.findAll(category ? { category } : {});
  }

  async updateOption(id: string, data: Partial<IDesignOption>) {
    const option = await designOptionRepository.updateById(id, data);
    if (!option) throw ApiError.notFound('Design option not found');
    return option;
  }

  async deleteOption(id: string) {
    const option = await designOptionRepository.deleteById(id);
    if (!option) throw ApiError.notFound('Design option not found');
    return option;
  }

  // ---- User: suit designs ----
  private async computeTotalPrice(basePrice: number, design: Partial<ISuitDesign>): Promise<number> {
    const optionIds = OPTION_FIELDS.map((field) => design[field]).filter(Boolean) as unknown as string[];

    if (optionIds.length === 0) return basePrice;

    const options = await designOptionRepository.findActiveByIds(optionIds);
    const modifierSum = options.reduce((sum, o) => sum + (o.priceModifier || 0), 0);
    return basePrice + modifierSum;
  }

  async createDesign(userId: string, data: Partial<ISuitDesign>) {
    const basePrice = data.basePrice ?? 0;
    const totalPrice = await this.computeTotalPrice(basePrice, data);
    return suitDesignRepository.create({ ...data, userId: userId as unknown as never, basePrice, totalPrice });
  }

  getUserDesigns(userId: string, skip: number, limit: number) {
    return Promise.all([
      suitDesignRepository.findAllByUser(userId, skip, limit),
      suitDesignRepository.countByUser(userId),
    ]);
  }

  async getUserDesignById(id: string, userId: string) {
    const design = await suitDesignRepository.findByIdForUser(id, userId);
    if (!design) throw ApiError.notFound('Suit design not found');
    return design;
  }

  async updateDesign(id: string, userId: string, data: Partial<ISuitDesign>) {
    const existing = await suitDesignRepository.findByIdForUser(id, userId);
    if (!existing) throw ApiError.notFound('Suit design not found');

    const basePrice = data.basePrice ?? existing.basePrice;
    const merged = { ...existing.toObject(), ...data };
    const totalPrice = await this.computeTotalPrice(basePrice, merged);

    const updated = await suitDesignRepository.updateByIdForUser(id, userId, {
      ...data,
      basePrice,
      totalPrice,
    });
    if (!updated) throw ApiError.notFound('Suit design not found');
    return updated;
  }

  async deleteDesign(id: string, userId: string) {
    const design = await suitDesignRepository.softDeleteForUser(id, userId);
    if (!design) throw ApiError.notFound('Suit design not found');
    return design;
  }
}

export const designService = new DesignService();