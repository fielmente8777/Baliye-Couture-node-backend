import 'tsconfig-paths/register';
import { Types } from 'mongoose';

import { connectDB, disconnectDB } from '@config/db';
import { logger } from '@config/logger';
import { OptionGroupModel } from '@models/optiongroup';
import { OptionModel } from '@models/option';
import { GarmentTypeModel } from '@models/garmenttype';
import { MeasurementTemplateModel } from '@models/measurementtemplate';

/**
 * Seeds the Indian womenswear catalog: option groups, their options, and three
 * garment types wired up.
 *
 * Idempotent — every write is an upsert keyed on the natural key (group code,
 * group+option value, garment slug), so running it repeatedly is safe and it
 * can be used to add new options to an existing database.
 *
 * Prices are in RUPEES here for readability and multiplied to paise on write:
 * the models store integer minor units, because floats and money do not mix.
 */

const toPaise = (rupees: number) => Math.round(rupees * 100);

const GROUPS = [
  { code: 'fabric', label: 'Fabric', inputType: 'single_select', position: 1 },
  { code: 'color', label: 'Colour', inputType: 'color_select', position: 2 },
  { code: 'embroidery', label: 'Embroidery', inputType: 'single_select', position: 3 },
  { code: 'neck', label: 'Neck Type', inputType: 'single_select', position: 4 },
  { code: 'sleeve', label: 'Sleeve Type', inputType: 'single_select', position: 5 },
  { code: 'sleeve_cuff', label: 'Sleeve Cuff', inputType: 'single_select', position: 6 },
  { code: 'lower', label: 'Lower', inputType: 'single_select', position: 7 },
  { code: 'dupatta', label: 'Dupatta', inputType: 'single_select', position: 8 },
  { code: 'length', label: 'Length', inputType: 'single_select', position: 9 },
  { code: 'size', label: 'Size', inputType: 'size_select', position: 10 },
] as const;

