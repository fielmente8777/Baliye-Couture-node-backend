

import 'tsconfig-paths/register';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDB, disconnectDB } from './config/db';
import { registerNotificationListeners } from './services/notification.listeners';

/**
 * Every saved image URL is built from PUBLIC_URL. If it is missing in
 * production, assets are stored as http://localhost:5000/uploads/... and no
 * browser can ever load them — the other cause of broken studio images.
 */
function checkPublicUrl() {
  const url = env.publicUrl;
  if (/localhost|127\.0\.0\.1/.test(url) && env.isProd) {
    logger.error(
      `PUBLIC_URL is ${url} in production — every saved image will be unreachable. ` +
        'Set PUBLIC_URL to this API\'s public https address.',
    );
  } else if (url.startsWith('http://') && env.isProd) {
    logger.warn(`PUBLIC_URL is http (${url}) — https pages will block these images as mixed content.`);
  }
}

async function bootstrap() {
  checkPublicUrl();
  await connectDB();
  registerNotificationListeners();

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
    logger.info(`API docs available at http://localhost:${env.port}/api-docs`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});