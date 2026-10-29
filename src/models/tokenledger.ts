import { Schema, model, Document, Types } from 'mongoose';

/**
 * Every change to a customer's token balance, append-only.
 *
 * The balance itself lives on the user (one atomic $inc); this is the receipt
 * trail behind it — what the account page lists and what support checks when
 * a customer asks where their tokens went.
 */
export type TokenReason = 'grant' | 'purchase' | 'spend' | 'refund';

export interface ITokenLedger extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** Positive adds tokens, negative takes them. */
  delta: number;
  balanceAfter: number;
  reason: TokenReason;
  /** What it was for, in words the customer sees. */
  note?: string;
  /**
   * Ties a spend to its refund, so a refund for the same attempt is applied
   * at most once.
   */
  ref?: string;
  adminId?: Types.ObjectId;
  createdAt: Date;
}

const tokenLedgerSchema = new Schema<ITokenLedger>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reason: { type: String, enum: ['grant', 'purchase', 'spend', 'refund'], required: true },
    note: { type: String, trim: true },
    ref: { type: String },
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

tokenLedgerSchema.index({ userId: 1, createdAt: -1 });
/* One refund per spend, enforced by the database rather than hoped for. */
tokenLedgerSchema.index(
  { ref: 1, reason: 1 },
  { unique: true, partialFilterExpression: { reason: 'refund' } },
);

export const TokenLedgerModel = model<ITokenLedger>('TokenLedger', tokenLedgerSchema);
