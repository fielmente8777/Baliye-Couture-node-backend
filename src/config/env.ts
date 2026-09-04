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

  magnific: {
    apiKey: process.env.MAGNIFIC_API_KEY || "",
    webhookUrl: process.env.MAGNIFIC_WEBHOOK_URL || "",
    /** 'nano-banana-pro-flash' or 'flux-2-klein'. */
    model: (process.env.MAGNIFIC_MODEL || "nano-banana-pro-flash") as
      | "flux-2-klein"
      | "nano-banana-pro-flash",
  },
};
