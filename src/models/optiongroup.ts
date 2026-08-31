import { Schema, model, Document, Types } from 'mongoose';

/**
 * How a group is presented and validated. Adding a new input type is a
 * frontend concern; the backend only needs to know how many values are valid.
 */
export type OptionInputType =
  | 'single_select'
  | 'multi_select'
  | 'color_select'
  | 'size_select'
  | 'measurement'
  | 'number'
  | 'text'
  | 'image_upload';

/**
 * A customization axis — Fabric, Colour, Neck, Sleeve, Dupatta, and anything
 * the product team adds later (§37).
 *
 * This is a COLLECTION, not an enum. The old DESIGN_OPTION_CATEGORIES constant
 * hardcoded fifteen menswear axes (lapel, vent, pleats…); introducing "Dupatta"
 * meant a code change and a deploy. Groups are now data.
 */
export interface IOptionGroup extends Document {
  _id: Types.ObjectId;
  /** Stable machine key: 'fabric', 'neck', 'dupatta'. Never renamed. */
  code: string;
  /** What the customer sees: "Fabric Style". Freely editable. */
  label: string;
  description?: string;
  inputType: OptionInputType;
  /** Fallback ordering when a garment type doesn't override it. */
  position: number;
  isActive: boolean;
}

const optionGroupSchema = new Schema<IOptionGroup>(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    inputType: {
      type: String,
      enum: [
        'single_select',
        'multi_select',
        'color_select',
        'size_select',
        'measurement',
        'number',
        'text',
        'image_upload',
      ],
      default: 'single_select',
    },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const OptionGroupModel = model<IOptionGroup>('OptionGroup', optionGroupSchema);
