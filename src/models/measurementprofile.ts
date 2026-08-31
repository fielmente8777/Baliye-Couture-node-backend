import { Schema, model, Document, Types } from 'mongoose';

export interface IMeasurementValue {
  templateId: Types.ObjectId;
  /** Denormalised snapshot of the template name at time of save, so an old
   *  order still reads correctly after a template is renamed. */
  name: string;
  value: number;
  unit: 'in' | 'cm';
}

/**
 * A named set of body measurements. Replaces the one-per-user
 * UserMeasurement: a tailoring customer routinely orders for a spouse, a
 * child or a parent, and the UI lists profiles by name with Edit on each.
 */
export interface IMeasurementProfile extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  profileName: string;
  values: IMeasurementValue[];
  isDefault: boolean;
  isDeleted: boolean;
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

const measurementProfileSchema = new Schema<IMeasurementProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profileName: { type: String, required: true, trim: true, maxlength: 60 },
    values: { type: [measurementValueSchema], default: [] },
    isDefault: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** One profile name per user — stops "Mum" existing twice by accident. */
measurementProfileSchema.index(
  { userId: 1, profileName: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

export const MeasurementProfileModel = model<IMeasurementProfile>(
  'MeasurementProfile',
  measurementProfileSchema
);
