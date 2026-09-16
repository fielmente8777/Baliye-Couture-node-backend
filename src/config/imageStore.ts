import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { env } from './env';

/**
 * Saves an image to the uploads directory and returns its public URL.
 *
 * Extracted embroidery assets must outlive the generation that produced them:
 * Magnific's result URLs are signed and expire within the hour, and an asset
 * is reused across every future garment. Persisting our own copy is what makes
 * extract-once-reuse actually work.
 */
export async function saveGeneratedImage(
  base64: string,
  extension = 'png',
): Promise<string> {
  const dir = path.resolve(process.cwd(), env.upload.dir, 'ai');
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(dir, filename), Buffer.from(base64, 'base64'));

  /* Served by the express.static mount on /uploads in app.ts. */
  return `${env.publicUrl}/uploads/ai/${filename}`;
}
