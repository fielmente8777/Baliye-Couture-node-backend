import { env } from './env';
import { logger } from './logger';

/**
 * Shopify Customer Account API — OAuth 2.0 with PKCE.
 *
 * Shopify removed password login (customerAccessTokenCreate) in API version
 * 2025-04 and deprecated legacy accounts in February 2026. Sign-in is now
 * passwordless — a one-time code by email or SMS — and it happens on Shopify's
 * hosted page. There is no endpoint a custom storefront can post credentials
 * to, so the redirect is unavoidable rather than a design choice.
 */

const API_VERSION = '2026-01';

export interface ShopifyCustomerProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: { emailAddress: string };
  phoneNumber?: { phoneNumber: string };
}

/**
 * Reads the customer behind a token.
 *
 * Doubles as verification: a forged or expired token gets a 401 here, so
 * there is no need to validate a JWT signature ourselves — the same approach
 * already used for the Google and Microsoft sign-in paths.
 */
export async function fetchCustomer(accessToken: string): Promise<ShopifyCustomerProfile> {
  const url = `https://shopify.com/${env.shopify.shopId}/account/customer/api/${API_VERSION}/graphql`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query {
        customer {
          id
          firstName
          lastName
          emailAddress { emailAddress }
          phoneNumber { phoneNumber }
        }
      }`,
    }),
  });

  const payload = (await response.json()) as {
    data?: { customer?: ShopifyCustomerProfile };
    errors?: { message: string }[];
  };

  if (!response.ok || payload.errors?.length || !payload.data?.customer) {
    const detail = payload.errors?.map((e) => e.message).join('; ') ?? response.statusText;
    logger.error({ status: response.status, detail }, 'Shopify customer lookup failed');
    throw new Error('That Shopify session is not valid');
  }

  return payload.data.customer;
}
