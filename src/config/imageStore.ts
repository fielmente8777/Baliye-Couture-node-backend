import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { env } from './env';
import { logger } from './logger';
import { uploadImageToShopify } from '../services/shopifyFiles';

const MIME: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const shopifyConfigured = () =>
  Boolean(env.shopify.storeDomain && (env.shopify.adminToken || env.shopify.appClientId));

/**
 * Saves an image and returns its public URL.
 *
 * Extracted embroidery assets must outlive the generation that produced them
 * — an asset is reused across every future garment. They go to Shopify Files
 * (Content → Files): it's already paid for, it's a CDN, and unlike this
 * server's disk it survives a redeploy (Render wipes the disk on every one).
 *
 * If Shopify is not configured or the upload fails, the image is written to
 * the uploads directory instead, so a paid generation is never thrown away.
 *
 * `temporary`: a working file needed only for the next minute or two (a blend
 * mask, a studio composite). It stays on disk, so Shopify Files holds only
 * images worth keeping.
 */
export async function saveGeneratedImage(
  base64: string,
  extension = 'png',
  { temporary = false }: { temporary?: boolean } = {},
): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const filename = `baliye-ai-${randomUUID()}.${extension}`;

  if (!temporary && env.imageStore === 'shopify' && shopifyConfigured()) {
    try {
      const { url } = await uploadImageToShopify({
        buffer,
        filename,
        mimeType: MIME[extension] ?? 'image/png',
      });
      return url;
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'Shopify image upload failed — saving to disk instead');
    }
  }

  const dir = path.resolve(process.cwd(), env.upload.dir, 'ai');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);

  /* Served by the express.static mount on /uploads in app.ts. */
  return `${env.publicUrl}/uploads/ai/${filename}`;
}

/**
 * A smaller copy of a saved image, for thumbnails. Shopify's CDN resizes on
 * the fly from a URL parameter, so no second upload is needed; a disk image
 * has no such thing and is returned as is.
 */
export function resizedUrl(url: string, width: number): string {
  if (!url.includes('cdn.shopify.com')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
}
