import { Schema, model, Document, Types } from 'mongoose';
import { OrderStatus } from '../constants/orderstatus';

export interface IOrderItem {
  kind: 'product' | 'design';
  productId?: Types.ObjectId;
  customDesignId?: Types.ObjectId;
  /**
   * Frozen copy of what was bought. Order history must render correctly after
   * a product is renamed, repriced or archived, so it never populates a live
   * product to display a past order.
   */
  itemSnapshot: {
    name: string;
    image?: string;
    unitPrice: number;
  };
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** Which profile this garment was tailored to, resolved at placement. */
  measurementProfileId: Types.ObjectId;
  /**
   * Frozen copy of that profile's name and values. A profile the customer
   * later renames or deletes must not rewrite what the workshop was told to
   * cut, so the order never populates a live profile.
   */
  measurementSnapshot: {
    profileName: string;
    values: { name: string; value: number; unit: string }[];
  };
}

export interface IOrder extends Document {
  _id: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  items: IOrderItem[];
  measurementSnapshotId: Types.ObjectId;
  totalAmount: number;
  status: OrderStatus;
  /** Which saved address was chosen, for reference and reorder. */
  shippingAddressId?: Types.ObjectId;
  /** Flattened copy, frozen at placement — editing the address later must not
   *  change where a past order was sent. */
  shippingAddress?: string;
  isDeleted: boolean;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    kind: { type: String, enum: ['product', 'design'], required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    customDesignId: { type: Schema.Types.ObjectId, ref: 'CustomDesign' },
    itemSnapshot: {
      name: { type: String, required: true },
      image: { type: String },
      unitPrice: { type: Number, required: true },
    },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    measurementProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'MeasurementProfile',
      required: true,
    },
    measurementSnapshot: {
      profileName: { type: String, required: true },
      values: [
        {
          _id: false,
          name: { type: String, required: true },
          value: { type: Number, required: true },
          unit: { type: String, default: 'in' },
        },
      ],
    },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    measurementSnapshotId: { type: Schema.Types.ObjectId, ref: 'MeasurementProfile', required: true },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.PENDING },
    shippingAddressId: { type: Schema.Types.ObjectId, ref: 'Address' },
    shippingAddress: { type: String },
    isDeleted: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, status: 1 });

export const OrderModel = model<IOrder>('Order', orderSchema);