import 'tsconfig-paths/register';

import { connectDB, disconnectDB } from '@config/db';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { EmbroideryAssetModel } from '@models/embroideryasset';
import { ImageJobModel } from '@models/imagejob';
import { ProductModel } from '@models/product';

/**
 * Rewrites saved image URLs to the current PUBLIC_URL.
 *
 * Assets saved while PUBLIC_URL was unset (or pointed at another host) were
 * stored as http://localhost:5000/uploads/..., which no browser can load.
 * Everything from "/uploads/" onward is kept; only the host part is replaced.
 * Signed Magnific URLs are left alone. Safe to run repeatedly.
 */

const base = env.publicUrl.replace(/\/+$/, '');

const fix = (url?: string | null) => {
  if (!url) return url;
  const i = url.indexOf('/uploads/');
  if (i === -1) return url;
  const next = `${base}${url.slice(i)}`;
  return next;
};

async function run() {
  if (/localhost|127\.0\.0\.1/.test(base)) {
    throw new Error(`PUBLIC_URL is ${base} — set it to the live API address before running this`);
  }

  await connectDB();

  let assets = 0;
  for (const a of await EmbroideryAssetModel.find().exec()) {
    const assetUrl = fix(a.assetUrl)!;
    const thumbnailUrl = fix(a.thumbnailUrl)!;
    if (assetUrl !== a.assetUrl || thumbnailUrl !== a.thumbnailUrl) {
      a.assetUrl = assetUrl;
      a.thumbnailUrl = thumbnailUrl;
      await a.save();
      assets += 1;
    }
  }

  let jobs = 0;
  for (const j of await ImageJobModel.find({ resultUrls: { $regex: '/uploads/' } }).exec()) {
    const next = j.resultUrls.map((u) => fix(u)!);
    if (next.join() !== j.resultUrls.join()) {
      j.resultUrls = next;
      await j.save();
      jobs += 1;
    }
  }

  let products = 0;
  for (const p of await ProductModel.find({ 'images.url': { $regex: '/uploads/' } }).exec()) {
    let changed = false;
    for (const img of p.images) {
      const next = fix(img.url)!;
      if (next !== img.url) {
        img.url = next;
        changed = true;
      }
    }
    if (changed) {
      p.markModified('images');
      await p.save();
      products += 1;
    }
  }

  logger.info(`Fixed URLs → ${base}: ${assets} asset(s), ${jobs} job(s), ${products} product(s)`);
  await disconnectDB();
}

run().catch((error) => {
  logger.error({ err: error }, 'URL fix failed');
  process.exit(1);
});
