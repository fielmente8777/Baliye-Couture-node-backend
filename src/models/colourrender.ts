import { Schema, model, Document, Types } from 'mongoose';

import type { ImageUsage } from '@config/imageUsage';

/**
 * A real garment photo re-dyed to one colour option by the image model.
 *
 * Cached per photo + colour: the first customer to pick Red on a suit waits
 * for the generation, everyone after gets the stored image at once.
 */
export type ColourRenderStatus = 'generating' | 'ready' | 'failed';

export interface IColourRender extends Document {
  _id: Types.ObjectId;
  key: string;
  sourceUrl: string;
  colourOptionId: Types.ObjectId;
  hex: string;
  status: ColourRenderStatus;
  taskId?: string;
  url?: string;
  error?: string;
  /** Who paid for the current attempt, and its ledger ref — for a refund on failure. */
  chargedUserId?: Types.ObjectId;
  chargedTokens?: number;
  chargeRef?: string;
  /** OpenAI tokens and estimated cost of the generation (config/imageUsage.ts). */
  usage?: ImageUsage;
  /** When that cost was incurred — what the admin's AI credit balance counts from. */
  usageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const colourRenderSchema = new Schema<IColourRender>(
  {
    key: { type: String, required: true, unique: true },
    sourceUrl: { type: String, required: true },
    colourOptionId: { type: Schema.Types.ObjectId, ref: 'Option', required: true },
    hex: { type: String, required: true },
    status: { type: String, enum: ['generating', 'ready', 'failed'], default: 'generating' },
    taskId: { type: String, index: true },
    url: { type: String },
    error: { type: String },
    chargedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    chargedTokens: { type: Number },
    chargeRef: { type: String },
    usage: { type: Schema.Types.Mixed },
    usageAt: { type: Date },
  },
  { timestamps: true },
);

export const ColourRenderModel = model<IColourRender>('ColourRender', colourRenderSchema);
