import { CartModel, ICart } from '@models/cart';

export function findByUser(userId: string) {
  return CartModel.findOne({ userId }).exec();
}

export async function getOrCreateForUser(userId: string): Promise<ICart> {
  const existing = await CartModel.findOne({ userId }).exec();
  if (existing) return existing;
  return CartModel.create({ userId, items: [] });
}

export function save(cart: ICart) {
  return cart.save();
}

export function clearForUser(userId: string) {
  return CartModel.findOneAndUpdate({ userId }, { items: [] }, { new: true, upsert: true }).exec();
}

