import { Types } from 'mongoose';
import { ApiError } from '../utils/apiError';
import * as cartRepository from '../repositories/cart.repository';
import * as suitDesignRepository from '../repositories/suitDesign.repository';
import { ICartItem } from '../models/cart';

export async function getCart(userId: string) {
  return cartRepository.getOrCreateForUser(userId).then((cart:any) => cart.populate('items.suitDesignId'));
}

export async function addItem(userId: string, suitDesignId: string, quantity: number) {
  const design = await suitDesignRepository.findByIdForUser(suitDesignId, userId);
  if (!design) throw ApiError.notFound('Suit design not found');

  const cart = await cartRepository.getOrCreateForUser(userId);

  const existingItem = cart.items.find((item) => item.suitDesignId.toString() === suitDesignId);
  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.unitPrice = design.totalPrice;
  } else {
    cart.items.push({
      _id: new Types.ObjectId(),
      suitDesignId: design._id,
      quantity,
      unitPrice: design.totalPrice,
    });
  }

  await cartRepository.save(cart);
  return cart.populate('items.suitDesignId');
}

export async function updateItemQuantity(userId: string, cartItemId: string, quantity: number) {
  const cart = await cartRepository.getOrCreateForUser(userId);
  const item = cart.items.find((i:any) => i._id.toString() === cartItemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  item.quantity = quantity;
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
