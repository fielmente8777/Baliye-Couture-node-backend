import { Schema, model, Document, Types } from 'mongoose';

/**
 * One chosen option, frozen at save time (§32).
 *
 * The label and price are copied, not referenced: when the admin later raises
 * Premium Silk from +₹500 to +₹800, this design and any order containing it
 * must still read +₹500.
 */
export interface IDesignSelection {
  groupId: Types.ObjectId;
  groupCode: string;
  groupLabel: string;
  optionId: Types.ObjectId;
  optionLabel: string;
  optionValue: string;
  priceModifier: number;
}

export interface IPriceBreakdown {
  basePrice: number;
  adjustments: { label: string; amount: number }[];
  discount: number;
  total: number;
  currency: string;
}

/**
 * A customer's configured garment. Replaces SuitDesign, whose fifteen hardcoded
 * menswear columns (lapel, vent, pleats…) could not express womenswear.
 */
export interface ICustomDesign extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  garmentTypeId: Types.ObjectId;
  /** Set when the design started from a pre-designed product. */
  sourceProductId?: Types.ObjectId;

  name?: string;
  selections: IDesignSelection[];

  /** Either a saved profile, or a standard size chosen instead (§8). */
  measurementProfileId?: Types.ObjectId;
  sizeOptionId?: Types.ObjectId;

  /** Free-text tailoring notes (§18). */
  instructions?: string;

  pricing: IPriceBreakdown;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const selectionSchema = new Schema<IDesignSelection>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'OptionGroup', required: true },
    groupCode: { type: String, required: true },
    groupLabel: { type: String, required: true },
    optionId: { type: Schema.Types.ObjectId, ref: 'Option', required: true },
    optionLabel: { type: String, required: true },
    optionValue: { type: String, required: true },
    priceModifier: { type: Number, default: 0 },
  },
  { _id: false }
);

const customDesignSchema = new Schema<ICustomDesign>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    garmentTypeId: { type: Schema.Types.ObjectId, ref: 'GarmentType', required: true },
    sourceProductId: { type: Schema.Types.ObjectId, ref: 'Product' },

    name: { type: String, trim: true, maxlength: 120 },
    selections: { type: [selectionSchema], default: [] },

    measurementProfileId: { type: Schema.Types.ObjectId, ref: 'MeasurementProfile' },
    sizeOptionId: { type: Schema.Types.ObjectId, ref: 'Option' },

    instructions: { type: String, maxlength: 1000 },

    pricing: {
      basePrice: { type: Number, required: true },
      adjustments: [
        {
          _id: false,
          label: { type: String, required: true },
          amount: { type: Number, required: true },
        },
      ],
      discount: { type: Number, default: 0 },
      total: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
    },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const CustomDesignModel = model<ICustomDesign>('CustomDesign', customDesignSchema);
