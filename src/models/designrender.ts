import { Schema, model, Document, Types } from 'mongoose';

/**
 * One rendered design, cached by the options that affect the picture.
 *
 * The same garment + neck + sleeve + colour + embroidery always gives the
 * same image, so it is built once and every later customer gets it instantly
 * — no second generation, no second bill.
 */
export type RenderStatus = 'preview' | 'blending' | 'ready' | 'failed';

export interface IDesignRender extends Document {
  _id: Types.ObjectId;
  key: string;
  garmentTypeId: Types.ObjectId;
  selections: { groupId: Types.ObjectId; optionId: Types.ObjectId }[];
  status: RenderStatus;
  /** Exact, code-built image — available immediately. */
  previewUrl: string;
  /** Blended image once finished; equals previewUrl when no blend is needed. */
  finalUrl?: string;
  jobId?: Types.ObjectId;
  drift?: number;
  error?: string;
  createdAt: Date;
}

const designRenderSchema = new Schema<IDesignRender>(
  {
    key: { type: String, required: true, unique: true },
    garmentTypeId: { type: Schema.Types.ObjectId, ref: 'GarmentType', required: true },
    selections: [
      {
        _id: false,
        groupId: { type: Schema.Types.ObjectId, ref: 'OptionGroup' },
        optionId: { type: Schema.Types.ObjectId, ref: 'Option' },
      },
    ],
    status: {
      type: String,
      enum: ['preview', 'blending', 'ready', 'failed'],
      default: 'preview',
    },
    previewUrl: { type: String, required: true },
    finalUrl: { type: String },
    jobId: { type: Schema.Types.ObjectId, ref: 'ImageJob' },
    drift: { type: Number },
    error: { type: String },
  },
  { timestamps: true },
);

export const DesignRenderModel = model<IDesignRender>('DesignRender', designRenderSchema);
