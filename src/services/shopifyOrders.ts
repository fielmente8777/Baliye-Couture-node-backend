import { adminGraphQL, isShopifyConfigured } from '../config/shopify';
import { logger } from '../config/logger';
import type { IUser } from '../models/user';
import { ApiError } from '../utils/apiError';

/**
 * Ready-to-wear orders placed through Shopify's hosted checkout.
 *
 * These are read live from Shopify on each request rather than copied into
 * Mongo: Shopify owns them (payment, fulfilment, refunds all happen there),
 * so a copy would only drift. Custom-design orders stay in models/order.ts.
 *
 * Requires the Admin token to have the `read_orders` scope. Shopify only
 * returns the last 60 days of orders with that scope; for older history the
 * app also needs `read_all_orders` (requested separately in the Partner /
 * Dev Dashboard).
 */

export type ShopifyOrderStatus = 'placed' | 'shipped' | 'delivered' | 'cancelled';

export interface ShopifyOrderItem {
  /** Shopify LineItem GID — sent back when requesting a return. */
  lineItemId: string;
  title: string;
  variantTitle?: string;
  quantity: number;
  image?: string;
  /** What the customer paid for this line, after discounts. */
  lineTotal: number;
  /** How many of this line have shipped and are not already in a return. */
  returnableQuantity: number;
  /** Price of one unit after discounts — what one returned unit refunds. */
  unitPrice: number;
  /** Shopify product handle — lets the exchange step list sizes in stock. Needs read_products. */
  productHandle?: string;
  variantId?: string;
  /** e.g. [{ name: "Size", value: "S" }] */
  selectedOptions: { name: string; value: string }[];
}

export interface ShopifyReturnSummary {
  /** e.g. "#1001-R1" */
  name: string;
  /** REQUESTED, OPEN, CLOSED, DECLINED, CANCELED */
  status: string;
}

export interface ShopifyOrderSummary {
  /** Shopify GID, e.g. gid://shopify/Order/123. */
  id: string;
  /** What the customer sees, e.g. "#1001". */
  orderNumber: string;
  createdAt: string;
  status: ShopifyOrderStatus;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  /** Shopify's financial status: PAID, PENDING (e.g. COD), REFUNDED … */
  paymentStatus: string;
  currencyCode: string;
  /** Grand total the customer pays: items + shipping (taxes already inside for INR). */
  total: number;
  /** Shipping charged on the order, after shipping discounts. */
  shippingTotal: number;
  items: ShopifyOrderItem[];
  /** Nothing has shipped yet, so the customer may cancel (full refund). */
  canCancel: boolean;
  /** Shipped/delivered, within the return window, something left to return. */
  canRequestReturn: boolean;
  returnWindowEndsAt?: string;
  returns: ShopifyReturnSummary[];
}

/**
 * Order LIST — deliberately light.
 *
 * Shopify rejects any query whose worst-case cost exceeds 1,000 points, and
 * cost multiplies through nested lists: 50 orders × 10 fulfilments × 50
 * fulfilment lines alone is 25,000. The previous list asked for fulfilment
 * lines and returns on every order, so Shopify refused it outright and the
 * customer's whole ready-to-wear history vanished. The list now carries only
 * what the order cards show; returns and returnable quantities are loaded
 * per order by ORDER_QUERY on the detail page.
 */
const ORDERS_QUERY = `
  query CustomerOrders($query: String!, $first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { presentmentMoney { amount currencyCode } }
        totalShippingPriceSet { presentmentMoney { amount } }
        fulfillments(first: 3) { createdAt deliveredAt displayStatus }
        lineItems(first: 10) {
          nodes {
            id
            title
            variantTitle
            quantity
            image { url }
            discountedTotalSet { presentmentMoney { amount } }
          }
        }
      }
    }
  }
`;

interface Money {
  amount: string;
  currencyCode?: string;
}

interface OrdersPayload {
  orders: {
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      name: string;
      createdAt: string;
      cancelledAt: string | null;
      displayFinancialStatus: string | null;
      displayFulfillmentStatus: string | null;
      totalPriceSet: { presentmentMoney: Money };
      totalShippingPriceSet: { presentmentMoney: Money } | null;
      fulfillments: {
        createdAt: string;
        deliveredAt: string | null;
        displayStatus: string | null;
        /** Detail query only. */
        fulfillmentLineItems?: { nodes: { id: string; quantity: number; lineItem: { id: string } }[] };
      }[];
      /** Detail query only. */
      returns?: {
        nodes: {
          name: string;
          status: string;
          returnLineItems: {
            nodes: { quantity: number; fulfillmentLineItem?: { lineItem: { id: string } } }[];
          };
        }[];
      };
      lineItems: {
        nodes: {
          id: string;
          title: string;
          variantTitle: string | null;
          quantity: number;
          image: { url: string } | null;
          discountedTotalSet: { presentmentMoney: Money };
          variant?: { id: string; selectedOptions: { name: string; value: string }[] } | null;
          product?: { handle: string } | null;
        }[];
      };
    }[];
  };
}


