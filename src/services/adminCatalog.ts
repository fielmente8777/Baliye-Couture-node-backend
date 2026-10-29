/**
 * Admin panel editing of the create-your-own-design catalogue.
 *
 * Shopify is the source of truth for names, prices, descriptions, colours,
 * visibility, order and images (designCatalogSync pulls it into MongoDB every
 * two minutes). An edit made here that only touched MongoDB would be undone
 * by the next pull, so every Shopify-owned field is WRITTEN THROUGH: Shopify
 * first, then MongoDB, so the panel shows the change at once and a failed
 * Shopify call leaves nothing half-saved.
 *
 * Rules — steps per garment, required/optional, "Cuff only after Full
 * Sleeve", embroidery-by-neck pairing — are not in Shopify and are saved to
 * MongoDB only.
 */

import { Types } from 'mongoose';
import { adminGraphQL, isShopifyConfigured } from '@config/shopify';
import { logger } from '@config/logger';
import { GarmentTypeModel, IGarmentType } from '@models/garmenttype';
import { OptionGroupModel, IOptionGroup } from '@models/optiongroup';
import { OptionModel, IOption } from '@models/option';
import { MeasurementTemplateModel } from '@models/measurementtemplate';
import { ApiError } from '@utils/apiError';
import { DESIGN_OPTION_TYPE, F, fetchEntries } from './designCatalogSync';
import { uploadImageToShopify } from './shopifyFiles';

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Paise here, rupees in Shopify. */
const rupees = (paise: number) => (paise / 100).toFixed(2);

const isHex = (value?: string) => Boolean(value && /^#[0-9a-f]{6}$/i.test(value));

/* ---- Shopify write-through --------------------------------------------- */

const CREATE = `
  mutation($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) { userErrors { field message } }
  }
`;
const UPDATE = `
  mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) { userErrors { field message } }
  }
`;

type UserErrors = { message: string }[];

/**
 * Creates or updates the Design Option entry for `key`. Undefined values are
 * left as they are in Shopify; an empty string clears the field.
 */
async function writeEntry(key: string, values: Record<string, string | undefined>) {
  if (!isShopifyConfigured()) return;

  const fields = Object.entries(values)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([k, value]) => ({ key: k, value }));

  const existing = (await fetchEntries()).find((e) => e.key === key);

  let errors: UserErrors;
  if (existing) {
    if (!fields.length) return;
    const res = await adminGraphQL<{ metaobjectUpdate: { userErrors: UserErrors } }>(UPDATE, {
      id: existing.id,
      metaobject: { fields },
    });
    errors = res.metaobjectUpdate.userErrors;
  } else {
    const res = await adminGraphQL<{ metaobjectCreate: { userErrors: UserErrors } }>(CREATE, {
      metaobject: {
        type: DESIGN_OPTION_TYPE,
        fields: [{ key: F.key, value: key }, ...fields],
        capabilities: { publishable: { status: 'ACTIVE' } },
      },
    });
    errors = res.metaobjectCreate.userErrors;
  }

  if (errors.length) {
    throw ApiError.badRequest(`Shopify rejected "${key}": ${errors.map((e) => e.message).join('; ')}`);
  }
}

/* ---- Read --------------------------------------------------------------- */

/**
 * Everything the Design Builder screen needs in one call, with the images as
 * Shopify has them right now (the preview image only exists there).
 */
export async function getCatalog() {
  const [garments, groups, options, measurementTemplates] = await Promise.all([
    GarmentTypeModel.find({ isDeleted: false }).sort({ position: 1, name: 1 }).lean().exec(),
    OptionGroupModel.find().sort({ position: 1, label: 1 }).lean().exec(),
    OptionModel.find({ isDeleted: false }).sort({ position: 1, label: 1 }).lean().exec(),
    MeasurementTemplateModel.find().sort({ displayOrder: 1, name: 1 }).lean().exec(),
  ]);

  let images: Record<string, string> = {};
  let shopifyError: string | undefined;

  if (isShopifyConfigured()) {
    try {
      const entries = await fetchEntries();
      images = Object.fromEntries(
        entries.filter((e) => e.imageUrl).map((e) => [e.key, e.imageUrl as string])
      );
    } catch (err) {
      logger.error({ err }, 'Could not read design images from Shopify');
      shopifyError = err instanceof Error ? err.message : String(err);
    }
  } else {
    shopifyError = 'Shopify is not configured on the backend';
  }

  /* Fall back to the last synced copy when Shopify can't be reached. */
  if (shopifyError) {
    const codeById = new Map(groups.map((g) => [g._id.toString(), g.code]));
    for (const g of garments) if (g.image) images[`garment/${g.slug}`] = g.image;
    for (const o of options) {
      const code = codeById.get(o.groupId.toString());
      if (code && o.image) images[`option/${code}/${o.value}`] = o.image;
    }
  }

  return { garments, groups, options, measurementTemplates, images, shopifyError };
}

