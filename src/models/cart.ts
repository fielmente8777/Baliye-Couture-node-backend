import { Schema, model, Document, Types } from 'mongoose';

export interface ICartItem {
  _id: Types.ObjectId;
  suitDesignId: Types.ObjectId;
  quantity: number;
  unitPrice: number; // snapshot of SuitDesign.totalPrice at time of add
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
  suitDesignId: { type: Schema.Types.ObjectId, ref: 'SuitDesign', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  unitPrice: { type: Number, required: true },
  measurementProfileId: { type: Schema.Types.ObjectId, ref: 'MeasurementProfile' },
});

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

export const CartModel = model<ICart>('Cart', cartSchema);