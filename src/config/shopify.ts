import { env } from './env';
import { logger } from './logger';

/**
 * Shopify Admin GraphQL client.
 *
 * Used only for the parts Shopify owns — customers, and later carts and
 * orders. The design configurator, measurements and AI studio stay on this
 * backend, because Shopify cannot represent a garment with millions of option
 * combinations (its ceiling is 2,000 variants per product).
 */

const API_VERSION = '2026-01';

const adminUrl = () =>
  `https://${env.shopify.storeDomain}/admin/api/${API_VERSION}/graphql.json`;

export const isShopifyConfigured = () =>
  Boolean(env.shopify.storeDomain && env.shopify.adminToken);

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * Shopify returns HTTP 200 with an `errors` array for most failures, so the
 * status code alone never tells you whether a mutation worked.
 */
export async function adminGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  if (!isShopifyConfigured()) {
    throw new Error('Shopify is not configured — set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN');
  }

  const response = await fetch(adminUrl(), {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': env.shopify.adminToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as GraphQLResponse<T>;

  if (!response.ok || payload.errors?.length) {
    const detail = payload.errors?.map((e) => e.message).join('; ') ?? response.statusText;
    logger.error({ status: response.status, detail }, 'Shopify Admin API error');
    throw new Error(`Shopify: ${detail}`);
  }

  if (!payload.data) throw new Error('Shopify returned no data');
  return payload.data;
}
