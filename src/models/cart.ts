import { Schema, model, Document, Types } from 'mongoose';

export interface ICartItem {
  _id: Types.ObjectId;
  suitDesignId: Types.ObjectId;
  quantity: number;
  unitPrice: number; // snapshot of SuitDesign.totalPrice at time of add
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
});

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

export const CartModel = model<ICart>('Cart', cartSchema);