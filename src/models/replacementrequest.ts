import { Schema, model, Document, Types } from 'mongoose';

/**
 * A customer's request to fix a delivered garment.
 *
 *   alteration  — the garment is fine but needs adjusting (tighter, shorter)
 *   replacement — it must be remade (wrong fabric, damaged, badly mis-sized)
 *
 * Made-to-measure garments cannot be resold, so there is no "return for
 * refund" — only these two paths, both decided by the admin.
 */
export type ReplacementType = 'alteration' | 'replacement';

export type ReplacementReason =
  | 'fit_issue'
  | 'wrong_item'
  | 'damaged'
  | 'defect'
  | 'not_as_designed'
  | 'other';

export type ReplacementStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'in_progress'
  | 'completed';

export interface IReplacementRequest extends Document {
  _id: Types.ObjectId;
  requestNumber: string;
  orderId: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  /** Which line of the order — index into order.items. */
  itemIndex: number;
  itemName: string;
  type: ReplacementType;
  reason: ReplacementReason;
  description: string;
  photos: string[];
  status: ReplacementStatus;
  /** Shown to the customer: why rejected, or what happens next. */
  adminNote?: string;
  /** The free remake order, created when a replacement is approved. */
  replacementOrderId?: Types.ObjectId;
  history: { status: ReplacementStatus; note?: string; at: Date; by?: Types.ObjectId }[];
  createdAt: Date;
  updatedAt: Date;
}

const replacementSchema = new Schema<IReplacementRequest>(
  {
    requestNumber: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemIndex: { type: Number, required: true, min: 0 },
    itemName: { type: String, required: true },
    type: { type: String, enum: ['alteration', 'replacement'], required: true },
    reason: {
      type: String,
      enum: ['fit_issue', 'wrong_item', 'damaged', 'defect', 'not_as_designed', 'other'],
      required: true,
    },
    description: { type: String, required: true, maxlength: 1000 },
    photos: [{ type: String }],
    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'in_progress', 'completed'],
      default: 'requested',
      index: true,
    },
    adminNote: { type: String, maxlength: 500 },
    replacementOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    history: [
      {
        _id: false,
        status: { type: String, required: true },
        note: { type: String },
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId },
      },
    ],
  },
  { timestamps: true },
);

export const ReplacementRequestModel = model<IReplacementRequest>(
  'ReplacementRequest',
  replacementSchema,
);
