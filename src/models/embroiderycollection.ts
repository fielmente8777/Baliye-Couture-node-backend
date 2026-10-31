import { Schema, model, Document, Types } from 'mongoose';

/**
 * What the admin says about a whole embroidery in AI Studio, beyond its
 * pieces: which neck, sleeve, length, lower, dupatta and colour it goes with,
 * and notes from someone who knows the work ("hand gota patti, light gold,
 * thin border, sits 2 cm above the hem"). Pieces only share a `collectionId`
 * string, so this sits beside them, keyed by that id.
 *
 * The notes go into every AI step for this embroidery (extraction, naming,
 * try-on, designer preview). The option lists become the linked Embroidery
 * option's pairing (`syncStudioPairing`), so the designer only offers it with
 * those choices, and narrows the later steps to them once it is picked.
 */
export interface IEmbroideryCollection extends Document {
  collectionId: string;
  /** Neck Type options it suits. Required for new embroidery; empty (older ones) = every neckline. */
  neckOptionIds: Types.ObjectId[];
  /** Sleeve Type options. Required for new embroidery. */
  sleeveOptionIds: Types.ObjectId[];
  /** Length options (kurti, anarkali). New embroidery needs a length or a lower. */
  lengthOptionIds: Types.ObjectId[];
  /** Lower options (salwar, pajama, sharara). */
  lowerOptionIds: Types.ObjectId[];
  /** Optional. Empty = any dupatta. */
  dupattaOptionIds: Types.ObjectId[];
  /** Optional. Empty = every colour. */
  colourOptionIds: Types.ObjectId[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const optionIds = [{ type: Schema.Types.ObjectId, ref: 'Option' }];

const embroideryCollectionSchema = new Schema<IEmbroideryCollection>(
  {
    collectionId: { type: String, required: true, unique: true },
    neckOptionIds: optionIds,
    sleeveOptionIds: optionIds,
    lengthOptionIds: optionIds,
    lowerOptionIds: optionIds,
    dupattaOptionIds: optionIds,
    colourOptionIds: optionIds,
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

export const EmbroideryCollectionModel = model<IEmbroideryCollection>(
  'EmbroideryCollection',
  embroideryCollectionSchema
);