/**
 * Two parts of the order query need scopes beyond read_orders:
 *   returns          → read_returns   (return status on the order page)
 *   variant/product  → read_products  (sizes for an exchange)
 * Until a new app version with those scopes is released and the backend has
 * a fresh token, asking for either fails the WHOLE query — which emptied the
 * customer's Shopify order list. So: try with them; if Shopify refuses, load
 * the orders without them. Remembered for 10 minutes.
 */
const RETURNS_BLOCK = `returns(first: 5) {
  nodes {
    name
    status
    returnLineItems(first: 20) {
      nodes { quantity ... on ReturnLineItem { fulfillmentLineItem { lineItem { id } } } }
    }
  }
}`;

const PRODUCT_BLOCK = `variant { id selectedOptions { name value } }
product { handle }`;

let optionalBlockedUntil = 0;

function withEmptyReturns<T>(value: T): T {
  const fill = (o: { returns?: unknown } | null | undefined) => {
    if (o && !o.returns) o.returns = { nodes: [] };
  };
  const v = value as unknown as { orders?: { nodes: { returns?: unknown }[] }; order?: { returns?: unknown } | null };
  v.orders?.nodes.forEach(fill);
  fill(v.order);
  return value;
}

async function orderQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (Date.now() >= optionalBlockedUntil) {
    try {
      return await adminGraphQL<T>(
        query.replace('__RETURNS__', RETURNS_BLOCK).replace('__PRODUCT__', PRODUCT_BLOCK),
        variables,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/return|product|variant|access denied|required access/i.test(message)) throw error;
      optionalBlockedUntil = Date.now() + 10 * 60 * 1000;
      logger.warn(
        { detail: message },
        'Shopify refused order returns/products — add read_returns, write_returns and read_products, release the app version, restart. Loading orders without them.',
      );
    }
  }
  return withEmptyReturns(
    await adminGraphQL<T>(query.replace('__RETURNS__', '').replace('__PRODUCT__', ''), variables),
  );
}

/** gid://shopify/Customer/123 → 123 (the form Shopify's search syntax takes). */
const numericId = (gid: string) => gid.split('/').pop() ?? '';

/**
 * Matches by the linked customer id AND by email. The email half catches
 * guest checkouts that Shopify didn't attach to the customer record — and
 * orders placed before the account was linked. Both identifiers belong to
 * this user (the email is verified by Shopify's own sign-in), so the OR
 * can't pull in anyone else's orders.
 */
function buildSearch(user: IUser): string | null {
  const parts: string[] = [];
  if (user.shopifyCustomerId) parts.push(`customer_id:${numericId(user.shopifyCustomerId)}`);
  if (user.email) parts.push(`email:"${user.email.replace(/"/g, '')}"`);
  return parts.length ? parts.join(' OR ') : null;
}

type OrderNode = OrdersPayload['orders']['nodes'][number];

/**
 * Ready-to-wear return policy: 7 days from delivery. When the courier gives
 * no delivery scan, 14 days from dispatch stands in for it.
 */
const RETURN_DAYS_AFTER_DELIVERY = 7;
const RETURN_DAYS_AFTER_SHIPPING = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns that are still live — a declined or cancelled one frees the items again. */
const ACTIVE_RETURN = ['REQUESTED', 'OPEN', 'CLOSED'];

function returnWindowEnd(o: OrderNode): Date | null {
  const delivered = o.fulfillments.find((f) => f.deliveredAt)?.deliveredAt;
  if (delivered) return new Date(new Date(delivered).getTime() + RETURN_DAYS_AFTER_DELIVERY * DAY_MS);
  const shipped = o.fulfillments[0]?.createdAt;
  if (shipped) return new Date(new Date(shipped).getTime() + RETURN_DAYS_AFTER_SHIPPING * DAY_MS);
  return null;
}