/* ---- Garments ----------------------------------------------------------- */

type GarmentInput = Partial<
  Pick<
    IGarmentType,
    | 'name'
    | 'description'
    | 'family'
    | 'basePrice'
    | 'isDesignable'
    | 'position'
    | 'isActive'
    | 'optionConfigs'
    | 'measurementTemplates'
  >
>;

const garmentShopifyValues = (g: GarmentInput) => ({
  [F.label]: g.name,
  [F.price]: g.basePrice === undefined ? undefined : rupees(g.basePrice),
  [F.description]: g.description,
  [F.active]: g.isActive === undefined ? undefined : String(g.isActive),
  [F.position]: g.position === undefined ? undefined : String(g.position),
});

export async function createGarment(input: GarmentInput & { name: string; basePrice: number }) {
  const slug = slugify(input.name);
  if (!slug) throw ApiError.badRequest('A garment needs a name');

  const clash = await GarmentTypeModel.findOne({ slug }).exec();
  if (clash && !clash.isDeleted) throw ApiError.conflict('A garment with that name already exists');

  await writeEntry(`garment/${slug}`, garmentShopifyValues({ isActive: true, position: 0, ...input }));
  await writeEntry(`preview/${slug}`, {});

  /* A deleted garment keeps its slug (unique index) — bring it back instead. */
  if (clash) {
    return GarmentTypeModel.findByIdAndUpdate(
      clash._id,
      { ...input, isDeleted: false, isActive: input.isActive ?? true },
      { new: true }
    ).exec();
  }
  return GarmentTypeModel.create({ ...input, slug });
}

export async function updateGarment(id: string, input: GarmentInput) {
  const garment = await GarmentTypeModel.findOne({ _id: id, isDeleted: false }).exec();
  if (!garment) throw ApiError.notFound('Garment not found');

  await writeEntry(`garment/${garment.slug}`, garmentShopifyValues(input));

  Object.assign(garment, input);
  return garment.save();
}

export async function deleteGarment(id: string) {
  const garment = await GarmentTypeModel.findOne({ _id: id, isDeleted: false }).exec();
  if (!garment) throw ApiError.notFound('Garment not found');

  /* Hidden in Shopify rather than deleted, so its pictures are kept. */
  await writeEntry(`garment/${garment.slug}`, { [F.active]: 'false' });

  garment.isDeleted = true;
  garment.isActive = false;
  await garment.save();
}

/* ---- Option groups (steps) --------------------------------------------- */

type GroupInput = Partial<Pick<IOptionGroup, 'label' | 'description' | 'inputType' | 'position' | 'isActive'>>;

export async function createGroup(input: GroupInput & { label: string; code?: string }) {
  const code = slugify(input.code || input.label).replace(/-/g, '_');
  if (!code) throw ApiError.badRequest('A step needs a name');
  if (await OptionGroupModel.exists({ code })) throw ApiError.conflict('A step with that code already exists');

  await writeEntry(`group/${code}`, { [F.label]: input.label, [F.description]: input.description });
  return OptionGroupModel.create({ ...input, code });
}

export async function updateGroup(id: string, input: GroupInput) {
  const group = await OptionGroupModel.findById(id).exec();
  if (!group) throw ApiError.notFound('Step not found');

  await writeEntry(`group/${group.code}`, { [F.label]: input.label, [F.description]: input.description });

  Object.assign(group, input);
  return group.save();
}

/* ---- Options ------------------------------------------------------------ */

type OptionInput = Partial<
  Pick<IOption, 'label' | 'description' | 'hex' | 'priceModifier' | 'position' | 'isActive'>
> & { pairsWith?: string[] };

const optionShopifyValues = (o: Omit<OptionInput, 'pairsWith'>) => ({
  [F.label]: o.label,
  [F.price]: o.priceModifier === undefined ? undefined : rupees(o.priceModifier),
  [F.description]: o.description,
  [F.hex]: isHex(o.hex) ? o.hex?.toLowerCase() : undefined,
  [F.active]: o.isActive === undefined ? undefined : String(o.isActive),
  [F.position]: o.position === undefined ? undefined : String(o.position),
});

const toObjectIds = (ids?: string[]) => ids?.map((id) => new Types.ObjectId(id));

