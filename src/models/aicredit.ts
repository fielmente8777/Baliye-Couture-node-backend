import { Schema, model, Document, Types } from 'mongoose';

/**
 * The store's own AI credit (prepaid OpenAI balance), as the admin records it.
 *
 * OpenAI does not report the remaining balance through the API, so the admin
 * copies it from platform.openai.com → Billing ("balance") and logs each
 * top-up ("topup"). services/aiCredit.ts subtracts the estimated cost of
 * every generation since the latest balance entry.
 */
export type AiCreditKind = 'balance' | 'topup';

export interface IAiCredit extends Document {
  _id: Types.ObjectId;
  kind: AiCreditKind;
  /** US dollars: the balance read from OpenAI, or the amount topped up. */
  amountUsd: number;
  note?: string;
  adminId?: Types.ObjectId;
  createdAt: Date;
}

const aiCreditSchema = new Schema<IAiCredit>(
  {
    kind: { type: String, enum: ['balance', 'topup'], required: true },
    amountUsd: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

aiCreditSchema.index({ kind: 1, createdAt: -1 });

export const AiCreditModel = model<IAiCredit>('AiCredit', aiCreditSchema);
