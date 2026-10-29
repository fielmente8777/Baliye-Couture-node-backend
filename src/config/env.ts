import dotenv from "dotenv";

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 5000),
  apiPrefix: process.env.API_PREFIX || "/api/v1",

  mongoUri: required("MONGO_URI", "mongodb://localhost:27017/baliye"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", "dev_access_secret"),
    refreshSecret: required("JWT_REFRESH_SECRET", "dev_refresh_secret"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || "",
    fromNumber: process.env.TWILIO_FROM_NUMBER || "",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },

  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || "admin@suitplatform.com",
    password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!",
    name: process.env.SEED_ADMIN_NAME || "Super Admin",
  },

  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
    max: Number(process.env.RATE_LIMIT_MAX || 200),
  },

  /** Where this API is reachable — used to build URLs for saved assets. */
  publicUrl:
    process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`,

  shopify: {
    /** e.g. baliye.myshopify.com — no protocol, no trailing slash. */
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN || "",
    /** Custom app Admin API token. Server-side only — never expose it.
        Only for apps created in the store admin before 2026 (static
        shpat_ token that never expires). Leave empty when using the
        Dev Dashboard client id/secret below. */
    adminToken: process.env.SHOPIFY_ADMIN_TOKEN || "",
    /** Dev Dashboard app credentials (dev.shopify.com → your app → Settings).
        Exchanged for an Admin token that lasts 24 hours and is refreshed
        automatically — see config/shopify.ts. Preferred over adminToken. */
    appClientId: process.env.SHOPIFY_APP_CLIENT_ID || "",
    appClientSecret: process.env.SHOPIFY_APP_CLIENT_SECRET || "",
    /** Public Storefront token, for the cart work that follows. */
    storefrontToken: process.env.SHOPIFY_STOREFRONT_TOKEN || "",

    /** Numeric shop id from the Headless channel — not the myshopify domain. */
    shopId: process.env.SHOPIFY_SHOP_ID || "",
    /** Customer Account API client id, from the Headless channel. */
    customerClientId: process.env.SHOPIFY_CUSTOMER_CLIENT_ID || "",
  },

  upload: {
    dir: process.env.UPLOAD_DIR || "uploads",
    maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 5),
  },

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "no-reply@suitplatform.com",
  },

  /** OpenAI Images API — embroidery extraction, blending, product variants. */
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    /** Only for keys that belong to several organisations. */
    organization: process.env.OPENAI_ORG_ID || "",
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    /**
     * gpt-image-2.5-sunburst — most faithful edits (default)
     * gpt-image-2.5-flare    — faster, same price
     * gpt-image-2            — previous generation
     */
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
    /** Studio work: low | medium | high | xhigh | max | auto. */
    quality: process.env.OPENAI_IMAGE_QUALITY || "high",
    /** Customer design previews — generated per new combination, so cheaper. */
    renderQuality: process.env.OPENAI_RENDER_QUALITY || "medium",
    /** "auto" (default) or "low" — less strict filtering. */
    moderation: process.env.OPENAI_IMAGE_MODERATION || "auto",
    /** High-quality edits can take a minute or two. */
    timeoutMs: Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || 300000),
    /** Generations running at once. Raise on higher OpenAI tiers. */
    concurrency: Number(process.env.OPENAI_IMAGE_CONCURRENCY || 2),
  },

  /**
   * Design credits: customers spend them on AI design previews. This is the
   * DEFAULT only — the admin's switch (Admin → Design credits) overrides it
   * once saved. Off: previews are free and need no sign-in.
   */
  tokens: {
    enabled: process.env.TOKENS_ENABLED === "true",
    /** Tokens one NEW colour generation costs. Cached previews are free. */
    recolourCost: Math.max(1, Number(process.env.TOKEN_COST_RECOLOUR || 1)),
  },
};