export async function createOption(groupId: string, input: OptionInput & { label: string }) {
  const group = await OptionGroupModel.findById(groupId).exec();
  if (!group) throw ApiError.notFound('Step not found');

  const value = slugify(input.label);
  if (!value) throw ApiError.badRequest('An option needs a name');

  const clash = await OptionModel.findOne({ groupId: group._id, value }).exec();
  if (clash && !clash.isDeleted) throw ApiError.conflict('This step already has an option with that name');

  const data = {
    priceModifier: 0,
    isActive: true,
    position: 0,
    ...input,
    pairsWith: toObjectIds(input.pairsWith) ?? [],
  };

  await writeEntry(`option/${group.code}/${value}`, optionShopifyValues(data));

  /* (groupId, value) is unique — a deleted option with this name comes back. */
  if (clash) {
    return OptionModel.findByIdAndUpdate(clash._id, { ...data, isDeleted: false }, { new: true }).exec();
  }
  return OptionModel.create({ ...data, groupId: group._id, value });
}

export async function updateOption(id: string, input: OptionInput) {
  const option = await OptionModel.findOne({ _id: id, isDeleted: false }).exec();
  if (!option) throw ApiError.notFound('Option not found');

  const group = await OptionGroupModel.findById(option.groupId).exec();
  if (!group) throw ApiError.notFound('Step not found');

  await writeEntry(`option/${group.code}/${option.value}`, optionShopifyValues(input));

  const { pairsWith, ...rest } = input;
  Object.assign(option, rest);
  if (pairsWith) option.pairsWith = toObjectIds(pairsWith) as Types.ObjectId[];
  return option.save();
}

export async function deleteOption(id: string) {
  const option = await OptionModel.findOne({ _id: id, isDeleted: false }).exec();
  if (!option) throw ApiError.notFound('Option not found');

  const group = await OptionGroupModel.findById(option.groupId).exec();
  if (group) await writeEntry(`option/${group.code}/${option.value}`, { [F.active]: 'false' });

  option.isDeleted = true;
  option.isActive = false;
  await option.save();

  /* Drop it from every garment's allowed list and default, so no step points at it. */
  await GarmentTypeModel.updateMany(
    { 'optionConfigs.allowedOptions': option._id },
    { $pull: { 'optionConfigs.$[].allowedOptions': option._id } }
  ).exec();
  await GarmentTypeModel.updateMany(
    { 'optionConfigs.defaultOption': option._id },
    { $unset: { 'optionConfigs.$[c].defaultOption': 1 } },
    { arrayFilters: [{ 'c.defaultOption': option._id }] }
  ).exec();
  await OptionModel.updateMany({ pairsWith: option._id }, { $pull: { pairsWith: option._id } }).exec();
}

/* ---- Images ------------------------------------------------------------- */

const IMAGE_KEY = /^(garment|preview)\/[a-z0-9-]+$|^option\/[a-z0-9_]+\/[a-z0-9-]+$/;

/**
 * Uploads a picture into Shopify Files and attaches it to the entry for
 * `key`, so the admin never has to type keys in Shopify. The local copy is
 * updated at once; the storefront reads previews straight from Shopify.
 */
export async function setCatalogImage(key: string, file: { buffer: Buffer; originalname: string; mimetype: string }) {
  if (!isShopifyConfigured()) throw ApiError.badRequest('Shopify is not configured on the backend');
  if (!IMAGE_KEY.test(key)) throw ApiError.badRequest(`"${key}" is not a design image key`);

  const [kind, a, b] = key.split('/');

  /* Resolve the record first, so a bad key fails before anything is uploaded. */
  let garment: InstanceType<typeof GarmentTypeModel> | null = null;
  let option: InstanceType<typeof OptionModel> | null = null;

  if (kind === 'garment' || kind === 'preview') {
    garment = await GarmentTypeModel.findOne({ slug: a, isDeleted: false }).exec();
    if (!garment) throw ApiError.notFound('Garment not found');
  } else {
    const group = await OptionGroupModel.findOne({ code: a }).exec();
    option = group ? await OptionModel.findOne({ groupId: group._id, value: b, isDeleted: false }).exec() : null;
    if (!option) throw ApiError.notFound('Option not found');
  }

  const uploaded = await uploadImageToShopify({
    buffer: file.buffer,
    filename: file.originalname,
    mimeType: file.mimetype,
    alt: garment?.name ?? option?.label,
  });

  await writeEntry(key, { [F.image]: uploaded.id });

  if (kind === 'garment' && garment) {
    garment.image = uploaded.url;
    await garment.save();
  } else if (option) {
    option.image = uploaded.url;
    await option.save();
  }

  return { key, url: uploaded.url };
}
