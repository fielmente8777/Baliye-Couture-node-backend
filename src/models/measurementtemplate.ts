import { Schema, model, Document, Types } from 'mongoose';

export interface IMeasurementTemplate extends Document {
  _id: Types.ObjectId;
  name: string; // e.g. "Neck", "Chest", "Sleeve"
  unit: 'in' | 'cm';
  defaultValue?: number;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const measurementTemplateSchema = new Schema<IMeasurementTemplate>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    unit: { type: String, enum: ['in', 'cm'], default: 'in' },
    defaultValue: { type: Number },
    description: { type: String },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const MeasurementTemplateModel = model<IMeasurementTemplate>(
  'MeasurementTemplate',
  measurementTemplateSchema
);