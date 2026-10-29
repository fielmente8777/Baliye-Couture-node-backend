import { ContentPage, SiteContentModel } from '@models/sitecontent';
import { uploadImageToShopify } from './shopifyFiles';
import { isShopifyConfigured } from '@config/shopify';
import { ApiError } from '@utils/apiError';

/** Saved content for a page, or null when the admin hasn't edited it yet. */
export async function getContent(page: ContentPage) {
  const doc = await SiteContentModel.findOne({ page }).lean().exec();
  return doc ? { data: doc.data, updatedAt: doc.updatedAt } : null;
}

/** Replaces the whole page — the editor always sends every section. */
export async function saveContent(page: ContentPage, data: Record<string, unknown>, adminId?: string) {
  const doc = await SiteContentModel.findOneAndUpdate(
    { page },
    { data, updatedBy: adminId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .lean()
    .exec();
  return { data: doc.data, updatedAt: doc.updatedAt };
}

/** Website images go to Shopify Files too, so everything is served by its CDN. */
export async function uploadContentImage(file: { buffer: Buffer; originalname: string; mimetype: string }) {
  if (!isShopifyConfigured()) throw ApiError.badRequest('Shopify is not configured on the backend');
  const { url } = await uploadImageToShopify({
    buffer: file.buffer,
    filename: file.originalname,
    mimeType: file.mimetype,
  });
  return { url };
}
