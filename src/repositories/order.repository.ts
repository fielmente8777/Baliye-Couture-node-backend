import { OrderStatus } from '@constants/orderstatus';
import { IOrder, OrderModel } from '@models/order';

export function create(data: Partial<IOrder>) {
  return OrderModel.create(data);
}

/** Raw lookup (admin) — ignores ownership but still hides soft-deleted orders. */
export function findByIdRaw(id: string) {
  return OrderModel.findOne({ _id: id, isDeleted: false }).exec();
}

export function findByIdForUser(id: string, userId: string) {
  return OrderModel.findOne({ _id: id, userId, isDeleted: false })
    .populate('items.suitDesignId')
    .exec();
}

export function findAllByUser(userId: string, skip = 0, limit = 10) {
  return OrderModel.find({ userId, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countByUser(userId: string) {
  return OrderModel.countDocuments({ userId, isDeleted: false }).exec();
}

export function findAllAdmin(filter: { status?: OrderStatus } = {}, skip = 0, limit = 10) {
  return OrderModel.find({ ...filter, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countAdmin(filter: { status?: OrderStatus } = {}) {
  return OrderModel.countDocuments({ ...filter, isDeleted: false }).exec();
}

export function updateStatus(id: string, status: OrderStatus) {
  return OrderModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
}

export function cancel(id: string, reason?: string) {
  return OrderModel.findByIdAndUpdate(
    id,
    { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
    { new: true }
  ).exec();
}

export function softDelete(id: string) {
  return OrderModel.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true },
    { new: true }
  ).exec();
}

