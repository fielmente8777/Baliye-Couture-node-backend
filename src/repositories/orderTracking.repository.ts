import { IOrderTracking, OrderTrackingModel } from '@models/tracking';

class OrderTrackingRepository {
  create(data: Partial<IOrderTracking>) {
    return OrderTrackingModel.create(data);
  }

  findByOrderId(orderId: string) {
    return OrderTrackingModel.find({ orderId }).sort({ createdAt: 1 }).exec();
  }
}

export const orderTrackingRepository = new OrderTrackingRepository();