/** Per line item: quantity shipped minus quantity already in an active return. */
function returnableByLine(o: OrderNode) {
  const shipped = new Map<string, number>();

  /* List query: no fulfilment lines. Once anything has shipped, treat every
     line as returnable — the detail page loads the exact figures. */
  if (!o.fulfillments.some((f) => f.fulfillmentLineItems)) {
    if (o.fulfillments.length > 0) for (const li of o.lineItems.nodes) shipped.set(li.id, li.quantity);
    return shipped;
  }

  for (const f of o.fulfillments) {
    for (const fli of f.fulfillmentLineItems?.nodes ?? []) {
      shipped.set(fli.lineItem.id, (shipped.get(fli.lineItem.id) ?? 0) + fli.quantity);
    }
  }
  for (const r of o.returns?.nodes ?? []) {
    if (!ACTIVE_RETURN.includes(r.status)) continue;
    for (const rli of r.returnLineItems.nodes) {
      const id = rli.fulfillmentLineItem?.lineItem.id;
      if (id) shipped.set(id, (shipped.get(id) ?? 0) - rli.quantity);
    }
  }
  return shipped;
}

function toSummary(o: OrderNode): ShopifyOrderSummary {
  const delivered = o.fulfillments.find((f) => f.deliveredAt || f.displayStatus === 'DELIVERED');
  const firstShipment = o.fulfillments[0];

  const status: ShopifyOrderStatus = o.cancelledAt
    ? 'cancelled'
    : delivered
      ? 'delivered'
      : firstShipment
        ? 'shipped'
        : 'placed';

  const returnable = returnableByLine(o);
  const windowEnd = returnWindowEnd(o);
  const anyReturnable = [...returnable.values()].some((q) => q > 0);

  return {
    id: o.id,
    orderNumber: o.name,
    /* Only before anything ships: a parcel on its way can't be recalled. */
    canCancel: !o.cancelledAt && o.fulfillments.length === 0,
    canRequestReturn:
      !o.cancelledAt && anyReturnable && Boolean(windowEnd && windowEnd.getTime() > Date.now()),
    returnWindowEndsAt: windowEnd?.toISOString(),
    returns: (o.returns?.nodes ?? []).map((r) => ({ name: r.name, status: r.status })),
    createdAt: o.createdAt,
    status,
    shippedAt: firstShipment?.createdAt,
    deliveredAt: delivered ? (delivered.deliveredAt ?? undefined) : undefined,
    cancelledAt: o.cancelledAt ?? undefined,
    paymentStatus: o.displayFinancialStatus ?? 'PENDING',
    currencyCode: o.totalPriceSet.presentmentMoney.currencyCode ?? 'INR',
    total: Number(o.totalPriceSet.presentmentMoney.amount),
    shippingTotal: Number(o.totalShippingPriceSet?.presentmentMoney.amount ?? 0),
    items: o.lineItems.nodes.map((li) => ({
      lineItemId: li.id,
      returnableQuantity: Math.max(0, returnable.get(li.id) ?? 0),
      unitPrice: li.quantity ? Number(li.discountedTotalSet.presentmentMoney.amount) / li.quantity : 0,
      productHandle: li.product?.handle,
      variantId: li.variant?.id,
      selectedOptions: li.variant?.selectedOptions ?? [],
      title: li.title,
      variantTitle: li.variantTitle ?? undefined,
      quantity: li.quantity,
      image: li.image?.url,
      lineTotal: Number(li.discountedTotalSet.presentmentMoney.amount),
    })),
  };
}

