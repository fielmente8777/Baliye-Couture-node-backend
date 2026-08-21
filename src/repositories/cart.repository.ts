import { CartModel, ICart } from '@models/cart';

class CartRepository {
  findByUser(userId: string) {
    return CartModel.findOne({ userId }).exec();
  }

  async getOrCreateForUser(userId: string): Promise<ICart> {
    const existing = await CartModel.findOne({ userId }).exec();
    if (existing) return existing;
    return CartModel.create({ userId, items: [] });
  }

  save(cart: ICart) {
    return cart.save();
  }

  clearForUser(userId: string) {
    return CartModel.findOneAndUpdate({ userId }, { items: [] }, { new: true, upsert: true }).exec();
  }
}

export const cartRepository = new CartRepository();
