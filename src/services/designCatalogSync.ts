/**
 * Create-your-own-design catalogue, edited in Shopify.
 *
 * The product team manages names, prices, descriptions, swatch colours,
 * images, visibility and order in Shopify admin (Content → Metaobjects →
 * "Design Option", type `design_image`). This backend keeps a synced copy in
 * MongoDB, because saved designs, carts, orders and the render pipeline all
 * reference these records by ObjectId — and because price is computed here,
 * never trusted from the client.
 *
 * Each Shopify entry is matched by its `key`:
 *
 *   garment/<slug>                  GarmentType  (price = base price)
 *   group/<code>                    OptionGroup  (step title)
 *   option/<group code>/<value>     Option       (price = price modifier)
 *   preview/<slug>                  read by the frontend only
 *
 * Steps per garment, required/optional, "Cuff only after Full Sleeve",
 * embroidery-by-neck pairing and render settings stay here — they are rules,
 * not catalogue data.
 *
 * Prices are rupees in Shopify and paise here.
 */

import { adminGraphQL, isShopifyConfigured } from '@config/shopify';
import { logger } from '@config/logger';
import { GarmentTypeModel } from '@models/garmenttype';
import { OptionModel } from '@models/option';
import { OptionGroupModel } from '@models/optiongroup';

export const DESIGN_OPTION_TYPE = 'design_image';

/** Field keys on the Shopify definition. */
const F = {
  key: 'key',
  image: 'image',
  label: 'label',
  price: 'price',
  description: 'description',
  hex: 'hex',
  active: 'active',
  position: 'position',
} as const;

interface ShopifyEntry {
  id: string;
  key: string;
  values: Map<string, string>;
  imageUrl?: string;
}

interface MetaobjectsPage {
  metaobjects: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      fields: {
        key: string;
        value: string | null;
        reference: { image?: { url: string } | null } | null;
      }[];
    }[];
  };
}

const ENTRIES_QUERY = `
  query DesignOptions($type: String!, $after: String) {
    metaobjects(type: $type, first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        fields {
          key
          value
          reference { ... on MediaImage { image { url } } }
        }
      }
    }
  }
`;

async function fetchEntries(): Promise<ShopifyEntry[]> {
  const entries: ShopifyEntry[] = [];
  let after: string | null = null;

  do {
    const page: MetaobjectsPage = await adminGraphQL<MetaobjectsPage>(ENTRIES_QUERY, {
      type: DESIGN_OPTION_TYPE,
      after,
    });

    for (const node of page.metaobjects.nodes) {
      const values = new Map<string, string>();
      let imageUrl: string | undefined;

      for (const field of node.fields) {
        if (field.key === F.image) imageUrl = field.reference?.image?.url ?? undefined;
        else if (field.value !== null && field.value.trim() !== '') values.set(field.key, field.value.trim());
      }

      const key = values.get(F.key)?.toLowerCase();
      if (key) entries.push({ id: node.id, key, values, imageUrl });
    }

    after = page.metaobjects.pageInfo.hasNextPage ? page.metaobjects.pageInfo.endCursor : null;
  } while (after);

  return entries;
}

/* ---- Shopify value parsing --------------------------------------------- */

const toPaise = (rupees: string | undefined) => {
  if (rupees === undefined) return undefined;
  const n = Number(rupees);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

const toInt = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
};

const toBool = (value: string | undefined) =>
  value === undefined ? undefined : value === 'true';

/** Drops undefined so a blank Shopify field never wipes a backend value. */
const defined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

/* ---- Pull: Shopify → MongoDB ------------------------------------------- */

export interface PullSummary {
  garments: number;
  groups: number;
  optionsUpdated: number;
  optionsCreated: number;
  skipped: string[];
}

export async function pullDesignCatalog(): Promise<PullSummary> {
  const entries = await fetchEntries();
  const summary: PullSummary = { garments: 0, groups: 0, optionsUpdated: 0, optionsCreated: 0, skipped: [] };

  const groups = await OptionGroupModel.find().exec();
  const groupByCode = new Map(groups.map((g) => [g.code, g]));

  for (const entry of entries) {
    const [kind, a, b] = entry.key.split('/');
    const v = (k: string) => entry.values.get(k);

    if (kind === 'garment' && a) {
      /* Images are owned by Shopify outright: removing one there removes it here. */
      const res = await GarmentTypeModel.updateOne(
        { slug: a, isDeleted: false },
        {
          $set: defined({
            name: v(F.label),
            basePrice: toPaise(v(F.price)),
            description: v(F.description),
            isActive: toBool(v(F.active)),
            position: toInt(v(F.position)),
            ...(entry.imageUrl ? { image: entry.imageUrl } : {}),
          }),
          ...(entry.imageUrl ? {} : { $unset: { image: 1 } }),
        }
      ).exec();
      /* A new garment needs its steps configured here first — not created from Shopify. */
      if (res.matchedCount) summary.garments += 1;
      else summary.skipped.push(entry.key);
      continue;
    }

    if (kind === 'group' && a) {
      const res = await OptionGroupModel.updateOne(
        { code: a },
        { $set: defined({ label: v(F.label), description: v(F.description) }) }
      ).exec();
      if (res.matchedCount) summary.groups += 1;
      else summary.skipped.push(entry.key);
      continue;
    }

    if (kind === 'option' && a && b) {
      const group = groupByCode.get(a);
      if (!group) {
        summary.skipped.push(entry.key);
        continue;
      }

      const fields = defined({
        label: v(F.label),
        priceModifier: toPaise(v(F.price)),
        description: v(F.description),
        hex: v(F.hex),
        isActive: toBool(v(F.active)),
        position: toInt(v(F.position)),
      });

      const existing = await OptionModel.findOne({ groupId: group._id, value: b }).exec();

      if (existing?.isDeleted) {
        /* Deleted here on purpose — Shopify hides things with `active`, it
           doesn't resurrect them. */
        summary.skipped.push(entry.key);
      } else if (existing) {
        await OptionModel.updateOne(
          { _id: existing._id },
          {
            $set: { ...fields, ...(entry.imageUrl ? { image: entry.imageUrl } : {}) },
            ...(entry.imageUrl ? {} : { $unset: { image: 1 } }),
          }
        ).exec();
        summary.optionsUpdated += 1;
      } else if (fields.label) {
        /* New in Shopify → new option. Garments with no allowedOptions list for
           this step offer it straight away. An entry with no label is a
           placeholder and is ignored. */
        await OptionModel.create({
          groupId: group._id,
          value: b,
          priceModifier: 0,
          isActive: true,
          ...fields,
          ...(entry.imageUrl ? { image: entry.imageUrl } : {}),
        });
        summary.optionsCreated += 1;
      } else {
        summary.skipped.push(entry.key);
      }
    }
  }

  return summary;
}

