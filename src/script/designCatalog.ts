import 'tsconfig-paths/register';

import { connectDB, disconnectDB } from '@config/db';
import { logger } from '@config/logger';
import { pullDesignCatalog, pushDesignCatalog } from '@services/designCatalogSync';

/**
 * Design catalogue ↔ Shopify (see services/designCatalogSync.ts).
 *
 *   npm run design-catalog:pull   Shopify → MongoDB (also runs automatically)
 *   npm run design-catalog:push   MongoDB → Shopify, the one-time fill
 */
async function run() {
  const mode = process.argv[2];
  if (mode !== 'pull' && mode !== 'push') throw new Error('Usage: designCatalog.ts pull|push');

  await connectDB();
  const result = mode === 'push' ? await pushDesignCatalog() : await pullDesignCatalog();
  logger.info(result, `Design catalogue ${mode} complete`);
  await disconnectDB();
}

run().catch((error) => {
  logger.error({ err: error }, 'Design catalogue sync failed');
  process.exit(1);
});
