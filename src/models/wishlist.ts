import { Schema, model, Document, Types } from 'mongoose';

/**
 * One wishlist per user.
 *
 *   product — a catalogue product in our database
 *   design  — one of the user's saved custom designs
 *   shopify — a Shopify ready-to-wear product. Shopify owns its data, so a
 *             small snapshot (title, image, price, handle) is stored to render
 *             the list without a Storefront call per item.
 */
export type WishlistKind = 'product' | 'design' | 'shopify';

export interface IWishlistItem {
  _id: Types.ObjectId;
  kind: WishlistKind;
  productId?: Types.ObjectId;
  customDesignId?: Types.ObjectId;
  shopifyProductId?: string;
  snapshot?: { title: string; image?: string; price?: number; currency?: string; handle?: string };
  addedAt: Date;
}

export interface IWishlist extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  items: IWishlistItem[];
}

const itemSchema = new Schema<IWishlistItem>({
  kind: { type: String, enum: ['product', 'design', 'shopify'], required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  customDesignId: { type: Schema.Types.ObjectId, ref: 'CustomDesign' },
  shopifyProductId: { type: String },
  snapshot: {
    title: { type: String },
    image: { type: String },
    price: { type: Number },
    currency: { type: String },
    handle: { type: String },
  },
  addedAt: { type: Date, default: Date.now },
});

const wishlistSchema = new Schema<IWishlist>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [itemSchema], default: [] },
  },
  { timestamps: true },
);

export const WishlistModel = model<IWishlist>('Wishlist', wishlistSchema);
