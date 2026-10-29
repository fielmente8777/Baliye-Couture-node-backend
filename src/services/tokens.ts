import { Types } from 'mongoose';

import { env } from '@config/env';
import { HttpStatus } from '@constants/httpstatus';
import { logger } from '@config/logger';
import { TokenLedgerModel, TokenReason } from '@models/tokenledger';
import { UserModel } from '@models/user';
import { getSettings } from './settings';
import { ApiError } from '@utils/apiError';

/**
 * Design token wallet.
 *
 * Rules that keep tokens from being wasted:
 *   - Only a NEW AI generation costs tokens. A colour someone already
 *     generated is served from cache for free.
 *   - The charge is taken before the generation starts and refunded
 *     automatically if it fails — a customer never pays for no picture.
 *   - The balance can never go below zero: the debit is one atomic update
 *     guarded by `tokenBalance >= cost`, so two tabs cannot overspend.
 */

/**
 * Packs shown on the account page. Prices in minor units (paise). Purchase
 * is not wired to a payment yet — tokens are granted by an admin for now.
 */
const TOKEN_PACKS = [
  { id: 'starter', tokens: 10, bonus: 0, price: 9900, label: 'Starter', tagline: 'Try a few designs' },
  { id: 'popular', tokens: 30, bonus: 5, price: 24900, label: 'Popular', tagline: 'Design a full outfit', highlight: 'Most popular' },
  { id: 'studio', tokens: 100, bonus: 25, price: 69900, label: 'Studio', tagline: 'For regular customers', highlight: 'Best value' },
] as const;

/** Mirrors renderRateLimiter in middlewares/ratelimit.ts — shown to customers as a limit. */
const PREVIEWS_PER_WINDOW = 40;
const WINDOW_MINUTES = 10;

/** The admin's "Design credits" switch (falls back to TOKENS_ENABLED). */
export const tokensEnabled = async () => (await getSettings()).creditsEnabled;

/** Price per token of the smallest pack — what "you save" is measured against. */
const BASE_PER_TOKEN = TOKEN_PACKS[0].price / TOKEN_PACKS[0].tokens;

export async function getWallet(userId: string) {
  const user = await UserModel.findById(userId).select('tokenBalance').exec();
  if (!user) throw ApiError.notFound('User not found');

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [history, totals] = await Promise.all([
    TokenLedgerModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('delta balanceAfter reason note createdAt')
      .exec(),
    TokenLedgerModel.aggregate<{ _id: string; total: number; count: number; thisMonth: number }>([
      { $match: { userId: new Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$reason',
          total: { $sum: '$delta' },
          count: { $sum: 1 },
          thisMonth: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, '$delta', 0] } },
        },
      },
    ]),
  ]);

  const by = (reason: TokenReason) => totals.find((t) => t._id === reason);
  const spent = -(by('spend')?.total ?? 0);
  const refunded = by('refund')?.total ?? 0;
  const received = (by('grant')?.total ?? 0) + (by('purchase')?.total ?? 0);
  const cost = env.tokens.recolourCost;
  const balance = user.tokenBalance ?? 0;

  return {
    enabled: await tokensEnabled(),
    balance,
    /** How many new colour previews the balance covers. */
    previewsLeft: Math.floor(balance / cost),
    costs: { recolour: cost },
    usage: {
      received,
      used: spent - refunded,
      refunded,
      usedThisMonth: -((by('spend')?.thisMonth ?? 0) + (by('refund')?.thisMonth ?? 0)),
      previewsGenerated: Math.max(0, (by('spend')?.count ?? 0) - (by('refund')?.count ?? 0)),
    },
    limits: {
      costPerNewPreview: cost,
      cachedPreviewsFree: true,
      failedPreviewsRefunded: true,
      previewsPerWindow: PREVIEWS_PER_WINDOW,
      windowMinutes: WINDOW_MINUTES,
      tokensExpire: false,
    },
    packs: TOKEN_PACKS.map((pack) => {
      const total = pack.tokens + pack.bonus;
      return {
        ...pack,
        total,
        perToken: Math.round(pack.price / total),
        savingsPercent: Math.max(0, Math.round((1 - pack.price / total / BASE_PER_TOKEN) * 100)),
      };
    }),
    history,
  };
}

async function record(
  userId: string,
  delta: number,
  balanceAfter: number,
  reason: TokenReason,
  extra: { note?: string; ref?: string; adminId?: string } = {},
) {
  await TokenLedgerModel.create({
    userId,
    delta,
    balanceAfter,
    reason,
    note: extra.note,
    ref: extra.ref,
    adminId: extra.adminId,
  });
}

/** Takes `amount` tokens, or throws without touching the balance. */
export async function spendTokens(userId: string, amount: number, ref: string, note: string) {
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, tokenBalance: { $gte: amount } },
    { $inc: { tokenBalance: -amount } },
    { new: true },
  ).exec();

  if (!user) {
    throw new ApiError(HttpStatus.PAYMENT_REQUIRED, `Not enough credits — this preview needs ${amount}`);
  }

  await record(userId, -amount, user.tokenBalance, 'spend', { note, ref });
  return user.tokenBalance;
}

