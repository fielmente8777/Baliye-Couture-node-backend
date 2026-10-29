import { env } from '@config/env';
import { AiCreditKind, AiCreditModel } from '@models/aicredit';
import { ColourRenderModel } from '@models/colourrender';
import { ImageJobModel } from '@models/imagejob';
import { UserModel } from '@models/user';

/**
 * The store's AI credit: what is left of the prepaid OpenAI balance.
 *
 *   left = latest balance the admin read from OpenAI
 *        + top-ups recorded after it
 *        − estimated cost of every generation after it
 *
 * Generation costs are estimates (config/imageUsage.ts), so the admin
 * re-enters the real balance from OpenAI now and then to correct drift.
 */

/** Below this many dollars the dashboard warns to top up. */
const LOW_BALANCE_USD = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const round = (n: number) => Math.round(n * 100) / 100;

/** Estimated OpenAI spend since `since`: studio/render jobs plus customer colour previews. */
async function spendSince(since: Date) {
  const [jobs, previews] = await Promise.all([
    ImageJobModel.aggregate<{ costUsd: number; images: number }>([
      { $match: { createdAt: { $gte: since }, 'usage.costUsd': { $type: 'number' } } },
      { $group: { _id: null, costUsd: { $sum: '$usage.costUsd' }, images: { $sum: 1 } } },
    ]),
    ColourRenderModel.aggregate<{ costUsd: number; images: number }>([
      { $match: { usageAt: { $gte: since }, 'usage.costUsd': { $type: 'number' } } },
      { $group: { _id: null, costUsd: { $sum: '$usage.costUsd' }, images: { $sum: 1 } } },
    ]),
  ]);
  return {
    costUsd: (jobs[0]?.costUsd ?? 0) + (previews[0]?.costUsd ?? 0),
    images: (jobs[0]?.images ?? 0) + (previews[0]?.images ?? 0),
    previews: previews[0]?.images ?? 0,
    previewCostUsd: previews[0]?.costUsd ?? 0,
  };
}

export async function getAiCredit() {
  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const anchor = await AiCreditModel.findOne({ kind: 'balance' }).sort({ createdAt: -1 }).exec();

  const [last30, thisMonth, sinceAnchor, topups, history, held] = await Promise.all([
    spendSince(new Date(now - 30 * DAY_MS)),
    spendSince(monthStart),
    anchor ? spendSince(anchor.createdAt) : null,
    anchor
      ? AiCreditModel.aggregate<{ total: number }>([
          { $match: { kind: 'topup', createdAt: { $gt: anchor.createdAt } } },
          { $group: { _id: null, total: { $sum: '$amountUsd' } } },
        ])
      : [],
    AiCreditModel.find().sort({ createdAt: -1 }).limit(15).select('kind amountUsd note createdAt').exec(),
    UserModel.aggregate<{ total: number }>([
      { $match: { isDeleted: false, tokenBalance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$tokenBalance' } } },
    ]),
  ]);

  /* Average cost of one customer AI design over the last 30 days. Until a
     customer preview has been recorded, any recent image is the best guess. */
  const costPerDesignUsd =
    last30.previews > 0
      ? last30.previewCostUsd / last30.previews
      : last30.images > 0
        ? last30.costUsd / last30.images
        : null;
  const perDay = last30.costUsd / 30;
  const creditCost = env.tokens.recolourCost;
  /* Credits already given to customers and not yet spent — AI money that is spoken for. */
  const heldByCustomers = held[0]?.total ?? 0;

  let balance = null;
  if (anchor && sinceAnchor) {
    const toppedUp = topups[0]?.total ?? 0;
    const left = anchor.amountUsd + toppedUp - sinceAnchor.costUsd;
    const designsLeft = costPerDesignUsd ? Math.max(0, Math.floor(left / costPerDesignUsd)) : null;
    balance = {
      leftUsd: round(left),
      checkedUsd: anchor.amountUsd,
      checkedAt: anchor.createdAt,
      toppedUpUsd: round(toppedUp),
      spentUsd: round(sinceAnchor.costUsd),
      imagesSince: sinceAnchor.images,
      /** How many more customer AI designs the balance covers, at the recent average. */
      designsLeft,
      /**
       * Design credits the admin can still hand out: what the balance pays
       * for, less the credits customers already hold.
       */
      creditsToGive: designsLeft === null ? null : Math.max(0, designsLeft * creditCost - heldByCustomers),
      /** At the last 30 days' pace. */
      daysLeft: perDay > 0 ? Math.max(0, Math.floor(left / perDay)) : null,
      low: left < LOW_BALANCE_USD,
    };
  }

  return {
    currency: 'USD',
    balance,
    spentLast30DaysUsd: round(last30.costUsd),
    imagesLast30Days: last30.images,
    spentThisMonthUsd: round(thisMonth.costUsd),
    costPerDesignUsd: costPerDesignUsd === null ? null : Math.round(costPerDesignUsd * 10000) / 10000,
    /** Customer AI designs one US dollar of OpenAI credit pays for. */
    designsPerDollar: costPerDesignUsd ? Math.floor(1 / costPerDesignUsd) : null,
    creditCost,
    heldByCustomers,
    lowBalanceUsd: LOW_BALANCE_USD,
    history,
  };
}

export async function recordAiCredit(input: { kind: AiCreditKind; amountUsd: number; note?: string; adminId?: string }) {
  await AiCreditModel.create({
    kind: input.kind,
    amountUsd: input.amountUsd,
    note: input.note || undefined,
    adminId: input.adminId,
  });
  return getAiCredit();
}
