import { Types } from 'mongoose';

import { ApiError } from '../utils/apiError';
import * as cartRepository from '../repositories/cart.repository';
import * as productRepository from '../repositories/product.repository';
import * as measurementService from './measurement';
import { CartItemKind, ICartItem } from '../models/cart';
import { CustomDesignModel } from '../models/customdesign';

/** Both references are populated so the cart page can render either kind. */
const POPULATE = ['items.productId', 'items.customDesignId'];

const withRefs = (cart: Awaited<ReturnType<typeof cartRepository.getOrCreateForUser>>) =>
  cart.populate(POPULATE);

export async function getCart(userId: string) {
  const cart = await cartRepository.getOrCreateForUser(userId);
  return withRefs(cart);
}

export interface AddItemInput {
  kind: CartItemKind;
  productId?: string;
  customDesignId?: string;
  quantity: number;
  measurementProfileId?: string;
}

/**
 * Resolves what is being added and returns its authoritative price.
 *
 * Price always comes from the database, never the request: a design carries the
 * total it was priced at when saved (§32 snapshot), and a product uses its
 * current sale or base price.
 */
async function resolveItem(userId: string, input: AddItemInput) {
  if (input.kind === 'design') {
    if (!input.customDesignId) throw ApiError.badRequest('A design id is required');

    const design = await CustomDesignModel.findOne({
      _id: input.customDesignId,
      userId,
      isDeleted: false,
    }).exec();

    if (!design) throw ApiError.notFound('Design not found');

    return {
      refField: 'customDesignId' as const,
      refId: design._id,
      unitPrice: design.pricing.total,
      /* A design may already know whose measurements it was built for. */
      measurementProfileId:
        input.measurementProfileId ?? design.measurementProfileId?.toString(),
    };
  }

  if (!input.productId) throw ApiError.badRequest('A product id is required');

  const product = await productRepository.findById(input.productId);
  if (!product || product.status !== 'active') throw ApiError.notFound('Product not found');

  if (product.trackInventory && product.stock < input.quantity) {
    throw ApiError.badRequest('Not enough stock for that quantity');
  }

  return {
    refField: 'productId' as const,
    refId: product._id,
    unitPrice: product.salePrice ?? product.basePrice,
    measurementProfileId: input.measurementProfileId,
  };
}

export async function addItem(userId: string, input: AddItemInput) {
  const resolved = await resolveItem(userId, input);

  /* Validate ownership up front — never take an id from the client on trust. */
  if (resolved.measurementProfileId) {
    await measurementService.assertOwnedProfile(resolved.measurementProfileId, userId);
  }

  const cart = await cartRepository.getOrCreateForUser(userId);

  /**
   * Line identity is (kind, reference, measurement profile). The same design
   * tailored to two different people is two lines, not quantity 2.
   */
  const existing = cart.items.find(
    (item) =>
      item.kind === input.kind &&
      item[resolved.refField]?.toString() === resolved.refId.toString() &&
      (item.measurementProfileId?.toString() ?? '') === (resolved.measurementProfileId ?? '')
  );

  if (existing) {
    existing.quantity += input.quantity;
    existing.unitPrice = resolved.unitPrice;
  } else {
    cart.items.push({
      _id: new Types.ObjectId(),
      kind: input.kind,
      [resolved.refField]: resolved.refId,
      quantity: input.quantity,
      unitPrice: resolved.unitPrice,
      measurementProfileId: resolved.measurementProfileId
        ? new Types.ObjectId(resolved.measurementProfileId)
        : undefined,
    } as ICartItem);
  }

  await cartRepository.save(cart);
  return withRefs(cart);
}

export async function updateItem(
  userId: string,
  cartItemId: string,
  data: { quantity?: number; measurementProfileId?: string }
) {
  const cart = await cartRepository.getOrCreateForUser(userId);
  const item = cart.items.find((i: ICartItem) => i._id.toString() === cartItemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  if (typeof data.quantity === 'number') item.quantity = data.quantity;

  /* Lets the cart page switch "who is this for" without re-adding the item. */
  if (data.measurementProfileId) {
    await measurementService.assertOwnedProfile(data.measurementProfileId, userId);
    item.measurementProfileId = new Types.ObjectId(data.measurementProfileId);
  }

  await cartRepository.save(cart);
  return withRefs(cart);
}

export async function removeItem(userId: string, cartItemId: string) {
  const cart = await cartRepository.getOrCreateForUser(userId);
  const before = cart.items.length;

  cart.items = cart.items.filter(
    (i: ICartItem) => i._id.toString() !== cartItemId
  ) as typeof cart.items;

  if (cart.items.length === before) throw ApiError.notFound('Cart item not found');

  await cartRepository.save(cart);
  return withRefs(cart);
}

export function clearCart(userId: string) {
  return cartRepository.clearForUser(userId);
}
