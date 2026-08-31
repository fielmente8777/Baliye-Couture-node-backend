import 'tsconfig-paths/register';
import { connectDB, disconnectDB } from '@config/db';
import { logger } from '@config/logger';
import { MeasurementTemplateModel } from '@models/measurementtemplate';

/**
 * The twelve fields the Figma's measurement form and mannequin hotspots use
 * (Stensil-3 through -7), in the order they are rendered. The frontend keys its
 * hotspot coordinates off these names, so renaming one here means updating
 * MEASUREMENT_UI_META on the frontend to match.
 */
const DEFAULT_TEMPLATES = [
  { name: 'Chest', unit: 'in', displayOrder: 1 },
  { name: 'Sleeve', unit: 'in', displayOrder: 2 },
  { name: 'Shoulder', unit: 'in', displayOrder: 3 },
  { name: 'Bicep', unit: 'in', displayOrder: 4 },
  { name: 'Wrist Around', unit: 'in', displayOrder: 5 },
  { name: 'Front Raise', unit: 'in', displayOrder: 6 },
  { name: 'Waist', unit: 'in', displayOrder: 7 },
  { name: 'Back Raise', unit: 'in', displayOrder: 8 },
  { name: 'Hip', unit: 'in', displayOrder: 9 },
  { name: 'Thigh', unit: 'in', displayOrder: 10 },
  { name: 'Leg Length', unit: 'in', displayOrder: 11 },
  { name: 'Leg Opening', unit: 'in', displayOrder: 12 },
] as const;

async function seedMeasurementTemplates() {
  await connectDB();

  for (const template of DEFAULT_TEMPLATES) {
    await MeasurementTemplateModel.findOneAndUpdate(
      { name: template.name },
      { $setOnInsert: template },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  logger.info(`Seeded ${DEFAULT_TEMPLATES.length} default measurement templates.`);

  await disconnectDB();
}

seedMeasurementTemplates().catch((err) => {
  logger.error({ err }, 'Failed to seed measurement templates');
  process.exit(1);
});