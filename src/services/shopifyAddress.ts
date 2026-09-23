import { adminGraphQL, isShopifyConfigured } from '@config/shopify';
import { logger } from '@config/logger';
import { IUser } from '@models/user';
import { IAddress } from '@models/address';
import * as addressRepository from '@repositories/address.repository';

/**
 * Mirrors saved addresses onto the matching Shopify customer.
 *
 * Shopify's own checkout only offers an address if it lives on the Shopify
 * customer record, so a delivery address saved purely in our DB would be
 * invisible there. As with shopifyCustomer.ts, every function here is BEST
 * EFFORT: a Shopify outage or an unlinked customer must never stop someone
 * saving an address in our app.
 */

interface AddressPayload {
  customerAddressCreate?: {
    address?: { id: string };
    userErrors: { field: string[]; message: string }[];
  };
  customerAddressUpdate?: {
    address?: { id: string };
    userErrors: { field: string[]; message: string }[];
  };
  customerAddressDelete?: {
    deletedAddressId?: string;
    userErrors: { field: string[]; message: string }[];
  };
}

const CREATE = `
  mutation createAddress($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
    customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
      address { id }
      userErrors { field message }
    }
  }
`;

const UPDATE = `
  mutation updateAddress($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
    customerAddressUpdate(customerId: $customerId, addressId: $addressId, address: $address, setAsDefault: $setAsDefault) {
      address { id }
      userErrors { field message }
    }
  }
`;

const DELETE = `
  mutation deleteAddress($customerId: ID!, $addressId: ID!) {
    customerAddressDelete(customerId: $customerId, addressId: $addressId) {
      deletedAddressId
      userErrors { field message }
    }
  }
`;

/** Splits our single fullName into the first/last name Shopify's input wants. */
function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: undefined, lastName: undefined };
  if (parts.length === 1) return { firstName: parts[0], lastName: undefined };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function buildInput(address: IAddress) {
  const { firstName, lastName } = splitName(address.fullName);

  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    address1: address.street,
    ...(address.landmark ? { address2: address.landmark } : {}),
    city: address.city,
    province: address.state,
    zip: address.pincode,
    country: address.country || 'India',
    /* E.164 dropped if malformed, same rule as the customer sync — Shopify
       rejects the whole mutation on an invalid phone. */
    ...(address.phone && /^\+[1-9]\d{7,14}$/.test(address.phone)
      ? { phone: address.phone }
      : {}),
  };
}

/**
 * Pushes a newly saved address to Shopify and records the returned id so
 * later edits target the same Shopify address instead of creating a
 * duplicate.
 */
export async function pushAddressCreate(user: IUser, address: IAddress): Promise<void> {
  if (!isShopifyConfigured() || !user.shopifyCustomerId) return;

  try {
    const result = await adminGraphQL<AddressPayload>(CREATE, {
      customerId: user.shopifyCustomerId,
      address: buildInput(address),
      setAsDefault: address.isDefault,
    });

    const errors = result.customerAddressCreate?.userErrors ?? [];
    if (errors.length) {
      logger.warn({ errors, addressId: address._id.toString() }, 'Shopify customerAddressCreate rejected');
      return;
    }

    const shopifyAddressId = result.customerAddressCreate?.address?.id;
    if (shopifyAddressId) {
      await addressRepository.updateByIdForUser(address._id.toString(), user._id.toString(), {
        shopifyAddressId,
      });
    }
  } catch (error) {
    logger.error({ err: error, addressId: address._id.toString() }, 'Shopify address create failed');
  }
}

/**
 * Pushes an edit to Shopify. Falls back to creating the address there if it
 * was never mirrored — e.g. it predates the customer being linked to Shopify.
 */
export async function pushAddressUpdate(user: IUser, address: IAddress): Promise<void> {
  if (!isShopifyConfigured() || !user.shopifyCustomerId) return;

  if (!address.shopifyAddressId) {
    await pushAddressCreate(user, address);
    return;
  }

  try {
    const result = await adminGraphQL<AddressPayload>(UPDATE, {
      customerId: user.shopifyCustomerId,
      addressId: address.shopifyAddressId,
      address: buildInput(address),
      setAsDefault: address.isDefault,
    });

    const errors = result.customerAddressUpdate?.userErrors ?? [];
    if (errors.length) {
      logger.warn({ errors, addressId: address._id.toString() }, 'Shopify customerAddressUpdate rejected');
    }
  } catch (error) {
    logger.error({ err: error, addressId: address._id.toString() }, 'Shopify address update failed');
  }
}

/** Removes the mirrored address from Shopify when it is deleted here. */
export async function pushAddressDelete(user: IUser, address: IAddress): Promise<void> {
  if (!isShopifyConfigured() || !user.shopifyCustomerId || !address.shopifyAddressId) return;

  try {
    const result = await adminGraphQL<AddressPayload>(DELETE, {
      customerId: user.shopifyCustomerId,
      addressId: address.shopifyAddressId,
    });

    const errors = result.customerAddressDelete?.userErrors ?? [];
    if (errors.length) {
      logger.warn({ errors, addressId: address._id.toString() }, 'Shopify customerAddressDelete rejected');
    }
  } catch (error) {
    logger.error({ err: error, addressId: address._id.toString() }, 'Shopify address delete failed');
  }
}

/** Fire-and-forget wrappers — address CRUD should not wait on Shopify. */
export function pushAddressCreateInBackground(user: IUser, address: IAddress): void {
  void pushAddressCreate(user, address).catch(() => undefined);
}

export function pushAddressUpdateInBackground(user: IUser, address: IAddress): void {
  void pushAddressUpdate(user, address).catch(() => undefined);
}

export function pushAddressDeleteInBackground(user: IUser, address: IAddress): void {
  void pushAddressDelete(user, address).catch(() => undefined);
}
