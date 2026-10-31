import { Schema, model, Document, Types } from 'mongoose';

/**
 * One correction the admin made to a piece the AI named: what the AI said,
 * and what it should have said. The latest ones are shown to the labelling
 * AI as worked examples, so it picks up the client's names, work types and
 * positions over time ("this kind of strip is a Gota Patti Yoke, not a
 * neckline"). Nothing is retrained; the memory is these rows.
 *
 * One row per piece, kept when the piece or its embroidery is deleted: the
 * lesson stays true.
 */
export interface LessonLabel {
  name?: string;
  region?: string;
  side?: string;
  workType?: string;
  description?: string;
}

export interface IEmbroideryLesson extends Document {
  assetId: Types.ObjectId;
  collectionId: string;
  collectionName?: string;
  /** What the AI first said. */
  before: LessonLabel;
  /** What the admin corrected it to. */
  after: LessonLabel;
  createdAt: Date;
  updatedAt: Date;
}

const labelSchema = new Schema<LessonLabel>(
  {
    name: String,
    region: String,
    side: String,
    workType: String,
    description: String,
  },
  { _id: false }
);

const embroideryLessonSchema = new Schema<IEmbroideryLesson>(
  {
    assetId: { type: Schema.Types.ObjectId, required: true, unique: true },
    collectionId: { type: String, required: true },
    collectionName: String,
    before: { type: labelSchema, required: true },
    after: { type: labelSchema, required: true },
  },
  { timestamps: true }
);

embroideryLessonSchema.index({ updatedAt: -1 });

export const EmbroideryLessonModel = model<IEmbroideryLesson>('EmbroideryLesson', embroideryLessonSchema);
