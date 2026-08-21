export enum OrderStatus {
  PENDING = 'Pending',
  CONFIRMED = 'Confirmed',
  MEASUREMENT_VERIFIED = 'Measurement Verified',
  CUTTING = 'Cutting',
  STITCHING = 'Stitching',
  QUALITY_CHECK = 'Quality Check',
  READY = 'Ready',
  SHIPPED = 'Shipped',
  DELIVERED = 'Delivered',
  CANCELLED = 'Cancelled',
}

/**
 * Defines which statuses an order is allowed to move to from its current status.
 * Keeps the status pipeline linear/predictable while still allowing cancellation
 * from any non-terminal state.
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.MEASUREMENT_VERIFIED, OrderStatus.CANCELLED],
  [OrderStatus.MEASUREMENT_VERIFIED]: [OrderStatus.CUTTING, OrderStatus.CANCELLED],
  [OrderStatus.CUTTING]: [OrderStatus.STITCHING, OrderStatus.CANCELLED],
  [OrderStatus.STITCHING]: [OrderStatus.QUALITY_CHECK, OrderStatus.CANCELLED],
  [OrderStatus.QUALITY_CHECK]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];