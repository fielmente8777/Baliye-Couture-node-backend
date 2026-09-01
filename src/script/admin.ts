import 'tsconfig-paths/register';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '@config/db';
import { logger } from '@config/logger';
import { env } from '@config/env';
import { AdminModel } from '@models/admin';

async function seedAdmin() {
  await connectDB();

  const existing = await AdminModel.findOne({ email: env.seedAdmin.email });
  if (existing) {
    logger.info(`Admin already exists for ${env.seedAdmin.email}, skipping seed.`);
    await disconnectDB();
    return;
  }

  const passwordHash = await bcrypt.hash(env.seedAdmin.password, 10);

  await AdminModel.create({
    name: env.seedAdmin.name,
    email: env.seedAdmin.email,
    passwordHash,
    isActive: true,
  });

  logger.info(`Seeded admin account: ${env.seedAdmin.email}`);
  logger.warn('Change the seed admin password immediately after first login.');

  await disconnectDB();
}

seedAdmin().catch((err) => {
  logger.error({ err }, 'Failed to seed admin account');
  process.exit(1);
});