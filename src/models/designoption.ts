import { Schema, model, Document, Types } from 'mongoose';

export type DesignOptionCategory =
  | 'suitType'
  | 'color'
  | 'fabric'
  | 'lapel'
  | 'buttons'
  | 'pocketStyle'
  | 'collar'
  | 'sleeveStyle'
  | 'backStyle'
  | 'vent'
  | 'lining'
  | 'fit'
  | 'pantStyle'
  | 'pleats'
  | 'cuffs';

export const DESIGN_OPTION_CATEGORIES: DesignOptionCategory[] = [
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

export interface IDesignOption extends Document {
  _id: Types.ObjectId;
  category: DesignOptionCategory;
  label: string; // e.g. "Peak Lapel", "Navy Blue"
  value: string; // slug/code used in SuitDesign
  swatchImage?: string;
  priceModifier: number; // additive to base price
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const designOptionSchema = new Schema<IDesignOption>(
  {
    category: { type: String, enum: DESIGN_OPTION_CATEGORIES, required: true },
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    swatchImage: { type: String },
    priceModifier: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

designOptionSchema.index({ category: 1, value: 1 }, { unique: true });

export const DesignOptionModel = model<IDesignOption>('DesignOption', designOptionSchema);