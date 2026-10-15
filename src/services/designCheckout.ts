import { adminGraphQL } from '@config/shopify';
import { logger } from '@config/logger';
import * as cartRepository from '@repositories/cart.repository';
import * as userRepository from '@repositories/user.repository';
import { CustomDesignModel } from '@models/customdesign';
import { GarmentTypeModel } from '@models/garmenttype';
import { IMeasurementProfile } from '@models/measurementprofile';
import { ApiError } from '@utils/apiError';
import * as addressService from './address';
import * as measurementService from './measurement';
import { requiresMeasurements } from './order';
import { buildInput as toShopifyAddress } from './shopifyAddress';

/**
 * Custom designs are paid for and ordered through Shopify.
 *
 * A design has no Shopify product (its price comes from the chosen options),
 * so the cart's designs become a Shopify DRAFT ORDER: one custom line per
 * design, priced by this server, with the design's options, measurements and
 * instructions on the line. The customer pays on the draft's invoice page —
 * Shopify's own checkout — and Shopify turns it into a normal order, which
 * then shows in My Orders with the other Shopify orders.
 *
 * The draft is reused while the customer is still checking out, and the
 * designs leave the cart once Shopify reports it paid (settleDesignCheckout).
 */

const CURRENCY = 'INR';

/** Minor units (paise) -> Shopify's decimal string. */
const toAmount = (minor: number) => (minor / 100).toFixed(2);

interface DraftOrderResult {
  draftOrder: { id: string; invoiceUrl: string } | null;
  userErrors: { field?: string[]; message: string }[];
}

const DRAFT_FIELDS = `draftOrder { id invoiceUrl } userErrors { field message }`;

const CREATE_DRAFT = `
  mutation($input: DraftOrderInput!) { draftOrderCreate(input: $input) { ${DRAFT_FIELDS} } }
`;

const UPDATE_DRAFT = `
  mutation($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { ${DRAFT_FIELDS} } }
`;

const DRAFT_STATUS = `
  query($id: ID!) { draftOrder(id: $id) { status } }
`;

type DraftStatus = 'OPEN' | 'INVOICE_SENT' | 'COMPLETED';

async function draftStatus(id: string): Promise<DraftStatus | null> {
  const data = await adminGraphQL<{ draftOrder: { status: DraftStatus } | null }>(DRAFT_STATUS, { id });
  return data.draftOrder?.status ?? null;
}

/**
 * The Shopify customer to attach the draft to, or undefined.
 *
 * The id saved on our user can go stale (customer deleted, or created on a
 * test store) and Shopify then rejects the whole draft as "Customer not
 * found". So it is checked first, then the customer is looked up by email;
 * failing both, the draft carries only the email, and Shopify links or
 * creates the customer itself at checkout.
 */
async function resolveShopifyCustomer(savedId?: string, email?: string): Promise<string | undefined> {
  try {
    if (savedId) {
      const byId = await adminGraphQL<{ customer: { id: string } | null }>(
        `query($id: ID!) { customer(id: $id) { id } }`,
        { id: savedId },
      );
      if (byId.customer) return byId.customer.id;
    }
    if (email) {
      const byEmail = await adminGraphQL<{ customers: { nodes: { id: string }[] } }>(
        `query($q: String!) { customers(first: 1, query: $q) { nodes { id } } }`,
        { q: `email:"${email.replace(/"/g, '')}"` },
      );
      return byEmail.customers.nodes[0]?.id;
    }
  } catch (err) {
    logger.warn({ err }, 'Could not resolve the Shopify customer for checkout');
  }
  return undefined;
}

const formatMeasurements = (profile: IMeasurementProfile) =>
  profile.values.map((v) => `${v.name} ${v.value}${v.unit ? ` ${v.unit}` : ''}`).join(', ');

/**
 * Creates (or refreshes) the Shopify draft order for the cart's designs and
 * returns the URL to pay at.
 */
