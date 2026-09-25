import 'tsconfig-paths/register';

import { connectDB, disconnectDB } from '@config/db';
import { logger } from '@config/logger';
import { OptionGroupModel } from '@models/optiongroup';
import { GarmentTypeModel } from '@models/garmenttype';
import { ProductModel } from '@models/product';
import { IOptionConfig } from '@models/optionconfig';

/**
 * One-off migration: move the Neck Type step in front of Embroidery on a
 * database that was seeded with the old order.
 *
 * Swaps the two positions wherever both steps exist — the option groups'
 * fallback order, every garment type's steps, and every product's
 * customizable steps. Idempotent: if Neck is already first, nothing changes.
 */

async function run() {
  await connectDB();

  const neck = await OptionGroupModel.findOne({ code: 'neck' }).exec();
  const embroidery = await OptionGroupModel.findOne({ code: 'embroidery' }).exec();

  if (!neck || !embroidery) {
    logger.warn('Neck or Embroidery group not found — nothing to reorder');
    await disconnectDB();
    return;
  }

  /* 1. Group fallback order */
  if (neck.position > embroidery.position) {
    const neckPos = neck.position;
    neck.position = embroidery.position;
    embroidery.position = neckPos;
    await neck.save();
    await embroidery.save();
    logger.info('Swapped option group positions');
  }

  const neckId = neck._id.toString();
  const embId = embroidery._id.toString();

  /** Swaps the two positions in place; returns true if anything moved. */
  const reorder = (configs: IOptionConfig[]) => {
    const n = configs.find((c) => c.groupId.toString() === neckId);
    const e = configs.find((c) => c.groupId.toString() === embId);
    if (!n || !e || n.position < e.position) return false;

    const neckPos = n.position;
    n.position = e.position;
    e.position = neckPos;
    configs.sort((a, b) => a.position - b.position);
    return true;
  };

  /* 2. Garment types */
  let garments = 0;
  for (const type of await GarmentTypeModel.find().exec()) {
    if (reorder(type.optionConfigs)) {
      type.markModified('optionConfigs');
      await type.save();
      garments += 1;
    }
  }
  logger.info(`Reordered ${garments} garment type(s)`);

  /* 3. Products */
  let products = 0;
  for (const product of await ProductModel.find().exec()) {
    if (reorder(product.customizableOptions)) {
      product.markModified('customizableOptions');
      await product.save();
      products += 1;
    }
  }
  logger.info(`Reordered ${products} product(s)`);

  await disconnectDB();
  logger.info('Neck-before-Embroidery migration complete');
}

run().catch((error) => {
  logger.error({ err: error }, 'Neck-before-Embroidery migration failed');
  process.exit(1);
});
