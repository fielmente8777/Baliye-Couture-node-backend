/**
 * Custom designs — the customer-facing half of the customization engine.
 *
 * Two entry points, one code path (§38):
 *   1. Create Your Own Design → start from a GarmentType.
 *   2. Customize a pre-designed product → start from a Product, whose garment
 *      type and preset selections seed the design so the customer never has to
 *      pick a garment type.
 */

import { CustomDesignModel, ICustomDesign } from '@models/customdesign';
import { GarmentTypeModel } from '@models/garmenttype';
import { ProductModel } from '@models/product';
import { IOptionConfig } from '@models/optionconfig';
import { ApiError } from '@utils/apiError';
import * as measurementService from './measurement';
import {
  SelectionInput,
  calculatePrice,
  resolveConfigs,
  toSelectionInput,
  validateSelections,
} from './customization';

export interface DesignInput {
  garmentTypeId?: string;
  productId?: string;
  name?: string;
  selections: SelectionInput[];
  measurementProfileId?: string;
  sizeOptionId?: string;
  instructions?: string;
}

/**
 * Works out which configs and base price apply, from either a product or a
 * garment type. Everything downstream is identical for both.
 */
async function resolveContext(input: { garmentTypeId?: string; productId?: string }) {
  if (input.productId) {
    const product = await ProductModel.findOne({
      _id: input.productId,
      status: 'active',
      isDeleted: false,
    }).exec();

    if (!product) throw ApiError.notFound('Product not found');

    if (product.mode === 'predesigned' || product.customizableOptions.length === 0) {
      throw ApiError.badRequest('This product is not customizable');
    }

    const garmentType = await GarmentTypeModel.findById(product.garmentTypeId).exec();
    if (!garmentType) throw ApiError.badRequest('This product has no garment type configured');

    return {
      garmentType,
      product,
      configs: product.customizableOptions as IOptionConfig[],
      basePrice: product.salePrice ?? product.basePrice,
    };
  }

  if (!input.garmentTypeId) {
    throw ApiError.badRequest('Provide either a garment type or a product to customize');
  }

  const garmentType = await GarmentTypeModel.findOne({
    _id: input.garmentTypeId,
    isActive: true,
    isDeleted: false,
  }).exec();

  if (!garmentType) throw ApiError.notFound('Garment type not found');
  if (!garmentType.isDesignable) {
    throw ApiError.badRequest('This garment type is not available for custom design');
  }

  return {
    garmentType,
    product: null,
    configs: garmentType.optionConfigs,
    basePrice: garmentType.basePrice,
  };
}

/**
 * Everything the design page needs to render: the ordered steps, the options
 * in each, and any preset selections carried over from a product.
 *
 * This is what makes "customize a pre-designed product" work without a garment
 * type picker — the product supplies the type and the starting selections.
 */
export async function getDesignConfig(input: {
  garmentTypeId?: string;
  productId?: string;
  selections?: SelectionInput[];
}) {
  const { garmentType, product, configs, basePrice } = await resolveContext(input);

  const presets = product ? toSelectionInput(product.presetSelections) : [];
  const current = input.selections?.length ? input.selections : presets;

  const groups = await resolveConfigs(configs, current);

  return {
    garmentType: {
      _id: garmentType._id,
      name: garmentType.name,
      slug: garmentType.slug,
      measurementTemplates: garmentType.measurementTemplates,
    },
    product: product
      ? { _id: product._id, name: product.name, slug: product.slug, images: product.images }
      : null,
    basePrice,
    presetSelections: presets,
    groups: groups.map((g) => ({
      _id: g.group._id,
      code: g.group.code,
      label: g.group.label,
      inputType: g.group.inputType,
      isRequired: g.config.isRequired,
      isVisible: g.isVisible,
      position: g.config.position,
      defaultOption: g.config.defaultOption ?? null,
      dependsOn: g.config.dependsOn ?? null,
      options: g.options.map((o) => ({
        _id: o._id,
        label: o.label,
        value: o.value,
        image: o.image,
        hex: o.hex,
        priceModifier: o.priceModifier,
      })),
    })),
  };
}

/** Live price as the customer clicks through, without saving anything. */
export async function quotePrice(input: DesignInput) {
  const { configs, basePrice } = await resolveContext(input);
  const validated = await validateSelections(configs, input.selections);
  return calculatePrice(basePrice, validated);
}

export async function createDesign(userId: string, input: DesignInput): Promise<ICustomDesign> {
  const { garmentType, product, configs, basePrice } = await resolveContext(input);

  const validated = await validateSelections(configs, input.selections);

  /* A design is tailored to a body or to a standard size — it needs one. */
  if (input.measurementProfileId) {
    await measurementService.assertOwnedProfile(input.measurementProfileId, userId);
  }

  const pricing = calculatePrice(basePrice, validated);

  return CustomDesignModel.create({
    userId,
    garmentTypeId: garmentType._id,
    sourceProductId: product?._id,
    name: input.name,
    selections: validated,
    measurementProfileId: input.measurementProfileId,
    sizeOptionId: input.sizeOptionId,
    instructions: input.instructions,
    pricing,
  });
}

export function getMyDesigns(userId: string, skip = 0, limit = 10) {
  return CustomDesignModel.find({ userId, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export async function getDesignById(id: string, userId: string) {
  const design = await CustomDesignModel.findOne({ _id: id, userId, isDeleted: false }).exec();
  if (!design) throw ApiError.notFound('Design not found');
  return design;
}

export async function deleteDesign(id: string, userId: string) {
  const design = await CustomDesignModel.findOneAndUpdate(
    { _id: id, userId, isDeleted: false },
    { isDeleted: true },
    { new: true }
  ).exec();
  if (!design) throw ApiError.notFound('Design not found');
  return design;
}
