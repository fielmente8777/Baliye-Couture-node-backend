import { Schema, model, Document, Types } from 'mongoose';

export interface ISuitDesign extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name?: string; // user-given nickname for this design, e.g. "Wedding Suit"
  suitType?: Types.ObjectId;
  color?: Types.ObjectId;
  fabric?: Types.ObjectId;
  lapel?: Types.ObjectId;
  buttons?: Types.ObjectId;
  pocketStyle?: Types.ObjectId;
  collar?: Types.ObjectId;
  sleeveStyle?: Types.ObjectId;
  backStyle?: Types.ObjectId;
  vent?: Types.ObjectId;
  lining?: Types.ObjectId;
  monogram?: string;
  embroidery?: string;
  fit?: Types.ObjectId;
  pantStyle?: Types.ObjectId;
  pleats?: Types.ObjectId;
  cuffs?: Types.ObjectId;
  length?: string;
  customNotes?: string;
  basePrice: number;
  totalPrice: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const designOptionRef = { type: Schema.Types.ObjectId, ref: 'DesignOption' };

const suitDesignSchema = new Schema<ISuitDesign>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true },
    suitType: designOptionRef,
    color: designOptionRef,
    fabric: designOptionRef,
    lapel: designOptionRef,
    buttons: designOptionRef,
    pocketStyle: designOptionRef,
    collar: designOptionRef,
    sleeveStyle: designOptionRef,
    backStyle: designOptionRef,
    vent: designOptionRef,
    lining: designOptionRef,
    monogram: { type: String, trim: true },
    embroidery: { type: String, trim: true },
    fit: designOptionRef,
    pantStyle: designOptionRef,
    pleats: designOptionRef,
    cuffs: designOptionRef,
    length: { type: String, trim: true },
    customNotes: { type: String, trim: true },
    basePrice: { type: Number, required: true, default: 0 },
    totalPrice: { type: Number, required: true, default: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SuitDesignModel = model<ISuitDesign>('SuitDesign', suitDesignSchema);