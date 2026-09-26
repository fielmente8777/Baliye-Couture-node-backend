import { randomUUID } from 'crypto';
import sharp from 'sharp';

import { saveGeneratedImage } from '@config/imageStore';
import { OrderStatus } from '@constants/orderstatus';
import { OrderModel } from '@models/order';
import {
  IReplacementRequest,
  ReplacementReason,
  ReplacementRequestModel,
  ReplacementStatus,
  ReplacementType,
} from '@models/replacementrequest';
import { OrderTrackingModel } from '@models/tracking';
import { ApiError } from '@utils/apiError';
import { replacementDeadline } from './order';

/** Which admin moves are allowed from each status. */
const FLOW: Record<ReplacementStatus, ReplacementStatus[]> = {
  requested: ['approved', 'rejected'],
  approved: ['in_progress', 'completed'],
  in_progress: ['completed'],
  rejected: [],
  completed: [],
};

const OPEN: ReplacementStatus[] = ['requested', 'approved', 'in_progress'];

export interface CreateReplacementInput {
  itemIndex: number;
  type: ReplacementType;
  reason: ReplacementReason;
  description: string;
  /** Base64 photos of the problem, up to 4. */
  photos?: string[];
}

export async function createRequest(userId: string, orderId: string, input: CreateReplacementInput) {
  const order = await OrderModel.findOne({ _id: orderId, userId, isDeleted: false }).exec();
  if (!order) throw ApiError.notFound('Order not found');

  if (order.status !== OrderStatus.DELIVERED) {
    throw ApiError.badRequest('A replacement can be requested once the order is delivered');
  }

  const deadline = await replacementDeadline(order);
  if (!deadline || deadline.getTime() < Date.now()) {
    throw ApiError.badRequest('The replacement window for this order has closed — please contact us');
  }

  const item = order.items[input.itemIndex];
  if (!item) throw ApiError.badRequest('That item is not part of this order');

  const open = await ReplacementRequestModel.findOne({
    orderId: order._id,
    itemIndex: input.itemIndex,
    status: { $in: OPEN },
  }).exec();
  if (open) {
    throw ApiError.conflict(`There is already an open request (${open.requestNumber}) for this item`);
  }

  /* Phone photos: upright, max 1600px, JPEG — a fraction of the upload size. */
  const photos = await Promise.all(
    (input.photos ?? []).slice(0, 4).map(async (p) => {
      try {
        const jpeg = await sharp(Buffer.from(p.replace(/^data:[^;]+;base64,/, ''), 'base64'))
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        return saveGeneratedImage(jpeg.toString('base64'), 'jpg');
      } catch {
        throw ApiError.badRequest('One of the photos could not be read — use JPG or PNG');
      }
    }),
  );

  return ReplacementRequestModel.create({
    requestNumber: `RPL-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
    orderId: order._id,
    orderNumber: order.orderNumber,
    userId,
    itemIndex: input.itemIndex,
    itemName: item.itemSnapshot.name,
    type: input.type,
    reason: input.reason,
    description: input.description,
    photos,
    status: 'requested',
    history: [{ status: 'requested', at: new Date() }],
  });
}

export function listMine(userId: string) {
  return ReplacementRequestModel.find({ userId }).sort({ createdAt: -1 }).exec();
}

export function listForOrder(userId: string, orderId: string) {
  return ReplacementRequestModel.find({ userId, orderId }).sort({ createdAt: -1 }).exec();
}

export function adminList(status?: ReplacementStatus, skip = 0, limit = 20) {
  const filter = status ? { status } : {};
  return Promise.all([
    ReplacementRequestModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    ReplacementRequestModel.countDocuments(filter).exec(),
  ]);
}

/**
 * Approving a REPLACEMENT creates a free remake order for that one item, with
 * the same frozen measurements, straight into Confirmed so it enters the
 * workshop queue like any other order. Alterations need no new order.
 */
async function createRemakeOrder(request: IReplacementRequest, adminId: string) {
  const original = await OrderModel.findById(request.orderId).exec();
  if (!original) throw ApiError.notFound('Original order not found');

  /* Plain copy — spreading a Mongoose subdocument copies its internals. */
  const item = original.toObject().items[request.itemIndex];

  const remake = await OrderModel.create({
    orderNumber: `ORD-${Date.now()}-R${randomUUID().slice(0, 5).toUpperCase()}`,
    userId: original.userId,
    items: [{ ...item, unitPrice: 0, subtotal: 0, quantity: 1 }],
    measurementSnapshotId: original.measurementSnapshotId,
    totalAmount: 0,
    status: OrderStatus.CONFIRMED,
    shippingAddressId: original.shippingAddressId,
    shippingAddress: original.shippingAddress,
    replacementOfOrderId: original._id,
  });

  await OrderTrackingModel.create({
    orderId: remake._id,
    status: OrderStatus.CONFIRMED,
    updatedBy: adminId,
    remarks: `Replacement for ${original.orderNumber} (${request.requestNumber})`,
  });

  return remake;
}

export async function adminUpdate(
  id: string,
  adminId: string,
  status: ReplacementStatus,
  note?: string,
) {
  const request = await ReplacementRequestModel.findById(id).exec();
  if (!request) throw ApiError.notFound('Request not found');

  if (!FLOW[request.status].includes(status)) {
    throw ApiError.badRequest(`Cannot move a "${request.status}" request to "${status}"`);
  }
  if (status === 'rejected' && !note) {
    throw ApiError.badRequest('Add a note telling the customer why it was rejected');
  }

  if (status === 'approved' && request.type === 'replacement' && !request.replacementOrderId) {
    const remake = await createRemakeOrder(request, adminId);
    request.replacementOrderId = remake._id;
  }

  request.status = status;
  if (note) request.adminNote = note;
  request.history.push({ status, note, at: new Date(), by: adminId as never });
  await request.save();

  return request;
}
