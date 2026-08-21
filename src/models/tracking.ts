import { Schema, model, Document, Types } from 'mongoose';
import { OrderStatus } from '../constants/orderstatus';

export interface IOrderTracking extends Document {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  status: OrderStatus;
  updatedBy: Types.ObjectId; // Admin id (or system)
  remarks?: string;
  createdAt: Date;
}

const orderTrackingSchema = new Schema<IOrderTracking>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    status: { type: String, enum: Object.values(OrderStatus), required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    remarks: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const OrderTrackingModel = model<IOrderTracking>('OrderTracking', orderTrackingSchema);