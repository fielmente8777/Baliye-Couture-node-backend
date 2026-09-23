import { adminGraphQL, isShopifyConfigured } from '../config/shopify';
import { logger } from '../config/logger';
import type { IUser } from '../models/user';

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
  title: string;
  variantTitle?: string;
  quantity: number;
  image?: string;
  /** What the customer paid for this line, after discounts. */
  lineTotal: number;
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
}

const ORDERS_QUERY = `
  query CustomerOrders($query: String!) {
    orders(first: 50, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        totalPriceSet { presentmentMoney { amount currencyCode } }
        totalShippingPriceSet { presentmentMoney { amount } }
        fulfillments(first: 10) { createdAt deliveredAt displayStatus }
        lineItems(first: 50) {
          nodes {
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
    nodes: {
      id: string;
      name: string;
      createdAt: string;
      cancelledAt: string | null;
      displayFinancialStatus: string | null;
      totalPriceSet: { presentmentMoney: Money };
      totalShippingPriceSet: { presentmentMoney: Money } | null;
      fulfillments: { createdAt: string; deliveredAt: string | null; displayStatus: string | null }[];
      lineItems: {
        nodes: {
          title: string;
          variantTitle: string | null;
          quantity: number;
          image: { url: string } | null;
          discountedTotalSet: { presentmentMoney: Money };
        }[];
      };
    }[];
  };
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

  return {
    id: o.id,
    orderNumber: o.name,
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

  const data = await adminGraphQL<OrdersPayload>(ORDERS_QUERY, { query: search });
  const orders = data.orders.nodes.map(toSummary);

  logger.debug({ userId: user._id.toString(), count: orders.length }, 'Shopify orders fetched');
  return orders;
}