/* ---- Automatic refresh -------------------------------------------------- */

const REFRESH_EVERY_MS = 2 * 60 * 1000;
let lastPullAt = 0;
let pulling: Promise<unknown> | null = null;

/**
 * Called on every catalogue request; pulls in the background at most every
 * two minutes. The request never waits on Shopify — it is served from MongoDB
 * as it stands, and the next one sees the update.
 */
export function refreshDesignCatalogIfStale(): void {
  if (!isShopifyConfigured() || pulling || Date.now() - lastPullAt < REFRESH_EVERY_MS) return;

  lastPullAt = Date.now();
  pulling = pullDesignCatalog()
    .then((s) => {
      if (s.optionsCreated || s.skipped.length) logger.info(s, 'Design catalogue pulled from Shopify');
    })
    .catch((err) => logger.error({ err }, 'Design catalogue pull from Shopify failed'))
    .finally(() => {
      pulling = null;
    });
}

/* ---- Push: MongoDB → Shopify (one-time fill) ---------------------------- */

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
const DELETE = `
  mutation($id: ID!) { metaobjectDelete(id: $id) { userErrors { message } } }
`;

const rupees = (paise: number) => (paise / 100).toFixed(2);

/**
 * Writes the current backend values into Shopify so editing starts from the
 * truth. Creates missing entries, fills label/price/description/colour/
 * active/position on existing ones (images are left alone), and removes
 * empty placeholder entries that match nothing here.
 */
export async function pushDesignCatalog() {
  const entries = await fetchEntries();
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const wanted = new Map<string, Record<string, string>>();

  for (const g of await GarmentTypeModel.find({ isDeleted: false }).exec()) {
    wanted.set(`garment/${g.slug}`, defined({
      [F.label]: g.name,
      [F.price]: rupees(g.basePrice),
      [F.description]: g.description,
      [F.active]: String(g.isActive),
      [F.position]: String(g.position ?? 0),
    }) as Record<string, string>);
    wanted.set(`preview/${g.slug}`, {});
  }

  const groups = await OptionGroupModel.find().exec();
  const codeById = new Map(groups.map((g) => [g._id.toString(), g.code]));

  for (const g of groups) {
    wanted.set(`group/${g.code}`, defined({ [F.label]: g.label, [F.description]: g.description }) as Record<string, string>);
  }

  for (const o of await OptionModel.find({ isDeleted: false }).exec()) {
    const code = codeById.get(o.groupId.toString());
    if (!code) continue;
    wanted.set(`option/${code}/${o.value}`, defined({
      [F.label]: o.label,
      [F.price]: rupees(o.priceModifier ?? 0),
      [F.description]: o.description,
      [F.hex]: o.hex && /^#[0-9a-f]{6}$/i.test(o.hex) ? o.hex.toLowerCase() : undefined,
      [F.active]: String(o.isActive),
      [F.position]: String(o.position ?? 0),
    }) as Record<string, string>);
  }

  const result = { created: 0, updated: 0, removed: 0, errors: [] as string[] };
  const check = (key: string, errors: { message: string }[]) => {
    if (errors.length) result.errors.push(`${key}: ${errors.map((e) => e.message).join('; ')}`);
    return errors.length === 0;
  };

  for (const [key, values] of wanted) {
    const fields = [
      ...Object.entries(values).map(([k, value]) => ({ key: k, value })),
    ];
    const existing = byKey.get(key);

    if (existing) {
      if (fields.length === 0) continue;
      const res = await adminGraphQL<{ metaobjectUpdate: { userErrors: { message: string }[] } }>(UPDATE, {
        id: existing.id,
        metaobject: { fields },
      });
      if (check(key, res.metaobjectUpdate.userErrors)) result.updated += 1;
    } else {
      const res = await adminGraphQL<{ metaobjectCreate: { userErrors: { message: string }[] } }>(CREATE, {
        metaobject: {
          type: DESIGN_OPTION_TYPE,
          fields: [{ key: F.key, value: key }, ...fields],
          capabilities: { publishable: { status: 'ACTIVE' } },
        },
      });
      if (check(key, res.metaobjectCreate.userErrors)) result.created += 1;
    }
  }

  /* Placeholders from the first seed that match nothing and hold no image. */
  for (const entry of entries) {
    if (wanted.has(entry.key) || entry.imageUrl) continue;
    const res = await adminGraphQL<{ metaobjectDelete: { userErrors: { message: string }[] } }>(DELETE, { id: entry.id });
    if (check(entry.key, res.metaobjectDelete.userErrors)) result.removed += 1;
  }

  return result;
}
