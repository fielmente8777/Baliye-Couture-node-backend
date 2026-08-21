import 'tsconfig-paths/register';
import { connectDB, disconnectDB } from '@config/db';
import { logger } from '@config/logger';
import { MeasurementTemplateModel } from '@models/measurementtemplate';

const DEFAULT_TEMPLATES = [
  { name: 'Neck', unit: 'in', displayOrder: 1 },
  { name: 'Chest', unit: 'in', displayOrder: 2 },
  { name: 'Shoulder', unit: 'in', displayOrder: 3 },
  { name: 'Sleeve', unit: 'in', displayOrder: 4 },
  { name: 'Waist', unit: 'in', displayOrder: 5 },
  { name: 'Hip', unit: 'in', displayOrder: 6 },
  { name: 'Inseam', unit: 'in', displayOrder: 7 },
  { name: 'Outseam', unit: 'in', displayOrder: 8 },
  { name: 'Length', unit: 'in', displayOrder: 9 },
  { name: 'Cuff', unit: 'in', displayOrder: 10 },
  { name: 'Bicep', unit: 'in', displayOrder: 11 },
  { name: 'Wrist', unit: 'in', displayOrder: 12 },
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