import { CustomDesignModel } from '@models/customdesign';
import { ProductModel } from '@models/product';
import { IWishlistItem, WishlistKind, WishlistModel } from '@models/wishlist';
import { ApiError } from '@utils/apiError';
import { addItem as addToCart } from './cart';

/** Enough to stop one account growing without bound. */
const MAX_ITEMS = 200;

export interface AddWishlistInput {
  kind: WishlistKind;
  productId?: string;
  customDesignId?: string;
  shopifyProductId?: string;
  snapshot?: IWishlistItem['snapshot'];
}

const refOf = (item: { kind: WishlistKind; productId?: unknown; customDesignId?: unknown; shopifyProductId?: string }) =>
  item.kind === 'product'
    ? String(item.productId)
    : item.kind === 'design'
      ? String(item.customDesignId)
      : String(item.shopifyProductId);

async function getOrCreate(userId: string) {
  return (
    (await WishlistModel.findOne({ userId }).exec()) ??
    (await WishlistModel.create({ userId, items: [] }))
  );
}

/**
 * The list, ready to render. Product and design details are read live so the
 * price shown is today's; items whose product was archived or design deleted
 * are flagged unavailable rather than silently dropped.
 */
export async function getWishlist(userId: string) {
  const wishlist = await getOrCreate(userId);

  const productIds = wishlist.items.filter((i) => i.kind === 'product').map((i) => i.productId);
  const designIds = wishlist.items.filter((i) => i.kind === 'design').map((i) => i.customDesignId);

  const [products, designs] = await Promise.all([
    ProductModel.find({ _id: { $in: productIds } }).exec(),
    CustomDesignModel.find({ _id: { $in: designIds }, userId, isDeleted: false }).exec(),
  ]);

  const items = [...wishlist.items]
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
    .map((item) => {
      const base = { _id: item._id, kind: item.kind, addedAt: item.addedAt };

      if (item.kind === 'product') {
        const p = products.find((x) => x._id.equals(item.productId));
        return {
          ...base,
          productId: item.productId,
          available: Boolean(p && p.status === 'active'),
          title: p?.name ?? 'Product no longer available',
          slug: p?.slug,
          image: p?.images?.[0]?.url,
          price: p ? p.salePrice ?? p.basePrice : undefined,
          compareAtPrice: p?.salePrice ? p.basePrice : undefined,
          currency: p?.currency,
        };
      }

      if (item.kind === 'design') {
        const d = designs.find((x) => x._id.equals(item.customDesignId));
        return {
          ...base,
          customDesignId: item.customDesignId,
          available: Boolean(d),
          title: d?.name || 'Custom design',
          price: d?.pricing.total,
          currency: d?.pricing.currency,
        };
      }

      return {
        ...base,
        shopifyProductId: item.shopifyProductId,
        available: true,
        title: item.snapshot?.title ?? 'Product',
        handle: item.snapshot?.handle,
        image: item.snapshot?.image,
        price: item.snapshot?.price,
        currency: item.snapshot?.currency,
      };
    });

  return { count: items.length, items };
}

/** Just the references, for filling heart icons on listing pages. */
export async function getWishlistRefs(userId: string) {
  const wishlist = await WishlistModel.findOne({ userId }).exec();
  const items = wishlist?.items ?? [];
  return {
    productIds: items.filter((i) => i.kind === 'product').map((i) => String(i.productId)),
    designIds: items.filter((i) => i.kind === 'design').map((i) => String(i.customDesignId)),
    shopifyProductIds: items.filter((i) => i.kind === 'shopify').map((i) => i.shopifyProductId!),
  };
}

export async function addToWishlist(userId: string, input: AddWishlistInput) {
  if (input.kind === 'product') {
    const product = await ProductModel.findById(input.productId).exec();
    if (!product || product.status !== 'active') throw ApiError.notFound('Product not found');
  } else if (input.kind === 'design') {
    const design = await CustomDesignModel.findOne({
      _id: input.customDesignId,
      userId,
      isDeleted: false,
    }).exec();
    if (!design) throw ApiError.notFound('Design not found');
  } else if (!input.shopifyProductId || !input.snapshot?.title) {
    throw ApiError.badRequest('Shopify items need shopifyProductId and a snapshot title');
  }

  const wishlist = await getOrCreate(userId);
  const ref = refOf(input);

  /* Adding twice is not an error — the heart just stays filled. */
  if (wishlist.items.some((i) => i.kind === input.kind && refOf(i) === ref)) {
    return getWishlist(userId);
  }
  if (wishlist.items.length >= MAX_ITEMS) {
    throw ApiError.badRequest(`Your wishlist is full (${MAX_ITEMS} items) — remove something first`);
  }

  wishlist.items.push({
    kind: input.kind,
    productId: input.kind === 'product' ? input.productId : undefined,
    customDesignId: input.kind === 'design' ? input.customDesignId : undefined,
    shopifyProductId: input.kind === 'shopify' ? input.shopifyProductId : undefined,
    snapshot: input.kind === 'shopify' ? input.snapshot : undefined,
  } as never);
  await wishlist.save();

  return getWishlist(userId);
}

export async function removeFromWishlist(userId: string, itemId: string) {
  await WishlistModel.updateOne({ userId }, { $pull: { items: { _id: itemId } } }).exec();
  return getWishlist(userId);
}

/** Remove by reference — for toggling a heart without knowing the item id. */
export async function removeByRef(userId: string, kind: WishlistKind, ref: string) {
  const field = kind === 'product' ? 'productId' : kind === 'design' ? 'customDesignId' : 'shopifyProductId';
  await WishlistModel.updateOne({ userId }, { $pull: { items: { kind, [field]: ref } } }).exec();
  return getWishlist(userId);
}

/**
 * Moves a product or design into the cart and off the wishlist. Shopify items
 * are added to cart on the Shopify side (variant choice happens there), so the
 * frontend sends the customer to the product page for those.
 */
export async function moveToCart(userId: string, itemId: string, measurementProfileId?: string) {
  const wishlist = await getOrCreate(userId);
  const item = wishlist.items.find((i) => i._id.toString() === itemId);
  if (!item) throw ApiError.notFound('Item not in your wishlist');

  if (item.kind === 'shopify') {
    throw ApiError.badRequest('Choose a size on the product page to add this to your cart');
  }

  await addToCart(userId, {
    kind: item.kind,
    productId: item.productId?.toString(),
    customDesignId: item.customDesignId?.toString(),
    quantity: 1,
    measurementProfileId,
  });

  return removeFromWishlist(userId, itemId);
}
