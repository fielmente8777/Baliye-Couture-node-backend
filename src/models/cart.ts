import { Schema, model, Document, Types } from 'mongoose';

/**
 * What a line item points at.
 *   product — bought as-is, no customization (§3 pre-designed)
 *   design  — a saved CustomDesign, from either the builder or a customized
 *             pre-designed product
 */
export type CartItemKind = 'product' | 'design';

export interface ICartItem {
  _id: Types.ObjectId;
  kind: CartItemKind;
  productId?: Types.ObjectId;
  customDesignId?: Types.ObjectId;
  quantity: number;
  /** Recomputed server-side on add — never taken from the client. */
  unitPrice: number;
  /**
   * Whose body this item is tailored to. Optional: left unset, the order falls
   * back to the user's default profile. Held per item so one order can contain
   * garments for different people.
   */
  measurementProfileId?: Types.ObjectId;
}

export interface ICart extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>({
  kind: { type: String, enum: ['product', 'design'], required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  customDesignId: { type: Schema.Types.ObjectId, ref: 'CustomDesign' },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  unitPrice: { type: Number, required: true },
  measurementProfileId: { type: Schema.Types.ObjectId, ref: 'MeasurementProfile' },
});

/** Exactly one of the two references must be set — a line item is one or the other. */
cartItemSchema.pre('validate', function (next) {
  const hasProduct = Boolean(this.productId);
  const hasDesign = Boolean(this.customDesignId);

  if (hasProduct === hasDesign) {
    return next(new Error('A cart item needs exactly one of productId or customDesignId'));
  }
  if (this.kind === 'product' && !hasProduct) {
    return next(new Error('A product cart item needs a productId'));
  }
  if (this.kind === 'design' && !hasDesign) {
    return next(new Error('A design cart item needs a customDesignId'));
  }
  next();
});

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

export const CartModel = model<ICart>('Cart', cartSchema);
