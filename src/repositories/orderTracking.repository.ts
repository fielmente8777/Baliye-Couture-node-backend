import { IOrderTracking, OrderTrackingModel } from '@models/tracking';

export function create(data: Partial<IOrderTracking>) {
  return OrderTrackingModel.create(data);
}

export function findByOrderId(orderId: string) {
  return OrderTrackingModel.find({ orderId }).sort({ createdAt: 1 }).exec();
}

