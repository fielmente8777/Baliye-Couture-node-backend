import { Schema, model, Document, Types } from 'mongoose';

export interface IMeasurementValue {
  templateId: Types.ObjectId;
  name: string; // denormalized snapshot of template name at time of save
  value: number;
  unit: 'in' | 'cm';
}

export interface IUserMeasurement extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  values: IMeasurementValue[];
  createdAt: Date;
  updatedAt: Date;
}

const measurementValueSchema = new Schema<IMeasurementValue>(
  {
    templateId: { type: Schema.Types.ObjectId, ref: 'MeasurementTemplate', required: true },
    name: { type: String, required: true },
    value: { type: Number, required: true },
    unit: { type: String, enum: ['in', 'cm'], default: 'in' },
  },
  { _id: false }
);

const userMeasurementSchema = new Schema<IUserMeasurement>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    values: { type: [measurementValueSchema], default: [] },
  },
  { timestamps: true }
);

export const UserMeasurementModel = model<IUserMeasurement>('UserMeasurement', userMeasurementSchema);