export async function startDesignCheckout(userId: string, shippingAddressId: string) {
  const cart = await cartRepository.findByUser(userId);
  const designs = (cart?.items ?? []).filter((item) => item.kind === 'design' && item.customDesignId);
  if (!cart || designs.length === 0) throw ApiError.badRequest('There are no custom designs in your cart');

  const [user, address, defaultProfile] = await Promise.all([
    userRepository.findById(userId),
    addressService.getAddressById(shippingAddressId, userId),
    measurementService.getDefaultProfile(userId),
  ]);

  const lineItems = [];
  for (const item of designs) {
    const design = await CustomDesignModel.findById(item.customDesignId).exec();
    if (!design) throw ApiError.badRequest('A design in your cart no longer exists — please remove it');

    /* Same rule as before: made-to-measure needs a body profile; a design
       cut to a standard size does not. */
    let profile: IMeasurementProfile | null = null;
    if (await requiresMeasurements(item)) {
      const profileId = item.measurementProfileId?.toString() ?? design.measurementProfileId?.toString();
      profile = profileId ? await measurementService.assertOwnedProfile(profileId, userId) : defaultProfile;
      if (!profile || profile.values.length === 0) {
        throw ApiError.badRequest('Please add your body measurements before placing this order');
      }
    }

    const garmentType = await GarmentTypeModel.findById(design.garmentTypeId).select('name').lean().exec();
    const title = [design.name || 'Custom Design', garmentType?.name].filter(Boolean).join(' — ');

    /* Shown on the order in Shopify admin and on the customer's receipt —
       everything the workshop needs to make it. */
    const customAttributes = [
      ...design.selections.map((s) => ({ key: s.groupLabel, value: s.optionLabel })),
      profile
        ? { key: 'Measurements', value: `${profile.profileName}: ${formatMeasurements(profile)}` }
        : { key: 'Fit', value: 'Standard size' },
      ...(design.instructions ? [{ key: 'Instructions', value: design.instructions }] : []),
      { key: 'Design ID', value: design._id.toString() },
    ];

    lineItems.push({
      title,
      quantity: item.quantity,
      /* The price this server computed when the design was added — never
         a figure from the browser. */
      originalUnitPriceWithCurrency: { amount: toAmount(item.unitPrice), currencyCode: CURRENCY },
      requiresShipping: true,
      taxable: true,
      customAttributes,
    });
  }

  const customerId = await resolveShopifyCustomer(user?.shopifyCustomerId, user?.email);

  const input = {
    lineItems,
    ...(user?.email ? { email: user.email } : {}),
    shippingAddress: toShopifyAddress(address),
    ...(customerId ? { purchasingEntity: { customerId } } : {}),
    tags: ['custom-design'],
    note: 'Custom design order from baliyacotour — made to order.',
    customAttributes: [{ key: 'Baliye user', value: userId }],
  };

  /* Reuse the open draft so clicking "Place order" twice doesn't leave two
     drafts in Shopify. A paid one is settled first and a new one started. */
  let draftId = cart.shopifyDraftOrderId;
  if (draftId) {
    const status = await draftStatus(draftId).catch(() => null);
    if (status !== 'OPEN' && status !== 'INVOICE_SENT') draftId = undefined;
  }

  const result = draftId
    ? (await adminGraphQL<{ draftOrderUpdate: DraftOrderResult }>(UPDATE_DRAFT, { id: draftId, input })).draftOrderUpdate
    : (await adminGraphQL<{ draftOrderCreate: DraftOrderResult }>(CREATE_DRAFT, { input })).draftOrderCreate;

  if (!result.draftOrder) {
    logger.error({ userErrors: result.userErrors }, 'Shopify draft order failed');
    /* Shopify's own wording ("Record is invalid") means nothing to a shopper. */
    throw ApiError.badRequest('We could not start checkout. Please check your address and try again.');
  }

  cart.shopifyDraftOrderId = result.draftOrder.id;
  await cart.save();

  return { checkoutUrl: result.draftOrder.invoiceUrl };
}

/**
 * Once the draft is paid (Shopify marks it COMPLETED and creates the order),
 * its designs leave the cart. Called whenever the cart is read; best effort —
 * a Shopify hiccup must never break the cart page.
 */
export async function settleDesignCheckout<T extends { shopifyDraftOrderId?: string; items: { kind: string }[]; save(): Promise<unknown> }>(
  cart: T,
): Promise<T> {
  if (!cart.shopifyDraftOrderId) return cart;
  try {
    if ((await draftStatus(cart.shopifyDraftOrderId)) === 'COMPLETED') {
      cart.items = cart.items.filter((item) => item.kind !== 'design') as T['items'];
      cart.shopifyDraftOrderId = undefined;
      await cart.save();
    }
  } catch (err) {
    logger.warn({ err, draftOrderId: cart.shopifyDraftOrderId }, 'Could not check the Shopify draft order');
  }
  return cart;
}