/** [label, priceModifier in rupees, optional hex for colour swatches] */
const OPTIONS: Record<string, Array<[string, number, string?]>> = {
  fabric: [
    ['Cotton', 0],
    ['Cotton Silk', 200],
    ['Rayon', 100],
    ['Chanderi', 300],
    ['Georgette', 250],
    ['Crepe', 200],
    ['Chiffon', 250],
    ['Organza', 400],
    ['Net', 300],
    ['Linen', 350],
    ['Velvet', 600],
    ['Premium Silk', 500],
  ],
  color: [
    ['Red', 0, '#B3202C'],
    ['Wine', 0, '#722F37'],
    ['Maroon', 0, '#800000'],
    ['Bottle Green', 0, '#0B5345'],
    ['Navy Blue', 0, '#1B2B5B'],
    ['Black', 0, '#111111'],
    ['White', 0, '#FFFFFF'],
    ['Cream', 0, '#F5EFE0'],
    ['Beige', 0, '#D9C9A8'],
    ['Peach', 0, '#FFCBA4'],
    ['Pink', 0, '#E8A0BF'],
    ['Mustard', 0, '#D4A017'],
    ['Purple', 0, '#6B3FA0'],
  ],
  embroidery: [
    ['No Embroidery', 0],
    ['Thread Work', 300],
    ['Zari Work', 700],
    ['Sequin Work', 600],
    ['Mirror Work', 650],
    ['Aari Work', 900],
    ['Machine Embroidery', 400],
    ['Hand Embroidery', 1500],
    ['Heavy Embroidery', 1200],
  ],
  neck: [
    ['Round Neck', 0],
    ['V-Neck', 0],
    ['Boat Neck', 100],
    ['Square Neck', 100],
    ['Sweetheart Neck', 200],
    ['Keyhole Neck', 150],
    ['Collar Neck', 150],
    ['High Neck', 150],
    ['Mandarin Neck', 150],
    ['Deep V-Neck', 200],
  ],
  sleeve: [
    ['Sleeveless', 0],
    ['Short Sleeve', 0],
    ['Half Sleeve', 0],
    ['3/4 Sleeve', 100],
    ['Full Sleeve', 200],
    ['Bell Sleeve', 350],
    ['Puff Sleeve', 300],
    ['Flared Sleeve', 350],
  ],
  /* Only shown when Full Sleeve is chosen — see the dependency below. */
  sleeve_cuff: [
    ['Plain Cuff', 0],
    ['Buttoned Cuff', 150],
    ['Embroidered Cuff', 400],
  ],
  lower: [
    ['Patiala', 0],
    ['Salwar', 0],
    ['Churidar', 100],
    ['Straight Pant', 100],
    ['Palazzo', 200],
    ['Sharara', 500],
    ['Gharara', 600],
    ['Dhoti', 300],
    ['Skirt', 300],
    ['Trousers', 150],
  ],
  dupatta: [
    ['No Dupatta', 0],
    ['Matching Dupatta', 0],
    ['Contrast Dupatta', 200],
    ['Printed Dupatta', 300],
    ['Embroidered Dupatta', 800],
  ],
  length: [
    ['Short', 0],
    ['Knee Length', 0],
    ['Calf Length', 100],
    ['Ankle Length', 200],
    ['Floor Length', 300],
  ],
  size: [
    ['XS', 0],
    ['S', 0],
    ['M', 0],
    ['L', 0],
    ['XL', 0],
    ['XXL', 200],
    ['3XL', 300],
    ['4XL', 400],
    ['Custom Measurement', 0],
  ],
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Which option groups each garment exposes, in order (§29).
 * `required` mirrors §25; `only` restricts a group to a subset for this garment.
 */
const GARMENT_TYPES = [
  {
    name: 'Patiala Suit',
    family: 'indian' as const,
    basePrice: 2499,
    measurements: ['Chest', 'Waist', 'Hip', 'Shoulder', 'Sleeve', 'Leg Length'],
    config: [
      { group: 'fabric', required: true },
      { group: 'color', required: true },
      { group: 'embroidery', required: false },
      { group: 'neck', required: true },
      { group: 'sleeve', required: true },
      /* §26: Sleeve Cuff appears only for Full Sleeve. */
      { group: 'sleeve_cuff', required: false, dependsOn: { group: 'sleeve', options: ['Full Sleeve'] } },
      { group: 'lower', required: true, only: ['Patiala', 'Palazzo', 'Sharara', 'Churidar'] },
      { group: 'dupatta', required: false },
      { group: 'size', required: true },
    ],
  },
  {
    name: 'Kurti',
    family: 'indian' as const,
    basePrice: 1299,
    measurements: ['Chest', 'Waist', 'Hip', 'Shoulder', 'Sleeve'],
    config: [
      { group: 'fabric', required: true },
      { group: 'color', required: true },
      { group: 'embroidery', required: false },
      { group: 'neck', required: true },
      { group: 'sleeve', required: true },
      { group: 'sleeve_cuff', required: false, dependsOn: { group: 'sleeve', options: ['Full Sleeve'] } },
      { group: 'length', required: true },
      { group: 'size', required: true },
    ],
  },
  {
    name: 'Anarkali Suit',
    family: 'indian' as const,
    basePrice: 3499,
    measurements: ['Chest', 'Waist', 'Hip', 'Shoulder', 'Sleeve', 'Leg Length'],
    config: [
      { group: 'fabric', required: true },
      { group: 'color', required: true },
      { group: 'embroidery', required: true },
      { group: 'neck', required: true },
      { group: 'sleeve', required: true },
      { group: 'length', required: true, only: ['Ankle Length', 'Floor Length'] },
      { group: 'dupatta', required: false },
      { group: 'size', required: true },
    ],
  },
];

async function seedCatalog() {
  await connectDB();

  /* 1. Option groups ----------------------------------------------------- */
  const groupIds = new Map<string, Types.ObjectId>();

  for (const group of GROUPS) {
    const doc = await OptionGroupModel.findOneAndUpdate(
      { code: group.code },
      { $set: group },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    groupIds.set(group.code, doc._id);
  }
  logger.info(`Seeded ${GROUPS.length} option groups`);

  /* 2. Options ----------------------------------------------------------- */
  const optionIds = new Map<string, Types.ObjectId>();
  let optionCount = 0;

  for (const [code, values] of Object.entries(OPTIONS)) {
    const groupId = groupIds.get(code);
    if (!groupId) continue;

    for (const [label, price, hex] of values) {
      const value = slugify(label);

      const doc = await OptionModel.findOneAndUpdate(
        { groupId, value },
        {
          $set: {
            groupId,
            label,
            value,
            hex,
            priceModifier: toPaise(price),
            position: optionCount,
            isActive: true,
            isDeleted: false,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).exec();

      /* Keyed by group+label so garment configs can reference options by name. */
      optionIds.set(`${code}:${label}`, doc._id);
      optionCount += 1;
    }
  }
  logger.info(`Seeded ${optionCount} options`);

  /* 3. Garment types ----------------------------------------------------- */
  const templates = await MeasurementTemplateModel.find().exec();
  const templateIds = new Map(templates.map((t) => [t.name, t._id]));

  if (templates.length === 0) {
    logger.warn('No measurement templates found — run `npm run seed:measurements` first');
  }

  for (const garment of GARMENT_TYPES) {
    const optionConfigs = garment.config.map((entry, index) => {
      const groupId = groupIds.get(entry.group);
      if (!groupId) throw new Error(`Unknown group in config: ${entry.group}`);

      const allowedOptions =
        'only' in entry && entry.only
          ? entry.only.map((label) => {
              const id = optionIds.get(`${entry.group}:${label}`);
              if (!id) throw new Error(`Unknown option: ${entry.group}:${label}`);
              return id;
            })
          : [];

      const dependsOn =
        'dependsOn' in entry && entry.dependsOn
          ? {
              groupId: groupIds.get(entry.dependsOn.group)!,
              optionIds: entry.dependsOn.options.map(
                (label) => optionIds.get(`${entry.dependsOn!.group}:${label}`)!
              ),
            }
          : undefined;

      return {
        groupId,
        position: index + 1,
        isRequired: entry.required,
        allowedOptions,
        dependsOn,
      };
    });

    await GarmentTypeModel.findOneAndUpdate(
      { slug: slugify(garment.name) },
      {
        $set: {
          name: garment.name,
          slug: slugify(garment.name),
          family: garment.family,
          basePrice: toPaise(garment.basePrice),
          measurementTemplates: garment.measurements
            .map((name) => templateIds.get(name))
            .filter(Boolean),
          optionConfigs,
          isDesignable: true,
          isActive: true,
          isDeleted: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    logger.info(`Seeded garment type: ${garment.name} (${optionConfigs.length} steps)`);
  }

  await disconnectDB();
  logger.info('Catalog seed complete');
}

seedCatalog().catch((error) => {
  logger.error({ err: error }, 'Catalog seed failed');
  process.exit(1);
});
