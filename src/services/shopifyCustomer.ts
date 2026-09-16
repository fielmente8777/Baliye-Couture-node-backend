import { adminGraphQL, isShopifyConfigured } from '@config/shopify';
import { logger } from '@config/logger';
import { IUser } from '@models/user';
import * as userRepository from '@repositories/user.repository';

/**
 * Mirrors our customers into Shopify.
 *
 * We keep authentication: our login screen, our OTP, our user records. Shopify
 * needs a matching customer only so that an order placed at its checkout
 * attaches to the right person and appears correctly in the merchant's admin.
 *
 * Every function here is BEST EFFORT. A Shopify outage, a bad token or an
 * unconfigured store must never stop somebody signing in or placing an order —
 * the mirror retries on the customer's next login instead.
 */

interface ShopifyCustomerPayload {
  customerCreate?: {
    customer?: { id: string };
    userErrors: { field: string[]; message: string }[];
  };
  customerUpdate?: {
    customer?: { id: string };
    userErrors: { field: string[]; message: string }[];
  };
  customers?: {
    edges: { node: { id: string } }[];
  };
}

const CREATE = `
  mutation createCustomer($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }
`;

const UPDATE = `
  mutation updateCustomer($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }
`;

const SEARCH = `
  query findCustomer($query: String!) {
    customers(first: 1, query: $query) {
      edges { node { id } }
    }
  }
`;

/** Shopify wants names split; we store one. */
function splitName(name?: string) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: undefined, lastName: undefined };
  if (parts.length === 1) return { firstName: parts[0], lastName: undefined };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function buildInput(user: IUser) {
  const { firstName, lastName } = splitName(user.name);

  return {
    ...(user.email ? { email: user.email } : {}),
    /* Shopify expects E.164 and rejects anything else outright. Our phones are
       already stored that way, but a legacy row without a country code would
       fail the whole mutation, so it is dropped rather than sent invalid. */
    ...(user.phone && /^\+[1-9]\d{7,14}$/.test(user.phone)
      ? { phone: user.phone }
      : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    /* Ties the two systems together from Shopify's side, so support staff can
       trace an order back to our record. */
    metafields: [
      {
        namespace: 'baliye',
        key: 'backend_user_id',
        type: 'single_line_text_field',
        value: user._id.toString(),
      },
    ],
  };
}

/** Escapes a value for Shopify's search syntax. */
const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`;

/**
 * Finds an existing Shopify customer by email or phone.
 *
 * Matters because the merchant may already have customers from a previous
 * store or an import. Creating a second record for the same person would split
 * their order history across two accounts.
 */
async function findExisting(user: IUser): Promise<string | null> {
  const terms: string[] = [];
  if (user.email) terms.push(`email:${quote(user.email)}`);
  if (user.phone) terms.push(`phone:${quote(user.phone)}`);
  if (terms.length === 0) return null;

  const result = await adminGraphQL<ShopifyCustomerPayload>(SEARCH, {
    query: terms.join(' OR '),
  });

  return result.customers?.edges[0]?.node.id ?? null;
}

/**
 * Ensures the user exists in Shopify and records the id against them.
 *
 * Safe to call on every login: it returns immediately once the id is stored,
 * so the cost is one database read for a returning customer.
 */
export async function syncCustomer(user: IUser): Promise<string | null> {
  if (!isShopifyConfigured()) return null;
  if (user.shopifyCustomerId) return user.shopifyCustomerId;

  try {
    /* Adopt an existing record before creating a new one. */
    let shopifyId = await findExisting(user);

    if (!shopifyId) {
      const result = await adminGraphQL<ShopifyCustomerPayload>(CREATE, {
        input: buildInput(user),
      });

      const errors = result.customerCreate?.userErrors ?? [];

      if (errors.length) {
        /* "Email has already been taken" means a race, or a customer the
           search missed — look again rather than giving up. */
        logger.warn({ errors, userId: user._id.toString() }, 'Shopify customerCreate rejected');
        shopifyId = await findExisting(user);
      } else {
        shopifyId = result.customerCreate?.customer?.id ?? null;
      }
    }

    if (!shopifyId) return null;

    await userRepository.updateById(user._id.toString(), {
      shopifyCustomerId: shopifyId,
    });

    logger.info({ userId: user._id.toString(), shopifyId }, 'Shopify customer linked');
    return shopifyId;
  } catch (error) {
    /* Never block the caller — sign-in and checkout must work regardless. */
    logger.error({ err: error, userId: user._id.toString() }, 'Shopify customer sync failed');
    return null;
  }
}

/**
 * Pushes a changed email, phone or name to Shopify.
 *
 * Called from the profile endpoints. Without it the two systems drift, and a
 * customer who updates their number here keeps receiving Shopify's order
 * notifications at the old one.
 */
export async function pushCustomerUpdate(user: IUser): Promise<void> {
  if (!isShopifyConfigured()) return;

  /* Not linked yet — create rather than update. */
  if (!user.shopifyCustomerId) {
    await syncCustomer(user);
    return;
  }

  try {
    const result = await adminGraphQL<ShopifyCustomerPayload>(UPDATE, {
      input: { id: user.shopifyCustomerId, ...buildInput(user) },
    });

    const errors = result.customerUpdate?.userErrors ?? [];
    if (errors.length) {
      logger.warn({ errors, userId: user._id.toString() }, 'Shopify customerUpdate rejected');
    }
  } catch (error) {
    logger.error({ err: error, userId: user._id.toString() }, 'Shopify customer update failed');
  }
}

/**
 * Fire-and-forget wrapper.
 *
 * Login should not wait on a Shopify round trip. The promise is deliberately
 * not awaited, and its rejection is swallowed, because an unhandled rejection
 * would crash the process on an outage.
 */
export function syncCustomerInBackground(user: IUser): void {
  void syncCustomer(user).catch(() => undefined);
}
