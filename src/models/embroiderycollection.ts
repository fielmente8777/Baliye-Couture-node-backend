import { Schema, model, Document, Types } from 'mongoose';

/**
 * What the admin says about a whole embroidery in AI Studio, beyond its
 * pieces: which necklines it is made for, and notes from someone who knows
 * the work ("hand gota patti, light gold, thin border, sits 2 cm above the
 * hem"). Pieces only share a `collectionId` string, so this sits beside them,
 * keyed by that id.
 *
 * The notes go into every AI step for this embroidery (extraction, naming,
 * try-on, designer preview). The necklines become the linked Embroidery
 * option's neck pairing, so the designer only offers it with those necks.
 */
export interface IEmbroideryCollection extends Document {
  collectionId: string;
  /** Neck Type options it suits. Empty = every neckline. */
  neckOptionIds: Types.ObjectId[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const embroideryCollectionSchema = new Schema<IEmbroideryCollection>(
  {
    collectionId: { type: String, required: true, unique: true },
    neckOptionIds: [{ type: Schema.Types.ObjectId, ref: 'Option' }],
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

export const EmbroideryCollectionModel = model<IEmbroideryCollection>(
  'EmbroideryCollection',
  embroideryCollectionSchema
);
