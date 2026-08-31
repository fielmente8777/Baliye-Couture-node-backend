import * as measurementTemplateRepository from '@repositories/measurementTemplate.repository';
import * as measurementProfileRepository from '@repositories/measurementProfile.repository';
import * as userRepository from '@repositories/user.repository';
import { ApiError } from '@utils/apiError';
import { IMeasurementTemplate } from '@models/measurementtemplate';

/** A customer keeping more than this many is almost certainly a mistake. */
const MAX_PROFILES_PER_USER = 20;

/** The profile an order falls back to when the client picks none. */
export async function getDefaultProfile(userId: string) {
  const profiles = await measurementProfileRepository.findAllByUser(userId);
  return profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
}

/** Ownership check used by the cart and order services. */
export async function assertOwnedProfile(id: string, userId: string) {
  const profile = await measurementProfileRepository.findByIdForUser(id, userId);
  if (!profile) throw ApiError.notFound('Measurement profile not found');
  if (profile.values.length === 0) {
    throw ApiError.badRequest('That measurement profile has no values saved');
  }
  return profile;
}

// ---- Admin: templates ----
export function createTemplate(data: Partial<IMeasurementTemplate>) {
  return measurementTemplateRepository.create(data);
}

export function getAllTemplates(activeOnly = false) {
  return activeOnly ? measurementTemplateRepository.findAllActive() : measurementTemplateRepository.findAll();
}

export async function updateTemplate(id: string, data: Partial<IMeasurementTemplate>) {
  const template = await measurementTemplateRepository.updateById(id, data);
  if (!template) throw ApiError.notFound('Measurement template not found');
  return template;
}

export async function deleteTemplate(id: string) {
  const template = await measurementTemplateRepository.deleteById(id);
  if (!template) throw ApiError.notFound('Measurement template not found');
  return template;
}

// ---- User: measurement profiles ----

/**
 * Resolves submitted { templateId, value } pairs against the active templates,
 * denormalising the name and unit onto each value so a later template rename
 * cannot rewrite history on an existing order.
 */
async function resolveValues(values: { templateId: string; value: number }[]) {
  const templates = await measurementTemplateRepository.findAllActive();
  const templateMap = new Map(templates.map((t) => [t._id.toString(), t]));

  return values.map((v) => {
    const template = templateMap.get(v.templateId);
    if (!template) {
      throw ApiError.badRequest(`Unknown measurement template: ${v.templateId}`);
    }
    return {
      templateId: template._id,
      name: template.name,
      value: v.value,
      unit: template.unit,
    };
  });
}

/**
 * Builds a profile name when the customer does not supply one.
 *
 * Prefers "<their name>_Measurement" so the list reads meaningfully, falling
 * back to a numbered name for accounts that have no name yet (an OTP signup
 * starts with only a phone number). Collisions get a numeric suffix rather
 * than failing the save — the name is a convenience, not something worth
 * rejecting a set of measurements over.
 */
async function generateProfileName(userId: string): Promise<string> {
  const user = await userRepository.findById(userId);

  const base = user?.name?.trim()
    ? `${user.name.trim().split(/\s+/)[0]}_Measurement`
    : 'Measurement';

  let candidate = base;
  let suffix = 1;

  while (await measurementProfileRepository.findByNameForUser(candidate, userId)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }

  return candidate;
}

export function getProfiles(userId: string) {
  return measurementProfileRepository.findAllByUser(userId);
}

export async function getProfileById(id: string, userId: string) {
  const profile = await measurementProfileRepository.findByIdForUser(id, userId);
  if (!profile) throw ApiError.notFound('Measurement profile not found');
  return profile;
}

export async function createProfile(
  userId: string,
  data: { profileName?: string; values: { templateId: string; value: number }[]; isDefault?: boolean }
) {
  const count = await measurementProfileRepository.countByUser(userId);
  if (count >= MAX_PROFILES_PER_USER) {
    throw ApiError.badRequest(`You can save at most ${MAX_PROFILES_PER_USER} measurement profiles`);
  }

  const profileName = data.profileName?.trim() || (await generateProfileName(userId));

  const duplicate = await measurementProfileRepository.findByNameForUser(profileName, userId);
  if (duplicate) throw ApiError.conflict('You already have a profile with that name');

  const values = await resolveValues(data.values);

  /** The first profile a user saves becomes their default automatically. */
  const isDefault = data.isDefault ?? count === 0;

  const profile = await measurementProfileRepository.create({
    userId: userId as never,
    profileName,
    values,
    isDefault,
  });

  if (isDefault) {
    await measurementProfileRepository.clearDefaultForUser(userId, profile._id.toString());
  }

  return profile;
}

export async function updateProfile(
  id: string,
  userId: string,
  data: { profileName?: string; values?: { templateId: string; value: number }[]; isDefault?: boolean }
) {
  const existing = await measurementProfileRepository.findByIdForUser(id, userId);
  if (!existing) throw ApiError.notFound('Measurement profile not found');

  if (data.profileName && data.profileName !== existing.profileName) {
    const duplicate = await measurementProfileRepository.findByNameForUser(data.profileName, userId);
    if (duplicate) throw ApiError.conflict('You already have a profile with that name');
  }

  const patch: Record<string, unknown> = {};
  if (data.profileName) patch.profileName = data.profileName;
  if (data.values) patch.values = await resolveValues(data.values);
  if (typeof data.isDefault === 'boolean') patch.isDefault = data.isDefault;

  const profile = await measurementProfileRepository.updateByIdForUser(id, userId, patch);
  if (!profile) throw ApiError.notFound('Measurement profile not found');

  if (data.isDefault) {
    await measurementProfileRepository.clearDefaultForUser(userId, id);
  }

  return profile;
}

export async function deleteProfile(id: string, userId: string) {
  const profile = await measurementProfileRepository.softDeleteForUser(id, userId);
  if (!profile) throw ApiError.notFound('Measurement profile not found');

  /** Never leave a user with profiles but no default. */
  if (profile.isDefault) {
    const remaining = await measurementProfileRepository.findAllByUser(userId);
    if (remaining[0]) {
      await measurementProfileRepository.updateByIdForUser(
        remaining[0]._id.toString(),
        userId,
        { isDefault: true }
      );
    }
  }

  return profile;
}
