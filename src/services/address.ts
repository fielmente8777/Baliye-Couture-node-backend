import * as addressRepository from '@repositories/address.repository';
import { ApiError } from '@utils/apiError';
import { IAddress } from '@models/address';

/** More than this is almost certainly a mistake, not a use case. */
const MAX_ADDRESSES_PER_USER = 25;

export function getAddresses(userId: string) {
  return addressRepository.findAllByUser(userId);
}

/** The address an order falls back to when the client picks none. */
export async function getDefaultAddress(userId: string) {
  const addresses = await addressRepository.findAllByUser(userId);
  return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

export async function getAddressById(id: string, userId: string) {
  const address = await addressRepository.findByIdForUser(id, userId);
  if (!address) throw ApiError.notFound('Address not found');
  return address;
}

export async function createAddress(userId: string, data: Partial<IAddress>) {
  const count = await addressRepository.countByUser(userId);
  if (count >= MAX_ADDRESSES_PER_USER) {
    throw ApiError.badRequest(`You can save at most ${MAX_ADDRESSES_PER_USER} addresses`);
  }

  /** The first address a user saves becomes their default automatically. */
  const isDefault = data.isDefault ?? count === 0;

  const address = await addressRepository.create({
    ...data,
    userId: userId as never,
    isDefault,
  });

  if (isDefault) {
    await addressRepository.clearDefaultForUser(userId, address._id.toString());
  }

  return address;
}

export async function updateAddress(id: string, userId: string, data: Partial<IAddress>) {
  const address = await addressRepository.updateByIdForUser(id, userId, data);
  if (!address) throw ApiError.notFound('Address not found');

  if (data.isDefault) {
    await addressRepository.clearDefaultForUser(userId, id);
  }

  return address;
}

export async function deleteAddress(id: string, userId: string) {
  const address = await addressRepository.softDeleteForUser(id, userId);
  if (!address) throw ApiError.notFound('Address not found');

  /** Never leave a user with addresses but no default. */
  if (address.isDefault) {
    const remaining = await addressRepository.findAllByUser(userId);
    if (remaining[0]) {
      await addressRepository.updateByIdForUser(remaining[0]._id.toString(), userId, {
        isDefault: true,
      });
    }
  }

  return address;
}

/** Flattens an address into the single line the order snapshot stores. */
export function formatAddress(address: IAddress) {
  return [
    address.fullName,
    address.street,
    address.landmark,
    `${address.city}, ${address.state} ${address.pincode}`,
    address.country,
    address.phone,
  ]
    .filter(Boolean)
    .join('\n');
}
