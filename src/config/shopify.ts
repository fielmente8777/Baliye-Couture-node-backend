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

const usesClientCredentials = () =>
  Boolean(env.shopify.appClientId && env.shopify.appClientSecret);

export const isShopifyConfigured = () =>
  Boolean(env.shopify.storeDomain && (usesClientCredentials() || env.shopify.adminToken));

/* ---------------------------------------------------------------------------
 * Admin access token.
 *
 * Since January 2026 Shopify no longer lets you create custom apps (with a
 * permanent shpat_ token) from the store admin. Apps are created in the Dev
 * Dashboard instead, and their Admin tokens come from the client credentials
 * grant and EXPIRE AFTER 24 HOURS. A token copied into .env therefore works
 * for a day, then every call fails with "Invalid API key or access token".
 *
 * So when SHOPIFY_APP_CLIENT_ID / SECRET are set, a fresh token is fetched
 * here, cached in memory, and renewed five minutes before it expires.
 * SHOPIFY_ADMIN_TOKEN is still honoured for a legacy admin-created app.
 * ------------------------------------------------------------------------- */

let cachedToken: { value: string; expiresAt: number; issuedAt: number; scope?: string } | null = null;
let inFlight: Promise<string> | null = null;

const RENEW_EARLY_MS = 5 * 60 * 1000;

async function requestToken(): Promise<string> {
  const response = await fetch(`https://${env.shopify.storeDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.shopify.appClientId,
      client_secret: env.shopify.appClientSecret,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    logger.error({ status: response.status, body: text }, 'Shopify token request failed');
    throw new Error(`Shopify token request failed (${response.status}): ${text}`);
  }

  const body = JSON.parse(text) as { access_token: string; expires_in?: number; scope?: string };
  const lifetimeMs = (body.expires_in ?? 86399) * 1000;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + lifetimeMs, issuedAt: Date.now(), scope: body.scope };

  /* The scopes are a readback of what the app version grants — logged so a
     missing one (e.g. read_orders) is visible without guessing. */
  logger.info({ scope: body.scope, expiresInS: body.expires_in }, 'Shopify Admin token issued');
  return body.access_token;
}

async function getAdminToken(): Promise<string> {
  if (!usesClientCredentials()) return env.shopify.adminToken;

  if (cachedToken && Date.now() < cachedToken.expiresAt - RENEW_EARLY_MS) {
    return cachedToken.value;
  }

  /* Several requests arriving together share one token request. */
  inFlight ??= requestToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

interface GraphQLResponse<T> {
  data?: T;
  /* Array of {message} on a normal GraphQL failure, but Shopify returns a
     bare string here on auth failures (bad token, wrong store domain) —
     assuming the array shape crashed this function exactly when the
     detail mattered most: an auth problem, where response.ok is also
     false. Typed loosely and normalized below instead. */
  errors?: unknown;
}

/** Turns whatever shape Shopify sent `errors` in into one readable string. */
function describeShopifyErrors(errors: unknown): string | undefined {
  if (!errors) return undefined;
  if (typeof errors === 'string') return errors;
  if (Array.isArray(errors)) {
    return errors
      .map((e) => (typeof e === 'string' ? e : (e as { message?: string })?.message ?? JSON.stringify(e)))
      .join('; ');
  }
  return JSON.stringify(errors);
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
    throw new Error(
      'Shopify is not configured — set SHOPIFY_STORE_DOMAIN plus SHOPIFY_APP_CLIENT_ID/SHOPIFY_APP_CLIENT_SECRET (or SHOPIFY_ADMIN_TOKEN)',
    );
  }

  const send = async () =>
    fetch(adminUrl(), {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': await getAdminToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

  let response = await send();

  /* A 401 with client credentials means the cached token was revoked or
     expired early (e.g. the app secret was rotated) — get a new one and
     retry once. A static token can't be renewed, so it fails straight away. */
  if (response.status === 401 && usesClientCredentials()) {
    cachedToken = null;
    response = await send();
  }

  let payload = (await response.json()) as GraphQLResponse<T>;
  let detail = describeShopifyErrors(payload.errors);

  /* "Access denied" with a token issued before the latest app version was
     released: the token still carries the OLD scopes (it lives 24 hours).
     Fetch a new one and retry once, so a newly added scope works without a
     restart. A token issued in the last minute is already current. */
  if (
    detail &&
    /access denied|required access/i.test(detail) &&
    usesClientCredentials() &&
    cachedToken &&
    Date.now() - cachedToken.issuedAt > 60_000
  ) {
    logger.warn({ detail, oldScope: cachedToken.scope }, 'Shopify access denied — refreshing token in case scopes changed');
    cachedToken = null;
    response = await send();
    payload = (await response.json()) as GraphQLResponse<T>;
    detail = describeShopifyErrors(payload.errors);
  }

  if (!response.ok || detail) {
    logger.error({ status: response.status, detail: detail ?? response.statusText }, 'Shopify Admin API error');
    throw new Error(`Shopify: ${detail ?? response.statusText}`);
  }

  if (!payload.data) throw new Error('Shopify returned no data');
  return payload.data;
}
/** Scopes the backend's features rely on — compared against what's granted. */
export const REQUIRED_SCOPES = [
  'write_customers',
  'read_orders',
  'write_orders',
  'read_returns',
  'write_returns',
  'read_products',
];

/** How the backend authenticates, for the status endpoint. */
export const shopifyAuthMode = () => (usesClientCredentials() ? 'client_credentials' : 'static_token');
