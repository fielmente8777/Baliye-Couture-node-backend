import { Schema, model, Document, Types } from 'mongoose';

import { Landmarks } from '../services/garmentLandmarks';

/**
 * A blank, un-embroidered garment photographed (or generated once and
 * hand-approved) on the mannequin, in white or light grey.
 *
 * Neck and sleeve change the SHAPE of a garment, and shape is exactly what an
 * image model cannot change without redrawing everything else. So shape is
 * never generated: the customer's neck (and sleeve, where shot) picks one of
 * these, and colour and embroidery are applied on top by code.
 */
export interface IBaseGarment extends Document {
  _id: Types.ObjectId;
  garmentTypeId: Types.ObjectId;
  neckOptionId: Types.ObjectId;
  /** Optional — a base without a sleeve serves every sleeve choice. */
  sleeveOptionId?: Types.ObjectId;
  /** Normalised to 3:4 on upload. */
  imageUrl: string;
  /** Garment mask (PNG, white = garment) used for recolouring. */
  maskUrl: string;
  /** Marked by an operator or auto-detected at upload; reused every render. */
  landmarks: Landmarks;
  isActive: boolean;
  createdAt: Date;
}

const baseGarmentSchema = new Schema<IBaseGarment>(
  {
    garmentTypeId: { type: Schema.Types.ObjectId, ref: 'GarmentType', required: true, index: true },
    neckOptionId: { type: Schema.Types.ObjectId, ref: 'Option', required: true },
    sleeveOptionId: { type: Schema.Types.ObjectId, ref: 'Option' },
    imageUrl: { type: String, required: true },
    maskUrl: { type: String, required: true },
    landmarks: { type: Schema.Types.Mixed, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

baseGarmentSchema.index({ garmentTypeId: 1, neckOptionId: 1, sleeveOptionId: 1 });

export const BaseGarmentModel = model<IBaseGarment>('BaseGarment', baseGarmentSchema);