/** Newest first. Empty when Shopify isn't configured or the user has no identifiers. */
export async function getShopifyOrdersForUser(user: IUser): Promise<ShopifyOrderSummary[]> {
  if (!isShopifyConfigured()) return [];

  const search = buildSearch(user);
  if (!search) return [];

  /* ~50 cost points per order, so 15 per page stays well under Shopify's
     1,000-point limit; up to 4 pages = the 60 most recent orders. */
  let pageSize = 15;
  const nodes: OrdersPayload['orders']['nodes'] = [];
  let after: string | null = null;

  for (let page = 0; page < 4; page += 1) {
    let data: OrdersPayload;
    try {
      data = await adminGraphQL<OrdersPayload>(ORDERS_QUERY, { query: search, first: pageSize, after });
    } catch (error) {
      /* If Shopify's cost rules tighten, fetch smaller pages rather than none. */
      const message = error instanceof Error ? error.message : String(error);
      if (pageSize === 5 || !/cost|exceed|throttl/i.test(message)) {
        if (nodes.length) break; /* keep what we already have */
        throw error;
      }
      logger.warn({ detail: message }, 'Shopify order list too costly — retrying with smaller pages');
      pageSize = 5;
      page -= 1;
      continue;
    }
    nodes.push(...data.orders.nodes);
    if (!data.orders.pageInfo?.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }

  const orders = nodes.map(toSummary);

  logger.debug({ userId: user._id.toString(), count: orders.length }, 'Shopify orders fetched');
  return orders;
}


/* ------------------------------------------------------------------------ */
/* Customer actions on a Shopify order                                        */
/* ------------------------------------------------------------------------ */

const ORDER_QUERY = `
  query OneOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      customer { id }
      createdAt
      cancelledAt
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet { presentmentMoney { amount currencyCode } }
      totalShippingPriceSet { presentmentMoney { amount } }
      fulfillments(first: 5) {
        createdAt
        deliveredAt
        displayStatus
        fulfillmentLineItems(first: 20) { nodes { id quantity lineItem { id } } }
      }
      __RETURNS__
      lineItems(first: 20) {
        nodes {
          id
          title
          variantTitle
          quantity
          image { url }
          discountedTotalSet { presentmentMoney { amount } }
          __PRODUCT__
        }
      }
    }
  }
`;

type OneOrder = OrderNode & { email: string | null; customer: { id: string } | null };

/** Turns "Access denied … Required access: write_orders" into an actionable message. */
function rethrow(error: unknown, action: string): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/access denied|required access/i.test(message)) {
    const scope = message.match(/`?(write_\w+|read_\w+)`?/)?.[1];
    logger.error({ detail: message }, `Shopify refused to ${action}`);
    throw new ApiError(
      500,
      `Shopify refused to ${action}${scope ? ` (${scope} not granted to the current token)` : ''}. ` +
        'Check GET /api/v1/shopify/status → missingScopes.',
    );
  }
  throw error;
}

/**
 * Loads one order and proves it belongs to this user — by linked customer id
 * or by the (Shopify-verified) email, the same rule the order list uses.
 * Anyone else's order reads as "not found", never "forbidden".
 */
async function getOwnedOrder(user: IUser, orderNumericId: string): Promise<OneOrder> {
  if (!isShopifyConfigured()) throw ApiError.badRequest('Shopify is not configured');
  if (!/^\d+$/.test(orderNumericId)) throw ApiError.notFound('Order not found');

  const data = await orderQuery<{ order: OneOrder | null }>(ORDER_QUERY, {
    id: `gid://shopify/Order/${orderNumericId}`,
  });
  const order = data.order;

  const ownsByCustomer =
    order?.customer?.id && user.shopifyCustomerId && order.customer.id === user.shopifyCustomerId;
  const ownsByEmail =
    order?.email && user.email && order.email.toLowerCase() === user.email.toLowerCase();

  if (!order || (!ownsByCustomer && !ownsByEmail)) throw ApiError.notFound('Order not found');
  return order;
}

const CANCEL_MUTATION = `
  mutation CancelOrder($orderId: ID!, $reason: OrderCancelReason!, $staffNote: String) {
    orderCancel(
      orderId: $orderId
      reason: $reason
      refundMethod: { originalPaymentMethodsRefund: true }
      restock: true
      notifyCustomer: true
      staffNote: $staffNote
    ) {
      job { id done }
      orderCancelUserErrors { field message code }
    }
  }
`;

/**
 * Cancels an unshipped Shopify order: full refund to the original payment
 * method, stock returned, and Shopify emails the customer. Requires the
 * write_orders scope.
 */
export async function cancelShopifyOrder(user: IUser, orderNumericId: string, reason?: string) {
  const order = await getOwnedOrder(user, orderNumericId);

  if (order.cancelledAt) throw ApiError.badRequest('This order is already cancelled');
  if (order.fulfillments.length > 0) {
    throw ApiError.badRequest(
      'This order has already shipped, so it can no longer be cancelled — request a return once it arrives',
    );
  }

  let data: {
    orderCancel: {
      job: { id: string; done: boolean } | null;
      orderCancelUserErrors: { field: string[] | null; message: string; code: string }[];
    };
  };
  try {
    data = await adminGraphQL(CANCEL_MUTATION, {
      orderId: order.id,
      reason: 'CUSTOMER',
      staffNote: `Cancelled by customer from the website${reason ? `: ${reason.slice(0, 250)}` : ''}`,
    });
  } catch (error) {
    rethrow(error, 'cancel orders');
  }

  const errors = data.orderCancel.orderCancelUserErrors;
  if (errors.length) throw ApiError.badRequest(errors.map((e) => e.message).join('; '));

  logger.info({ order: order.name, userId: user._id.toString() }, 'Shopify order cancelled by customer');

  /* Cancellation runs as a Shopify job and usually lands within seconds; the
     order list shows "Cancelled" once it has. */
  return { orderNumber: order.name, cancelled: true, jobDone: data.orderCancel.job?.done ?? false };
}

