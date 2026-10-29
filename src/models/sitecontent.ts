import { Schema, model, Document, Types } from 'mongoose';

/**
 * Editable website copy and images — home page sections, footer, terms.
 *
 * One document per page. `data` is the same shape as the defaults the
 * frontend ships with (e.g. homePageData), so a page never breaks when
 * nothing has been saved yet: the frontend falls back section by section.
 */
export const CONTENT_PAGES = ['home', 'footer', 'terms', 'products'] as const;
export type ContentPage = (typeof CONTENT_PAGES)[number];

export interface ISiteContent extends Document {
  _id: Types.ObjectId;
  page: ContentPage;
  data: Record<string, unknown>;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const siteContentSchema = new Schema<ISiteContent>(
  {
    page: { type: String, enum: CONTENT_PAGES, required: true, unique: true },
    data: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true, minimize: false }
);

export const SiteContentModel = model<ISiteContent>('SiteContent', siteContentSchema);
