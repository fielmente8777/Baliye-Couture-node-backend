import { Schema, model, Document, Types } from 'mongoose';

/**
 * Switches the admin can flip without a deploy. A single document
 * (key "app"); missing fields fall back to the env defaults in
 * services/settings.ts.
 */
export interface IAppSettings extends Document {
  _id: Types.ObjectId;
  key: 'app';
  /** Show and charge design credits. Off: AI previews are free, no credit UI. */
  creditsEnabled?: boolean;
  /** "How to measure" video shown in the builder's Measurements step. */
  measureVideoUrl?: string;
  updatedBy?: Types.ObjectId;
  updatedAt: Date;
}

const appSettingsSchema = new Schema<IAppSettings>(
  {
    key: { type: String, enum: ['app'], default: 'app', unique: true },
    creditsEnabled: { type: Boolean },
    measureVideoUrl: { type: String, trim: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

export const AppSettingsModel = model<IAppSettings>('AppSettings', appSettingsSchema);