export type ShopifyReturnReason =
  | 'SIZE_TOO_SMALL'
  | 'SIZE_TOO_LARGE'
  | 'NOT_AS_DESCRIBED'
  | 'WRONG_ITEM'
  | 'DEFECTIVE'
  | 'STYLE'
  | 'COLOR'
  | 'UNWANTED'
  | 'OTHER';

export interface ShopifyReturnInput {
  /** What the customer wants back: the same item again, or their money. */
  resolution: 'replacement' | 'refund';
  reason: ShopifyReturnReason;
  note?: string;
  /** Replacement only: the size/variant wanted instead, e.g. "Size: M". */
  exchangeFor?: string;
  items: { lineItemId: string; quantity: number }[];
}

const RETURN_MUTATION = `
  mutation RequestReturn($input: ReturnRequestInput!) {
    returnRequest(input: $input) {
      return { id name status }
      userErrors { field message }
    }
  }
`;

/**
 * Files a return REQUEST in Shopify. It lands in Shopify admin → Orders →
 * the order → Returns as "Return requested"; the merchant approves or
 * declines there, then either refunds or sends the replacement (exchange).
 * The customer's choice of replacement vs refund is written into the note so
 * the merchant sees it first. Requires read_returns + write_returns.
 */
export async function requestShopifyReturn(
  user: IUser,
  orderNumericId: string,
  input: ShopifyReturnInput,
) {
  const order = await getOwnedOrder(user, orderNumericId);
  const summary = toSummary(order);

  if (!summary.canRequestReturn) {
    throw ApiError.badRequest(
      order.cancelledAt
        ? 'This order was cancelled'
        : order.fulfillments.length === 0
          ? 'This order has not shipped yet — you can cancel it instead'
          : 'The return window for this order has closed — please contact us',
    );
  }

  /* Map each requested line onto the fulfillment line items it shipped in —
     Shopify returns are made against those, not against the order line. */
  const returnLineItems: { fulfillmentLineItemId: string; quantity: number; returnReason: string; customerNote: string }[] = [];
  const header =
    input.resolution === 'replacement'
      ? `[EXCHANGE${input.exchangeFor ? ` → ${input.exchangeFor}` : ''}]`
      : '[REFUND]';
  const customerNote = `${header} ${input.note ?? ''}`.trim().slice(0, 300);

  for (const wanted of input.items) {
    const line = summary.items.find((i) => i.lineItemId === wanted.lineItemId);
    if (!line) throw ApiError.badRequest('One of those items is not in this order');
    if (wanted.quantity > line.returnableQuantity) {
      throw ApiError.badRequest(`Only ${line.returnableQuantity} of "${line.title}" can be returned`);
    }

    let remaining = wanted.quantity;
    for (const f of order.fulfillments) {
      for (const fli of f.fulfillmentLineItems?.nodes ?? []) {
        if (remaining === 0 || fli.lineItem.id !== wanted.lineItemId) continue;
        const take = Math.min(remaining, fli.quantity);
        returnLineItems.push({
          fulfillmentLineItemId: fli.id,
          quantity: take,
          returnReason: input.reason,
          customerNote,
        });
        remaining -= take;
      }
    }
  }

  if (returnLineItems.length === 0) throw ApiError.badRequest('Choose at least one item to return');

  let data: {
    returnRequest: {
      return: { id: string; name: string; status: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  };
  try {
    data = await adminGraphQL(RETURN_MUTATION, {
      input: { orderId: order.id, returnLineItems },
    });
  } catch (error) {
    rethrow(error, 'create return requests');
  }

  const errors = data.returnRequest.userErrors;
  if (errors.length || !data.returnRequest.return) {
    throw ApiError.badRequest(errors.map((e) => e.message).join('; ') || 'Shopify did not accept the request');
  }

  logger.info(
    { order: order.name, returnName: data.returnRequest.return.name, resolution: input.resolution },
    'Shopify return requested by customer',
  );

  return data.returnRequest.return;
}

/**
 * One order with everything the detail page needs — exact returnable
 * quantities, return statuses, sizes for exchange. Single-order queries are
 * cheap, so this is where the heavy fields live.
 */
export async function getShopifyOrderDetail(user: IUser, orderNumericId: string) {
  return toSummary(await getOwnedOrder(user, orderNumericId));
}
