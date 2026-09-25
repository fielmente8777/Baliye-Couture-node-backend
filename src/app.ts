import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import hpp from "hpp";
import mongoSanitize from "express-mongo-sanitize";
import swaggerUi from "swagger-ui-express";
import path from "path";

import routes from "./routes";
import { env } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import { requestLogger } from "./middlewares/logger";
import { globalRateLimiter } from "./middlewares/ratelimit";
import { errorHandler, notFoundHandler } from "./middlewares/error";

export function createApp(): Application {
  const app = express();

  /* Requests arrive through one proxy (the Next.js server / hosting load
     balancer), which adds X-Forwarded-For. Trusting exactly one hop lets
     express-rate-limit key on the real client IP instead of the proxy's —
     without this every visitor shares one rate-limit bucket, and
     express-rate-limit logs ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. */
  app.set("trust proxy", 1);

  app.use(
    helmet({
      /**
       * swagger-ui-express injects inline scripts/styles; the default CSP
       * blocks them and the docs render blank. Disabled globally here because
       * this API serves JSON, not HTML — revisit if you ever serve a UI.
       */
      contentSecurityPolicy: false,
      /**
       * Helmet's default is "same-origin", which makes the browser REFUSE to
       * show /uploads images on any other domain — the studio on vercel.app
       * got a broken image for every extracted piece. Images and assets are
       * public by design, so allow cross-origin embedding.
       */
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        // Non-browser callers (Postman, server-to-server, health checks) send no Origin.
        if (!origin) return callback(null, true);

        if (env.corsOrigin.includes(origin)) return callback(null, true);

        // Vercel generates a new hostname per deployment — allow previews of this project.
        if (
          /^https:\/\/baliyacotournew-[a-z0-9-]+\.vercel\.app$/.test(origin)
        ) {
          return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "40mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(mongoSanitize());
  app.use(hpp());
  /**
   * Uploaded and AI images. Mounted BEFORE the rate limiter: one studio page
   * loads 10-30 thumbnails, and counting each against the 200-requests limit
   * starts returning 429s — which also shows as broken images.
   */
  app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), env.upload.dir), {
      maxAge: "30d",
      immutable: true,
      setHeaders: (res) => {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Access-Control-Allow-Origin", "*");
      },
    }),
  );

  app.use(requestLogger);
  app.use(globalRateLimiter);

  app.get("/health", (_req, res) => {
    res.status(200).json({
      success: true,
      message: "OK",
      data: { uptime: process.uptime() },
    });
  });

  /**
   * Raw spec — import this URL straight into Postman or Insomnia.
   * Registered before the UI so it is not swallowed by the /api-docs mount.
   */
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customSiteTitle: "Baliye API docs",
      swaggerOptions: {
        /** Keeps the pasted Bearer token across page reloads. */
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
        tryItOutEnabled: true,
      },
    }),
  );

  app.use(env.apiPrefix, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
