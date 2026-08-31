import { Schema, model, Document, Types } from 'mongoose';
import { IOptionConfig, optionConfigSchema } from './optionconfig';

/**
 * A garment the customer can design from scratch: Patiala Suit, Kurti, Gown.
 *
 * Data, not an enum (§2) — the product team adds new types from the dashboard.
 * Each type declares which option groups it exposes and in what order, which is
 * what makes Kurti show Length while Patiala Suit shows Lower and Dupatta.
 */
export interface IGarmentType extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  /** Grouping for the "What do you want to design?" screen. */
  family: 'indian' | 'western' | 'indo-western';
  basePrice: number;
  /** Which measurement templates this garment needs (§17). */
  measurementTemplates: Types.ObjectId[];
  optionConfigs: IOptionConfig[];
  /** Offered in Create Your Own Design. */
  isDesignable: boolean;
  position: number;
  isActive: boolean;
  isDeleted: boolean;
}

const garmentTypeSchema = new Schema<IGarmentType>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    image: { type: String },
    family: {
      type: String,
      enum: ['indian', 'western', 'indo-western'],
      default: 'indian',
    },
    basePrice: { type: Number, required: true, default: 0 },
    measurementTemplates: [{ type: Schema.Types.ObjectId, ref: 'MeasurementTemplate' }],
    optionConfigs: { type: [optionConfigSchema], default: [] },
    isDesignable: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const GarmentTypeModel = model<IGarmentType>('GarmentType', garmentTypeSchema);
