import { Schema, model, Document, Types } from 'mongoose';
import { IOptionConfig, optionConfigSchema } from './optionconfig';

/** §3. `both` is a pre-designed product that still allows selected changes. */
export type ProductMode = 'predesigned' | 'customizable' | 'both';

/** §5 lifecycle. */
export type ProductStatus = 'draft' | 'active' | 'inactive' | 'archived';

export interface IProductImage {
  url: string;
  alt?: string;
  type: 'front' | 'back' | 'side' | 'detail' | 'model' | 'fabric' | 'embroidery' | 'guide';
  position: number;
  /** Set to show this image only when that colour is selected (§20). */
  colorOptionId?: Types.ObjectId;
}

export interface IProduct extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;

  garmentTypeId: Types.ObjectId;
  mode: ProductMode;
  status: ProductStatus;

  brand?: string;
  tags: string[];
  sku?: string;

  basePrice: number;
  salePrice?: number;
  currency: string;

  images: IProductImage[];
  videos: string[];

  /**
   * Which groups the customer may change on THIS product. Empty on a purely
   * pre-designed item. On `both`, typically a subset of the garment type's
   * groups — "you may change the fabric, but not the neckline".
   */
  customizableOptions: IOptionConfig[];
  /**
   * The design as the team built it: every group the product ships with,
   * including ones the customer cannot change. Seeds the design page.
   */
  presetSelections: { groupId: Types.ObjectId; optionId: Types.ObjectId }[];

  /** §22 — made-to-order products ignore stock entirely. */
  trackInventory: boolean;
  stock: number;
  isMadeToOrder: boolean;
  leadTimeDays: number;

  isBestseller: boolean;
  isEditorsPick: boolean;

  ratingAverage: number;
  ratingCount: number;
  soldCount: number;

  seo?: { title?: string; description?: string };
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
}

const productImageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    alt: { type: String },
    type: {
      type: String,
      enum: ['front', 'back', 'side', 'detail', 'model', 'fabric', 'embroidery', 'guide'],
      default: 'front',
    },
    position: { type: Number, default: 0 },
    colorOptionId: { type: Schema.Types.ObjectId, ref: 'Option' },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String },
    shortDescription: { type: String, maxlength: 300 },

    garmentTypeId: { type: Schema.Types.ObjectId, ref: 'GarmentType', required: true, index: true },
    mode: {
      type: String,
      enum: ['predesigned', 'customizable', 'both'],
      default: 'predesigned',
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'inactive', 'archived'],
      default: 'draft',
      index: true,
    },

    brand: { type: String, trim: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    sku: { type: String, trim: true },

    basePrice: { type: Number, required: true },
    salePrice: { type: Number },
    currency: { type: String, default: 'INR' },

    images: { type: [productImageSchema], default: [] },
    videos: [{ type: String }],

    customizableOptions: { type: [optionConfigSchema], default: [] },
    presetSelections: {
      type: [
        {
          _id: false,
          groupId: { type: Schema.Types.ObjectId, ref: 'OptionGroup', required: true },
          optionId: { type: Schema.Types.ObjectId, ref: 'Option', required: true },
        },
      ],
      default: [],
    },

    trackInventory: { type: Boolean, default: false },
    stock: { type: Number, default: 0 },
    isMadeToOrder: { type: Boolean, default: true },
    leadTimeDays: { type: Number, default: 21 },

    isBestseller: { type: Boolean, default: false },
    isEditorsPick: { type: Boolean, default: false },

    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },

    seo: {
      title: { type: String },
      description: { type: String },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productSchema.index({ status: 1, isDeleted: 1, garmentTypeId: 1 });
productSchema.index({ isBestseller: 1, soldCount: -1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

/** Convenience for the storefront: is there anything to customize? */
productSchema.virtual('isCustomizable').get(function (this: IProduct) {
  return this.mode !== 'predesigned' && this.customizableOptions.length > 0;
});

export const ProductModel = model<IProduct>('Product', productSchema);
