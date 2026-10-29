import { env } from '@config/env';
import { AppSettingsModel } from '@models/appsettings';

/**
 * Admin-controlled switches, read on hot paths (every design preview), so
 * they are cached for a few seconds. Saving clears this process's cache at
 * once; any other server process picks the change up within CACHE_MS.
 */

export interface AppSettings {
  creditsEnabled: boolean;
  /** "" when no video has been added. */
  measureVideoUrl: string;
}

const CACHE_MS = 3_000;
let cached: { value: AppSettings; at: number } | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const doc = await AppSettingsModel.findOne({ key: 'app' }).lean().exec();
  const value: AppSettings = {
    /* Never saved: the env default (TOKENS_ENABLED) decides. */
    creditsEnabled: doc?.creditsEnabled ?? env.tokens.enabled,
    measureVideoUrl: doc?.measureVideoUrl ?? '',
  };
  cached = { value, at: Date.now() };
  return value;
}

export async function updateSettings(patch: Partial<AppSettings>, adminId?: string): Promise<AppSettings> {
  await AppSettingsModel.findOneAndUpdate(
    { key: 'app' },
    { $set: { ...patch, updatedBy: adminId } },
    { upsert: true, setDefaultsOnInsert: true },
  ).exec();
  cached = null;
  return getSettings();
}
