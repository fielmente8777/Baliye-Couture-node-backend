import { Schema, model, Document, Types } from 'mongoose';
import { OrderStatus } from '../constants/orderstatus';

export interface IOrderItem {
  suitDesignId: Types.ObjectId;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface IOrder extends Document {
  _id: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  items: IOrderItem[];
  measurementSnapshotId: Types.ObjectId;
  totalAmount: number;
  status: OrderStatus;
  shippingAddress?: string;
  isDeleted: boolean;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    suitDesignId: { type: Schema.Types.ObjectId, ref: 'SuitDesign', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    measurementSnapshotId: { type: Schema.Types.ObjectId, ref: 'UserMeasurement', required: true },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.PENDING },
    shippingAddress: { type: String },
    isDeleted: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, status: 1 });

export const OrderModel = model<IOrder>('Order', orderSchema);