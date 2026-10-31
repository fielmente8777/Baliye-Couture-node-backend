import bcrypt from 'bcryptjs';

import { Role } from '@constants/role';
import { AdminModel } from '@models/admin';
import { RefreshTokenModel } from '@models/refreshtoken';
import { ApiError } from '@utils/apiError';

/**
 * Team members: extra admin accounts the client adds from Admin → Team, so
 * their staff can sign in to the same panel with their own email and
 * password. Only owners manage the team; members can't add, change or remove
 * anyone, including themselves.
 *
 * Switching a member off or removing them ends their access at once:
 * `authenticate` checks the account on every admin request (`isAdminActive`),
 * and their saved sign-ins (refresh tokens) are revoked.
 */

/* `authenticate` asks on every admin request; a short cache keeps that to
   about one database read per admin per few seconds. */
const ACTIVE_TTL_MS = 10_000;
const activeCache = new Map<string, { active: boolean; at: number }>();

export async function isAdminActive(id: string) {
  const hit = activeCache.get(id);
  if (hit && Date.now() - hit.at < ACTIVE_TTL_MS) return hit.active;
  const admin = await AdminModel.findById(id).select('isActive').lean().exec();
  const active = Boolean(admin?.isActive);
  activeCache.set(id, { active, at: Date.now() });
  return active;
}

export async function isOwner(id: string) {
  const admin = await AdminModel.findById(id).select('role isActive').lean().exec();
  return Boolean(admin?.isActive && (admin.role ?? 'owner') === 'owner');
}

async function signOutEverywhere(id: string) {
  activeCache.delete(id);
  await RefreshTokenModel.updateMany({ userId: id, role: Role.ADMIN, revoked: false }, { revoked: true }).exec();
}

export function listTeam() {
  return AdminModel.find().sort({ role: -1, createdAt: 1 }).select('name email role isActive lastLoginAt createdAt').lean().exec();
}

export async function addMember(ownerId: string, input: { name: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (await AdminModel.exists({ email })) throw ApiError.conflict('Someone on the team already uses that email');

  const admin = await AdminModel.create({
    name: input.name.trim(),
    email,
    passwordHash: await bcrypt.hash(input.password, 10),
    role: 'member',
    addedBy: ownerId,
    isActive: true,
  });
  const { passwordHash: _hidden, ...safe } = admin.toObject();
  return safe;
}

/** Only members can be changed here; owners change their own details under their profile. */
async function memberOrThrow(id: string) {
  const admin = await AdminModel.findById(id).exec();
  if (!admin) throw ApiError.notFound('Team member not found');
  if ((admin.role ?? 'owner') !== 'member') throw ApiError.forbidden('Owner accounts cannot be changed from the team list');
  return admin;
}

export async function updateMember(id: string, input: { name?: string; password?: string; isActive?: boolean }) {
  const admin = await memberOrThrow(id);
  if (input.name) admin.name = input.name.trim();
  if (input.password) admin.passwordHash = await bcrypt.hash(input.password, 10);
  if (input.isActive !== undefined) admin.isActive = input.isActive;
  await admin.save();

  /* A new password or being switched off signs them out of every device. */
  if (input.password || input.isActive === false) await signOutEverywhere(id);
  activeCache.delete(id);

  const { passwordHash: _hidden, ...safe } = admin.toObject();
  return safe;
}

export async function removeMember(id: string) {
  await memberOrThrow(id);
  await AdminModel.deleteOne({ _id: id }).exec();
  await signOutEverywhere(id);
}