/** Gives back a spend. Safe to call twice: the second call is a no-op. */
export async function refundTokens(userId: string, amount: number, ref: string, note: string) {
  /* Claim the refund first; the unique index rejects a second claim. */
  try {
    await record(userId, amount, -1, 'refund', { note, ref });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return;
    throw error;
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $inc: { tokenBalance: amount } },
    { new: true },
  ).exec();

  await TokenLedgerModel.updateOne(
    { ref, reason: 'refund' },
    { $set: { balanceAfter: user?.tokenBalance ?? 0 } },
  ).exec();

  logger.info({ userId, amount, ref }, 'Tokens refunded');
}

/** Admin top-up (positive) or correction (negative, never below zero). */
export async function grantTokens(input: {
  userId: string;
  amount: number;
  note?: string;
  adminId?: string;
  reason?: 'grant' | 'purchase';
}) {
  if (!Types.ObjectId.isValid(input.userId)) throw ApiError.badRequest('Invalid user');
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw ApiError.badRequest('Amount must be a whole number other than 0');
  }

  const filter: Record<string, unknown> = { _id: input.userId, isDeleted: false };
  if (input.amount < 0) filter.tokenBalance = { $gte: -input.amount };

  const user = await UserModel.findOneAndUpdate(
    filter,
    { $inc: { tokenBalance: input.amount } },
    { new: true },
  ).exec();

  if (!user) {
    throw input.amount < 0
      ? ApiError.badRequest('That would take the balance below zero')
      : ApiError.notFound('User not found');
  }

  await record(input.userId, input.amount, user.tokenBalance, input.reason ?? 'grant', {
    note: input.note || (input.amount > 0 ? 'Credits added' : 'Balance corrected'),
    adminId: input.adminId,
  });

  return { userId: input.userId, balance: user.tokenBalance };
}

/**
 * Admin: how credits are used across the store — totals, plus one row per
 * customer who has ever had credits (most recently active first).
 */
export async function getCreditStats(limit = 200) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const sumWhen = (reasons: TokenReason[], value: unknown) => ({
    $sum: { $cond: [{ $in: ['$reason', reasons] }, value, 0] },
  });

  const [customers, balances, overall, rows] = await Promise.all([
    UserModel.countDocuments({ isDeleted: false }).exec(),
    UserModel.aggregate<{ withBalance: number; inCirculation: number }>([
      { $match: { isDeleted: false, tokenBalance: { $gt: 0 } } },
      { $group: { _id: null, withBalance: { $sum: 1 }, inCirculation: { $sum: '$tokenBalance' } } },
    ]),
    TokenLedgerModel.aggregate<{
      issued: number;
      spent: number;
      refunded: number;
      spentThisMonth: number;
      spends: number;
      refunds: number;
    }>([
      {
        $group: {
          _id: null,
          issued: sumWhen(['grant', 'purchase'], '$delta'),
          spent: sumWhen(['spend'], '$delta'),
          refunded: sumWhen(['refund'], '$delta'),
          spentThisMonth: {
            $sum: {
              $cond: [
                { $and: [{ $in: ['$reason', ['spend', 'refund']] }, { $gte: ['$createdAt', monthStart] }] },
                '$delta',
                0,
              ],
            },
          },
          spends: sumWhen(['spend'], 1),
          refunds: sumWhen(['refund'], 1),
        },
      },
    ]),
    TokenLedgerModel.aggregate([
      {
        $group: {
          _id: '$userId',
          received: sumWhen(['grant', 'purchase'], '$delta'),
          spent: sumWhen(['spend'], '$delta'),
          refunded: sumWhen(['refund'], '$delta'),
          spends: sumWhen(['spend'], 1),
          refunds: sumWhen(['refund'], 1),
          lastActivity: { $max: '$createdAt' },
        },
      },
      { $sort: { lastActivity: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: UserModel.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          received: 1, spent: 1, refunded: 1, spends: 1, refunds: 1, lastActivity: 1,
          user: { name: 1, email: 1, phone: 1, tokenBalance: 1, createdAt: 1 },
        },
      },
    ]),
  ]);

  const totals = overall[0];
  const activeUsers = rows.filter((r) => r.spends > 0).length;

  return {
    enabled: await tokensEnabled(),
    costPerDesign: env.tokens.recolourCost,
    customers,
    customersWithCredits: balances[0]?.withBalance ?? 0,
    customersUsingCredits: activeUsers,
    inCirculation: balances[0]?.inCirculation ?? 0,
    issued: totals?.issued ?? 0,
    used: -(totals?.spent ?? 0) - (totals?.refunded ?? 0),
    usedThisMonth: -(totals?.spentThisMonth ?? 0),
    designsGenerated: Math.max(0, (totals?.spends ?? 0) - (totals?.refunds ?? 0)),
    users: rows.map((r) => ({
      _id: String(r._id),
      name: r.user.name,
      email: r.user.email,
      phone: r.user.phone,
      createdAt: r.user.createdAt,
      tokenBalance: r.user.tokenBalance ?? 0,
      received: r.received,
      used: -r.spent - r.refunded,
      designsGenerated: Math.max(0, r.spends - r.refunds),
      lastActivity: r.lastActivity,
    })),
  };
}

/** Admin: one customer's full history. */
export function listLedger(userId: string, limit = 100) {
  return TokenLedgerModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).exec();
}
