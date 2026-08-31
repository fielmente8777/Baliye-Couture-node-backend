import { Types } from 'mongoose';
import { ApiError } from '../utils/apiError';
import * as cartRepository from '../repositories/cart.repository';
import * as suitDesignRepository from '../repositories/suitDesign.repository';
import * as measurementService from './measurement';
import { ICartItem } from '../models/cart';

export async function getCart(userId: string) {
  return cartRepository.getOrCreateForUser(userId).then((cart:any) => cart.populate('items.suitDesignId'));
}

export async function addItem(
  userId: string,
  suitDesignId: string,
  quantity: number,
  measurementProfileId?: string
) {
  const design = await suitDesignRepository.findByIdForUser(suitDesignId, userId);
  if (!design) throw ApiError.notFound('Suit design not found');

  /* Validate ownership up front — never take an id from the client on trust. */
  if (measurementProfileId) {
    await measurementService.assertOwnedProfile(measurementProfileId, userId);
  }

  const cart = await cartRepository.getOrCreateForUser(userId);

  /**
   * Two of the same design tailored to different people are different line
   * items, so the profile is part of the identity, not just the design id.
   */
  const existingItem = cart.items.find(
    (item) =>
      item.suitDesignId.toString() === suitDesignId &&
      (item.measurementProfileId?.toString() ?? '') === (measurementProfileId ?? '')
  );

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.unitPrice = design.totalPrice;
  } else {
    cart.items.push({
      _id: new Types.ObjectId(),
      suitDesignId: design._id,
      quantity,
      unitPrice: design.totalPrice,
      measurementProfileId: measurementProfileId
        ? new Types.ObjectId(measurementProfileId)
        : undefined,
    });
  }

  await cartRepository.save(cart);
  return cart.populate('items.suitDesignId');
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
  return cart.populate('items.suitDesignId');
}

export async function removeItem(userId: string, cartItemId: string) {
  const cart = await cartRepository.getOrCreateForUser(userId);
  const before = cart.items.length;
  cart.items = cart.items.filter((i: ICartItem) => i._id.toString() !== cartItemId) as typeof cart.items;
  if (cart.items.length === before) throw ApiError.notFound('Cart item not found');

  await cartRepository.save(cart);
  return cart.populate('items.suitDesignId');
}

export function clearCart(userId: string) {
  return cartRepository.clearForUser(userId);
}
