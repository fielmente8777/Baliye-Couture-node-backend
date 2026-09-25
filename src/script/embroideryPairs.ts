import 'tsconfig-paths/register';
import { readFileSync } from 'fs';
import path from 'path';

import { connectDB, disconnectDB } from '@config/db';
import { logger } from '@config/logger';
import { OptionGroupModel } from '@models/optiongroup';
import { OptionModel } from '@models/option';

/**
 * Writes which neck types each embroidery style suits, from
 * src/script/data/embroidery-pairs.json:
 *
 *   { "Keyhole Embroidery": ["Keyhole Neck", "Round Neck"], ... }
 *
 * Keys are embroidery option labels, values are neck option labels.
 * An empty list (or a style left out of the file) = offered with every neck.
 * Re-run it after every edit to the file; it overwrites, it never appends.
 */

type PairsFile = Record<string, string[] | string>;

async function run() {
  const file = path.join(__dirname, 'data', 'embroidery-pairs.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as PairsFile;

  /* Keys starting with "_" are notes, not embroidery styles. */
  const pairs = Object.entries(raw).filter(
    (entry): entry is [string, string[]] => !entry[0].startsWith('_') && Array.isArray(entry[1])
  );

  await connectDB();

  const neckGroup = await OptionGroupModel.findOne({ code: 'neck' }).exec();
  const embGroup = await OptionGroupModel.findOne({ code: 'embroidery' }).exec();
  if (!neckGroup || !embGroup) throw new Error('Run the catalog seed first — neck/embroidery groups missing');

  const necks = await OptionModel.find({ groupId: neckGroup._id, isDeleted: false }).exec();
  const neckByLabel = new Map(necks.map((o) => [o.label.toLowerCase(), o._id]));

  const embroideries = await OptionModel.find({ groupId: embGroup._id, isDeleted: false }).exec();
  const embByLabel = new Map(embroideries.map((o) => [o.label.toLowerCase(), o]));

  const problems: string[] = [];
  const listed = new Set<string>();

  for (const [embLabel, neckLabels] of pairs) {
    const emb = embByLabel.get(embLabel.toLowerCase());
    if (!emb) {
      problems.push(`Unknown embroidery: "${embLabel}"`);
      continue;
    }
    listed.add(emb._id.toString());

    const neckIds = neckLabels.flatMap((label) => {
      const id = neckByLabel.get(label.toLowerCase());
      if (!id) problems.push(`Unknown neck "${label}" (under "${embLabel}")`);
      return id ? [id] : [];
    });

    emb.pairsWith = neckIds;
    await emb.save();
    logger.info(`${emb.label}: ${neckIds.length ? `${neckIds.length} neck type(s)` : 'all neck types'}`);
  }

  /* Styles removed from the file go back to "pairs with everything". */
  for (const emb of embroideries) {
    if (!listed.has(emb._id.toString()) && emb.pairsWith?.length) {
      emb.pairsWith = [];
      await emb.save();
      logger.info(`${emb.label}: cleared (not in file)`);
    }
  }

  await disconnectDB();

  if (problems.length) {
    problems.forEach((p) => logger.warn(p));
    logger.warn('Fix the names above in embroidery-pairs.json — labels must match the catalog exactly');
  }
  logger.info('Embroidery pairs applied');
}

run().catch((error) => {
  logger.error({ err: error }, 'Embroidery pairs failed');
  process.exit(1);
});
