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

export const isCustomerAuthConfigured = () =>
  Boolean(env.shopify.shopId && env.shopify.customerClientId);

/**
 * Endpoints are published rather than hardcoded, because Shopify has moved
 * these paths before. One fetch, cached for the process lifetime.
 */
let discovered: { authorization_endpoint: string; token_endpoint: string } | null = null;

export async function endpoints() {
  if (discovered) return discovered;

  const url = `https://shopify.com/authentication/${env.shopify.shopId}/.well-known/openid-configuration`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not read Shopify's OAuth configuration (${response.status})`);
  }

  discovered = (await response.json()) as typeof discovered;
  return discovered!;
}

export interface ShopifyTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/**
 * Exchanges the authorization code for a customer access token.
 *
 * `code_verifier` is the PKCE secret the frontend generated; Shopify checks it
 * against the challenge sent at the start of the flow, which is what stops an
 * intercepted code being redeemed by anyone else.
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<ShopifyTokenSet> {
  const { token_endpoint } = await endpoints();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.shopify.customerClientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  });

  const response = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    logger.error({ status: response.status, detail }, 'Shopify token exchange failed');
    throw new Error('Shopify rejected the sign-in');
  }

  return (await response.json()) as ShopifyTokenSet;
}

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
