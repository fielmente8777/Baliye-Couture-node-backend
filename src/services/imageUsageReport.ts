import { sessionUsage } from '@config/imageUsage';
import { ImageJobModel } from '@models/imagejob';

/**
 * Totals of OpenAI image usage, from the usage stored on each ImageJob.
 * Backs GET /api/v1/ai/usage?days=30.
 *
 * Stages: extract (studio stage 1), apply (studio stage 2 / blends),
 * render (customer design previews), variant (product variants).
 */
export async function getImageUsageReport(days = 30) {
  const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  const match = { createdAt: { $gte: since }, 'usage.costUsd': { $type: 'number' } };

  const sum = {
    images: { $sum: 1 },
    inputTokens: { $sum: '$usage.inputTokens' },
    outputTokens: { $sum: '$usage.outputTokens' },
    costUsd: { $sum: '$usage.costUsd' },
  };

  const [byStage, byDay, total] = await Promise.all([
    ImageJobModel.aggregate([{ $match: match }, { $group: { _id: '$stage', ...sum } }, { $sort: { costUsd: -1 } }]),
    ImageJobModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          ...sum,
        },
      },
      { $sort: { _id: -1 } },
    ]),
    ImageJobModel.aggregate([{ $match: match }, { $group: { _id: null, ...sum } }]),
  ]);

  const tidy = <T extends { _id: unknown; costUsd: number }>(rows: T[], key: string) =>
    rows.map(({ _id, costUsd, ...rest }) => ({ [key]: _id, ...rest, costUsd: Number(costUsd.toFixed(4)) }));

  const t = total[0] ?? { images: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

  return {
    periodDays: days,
    note: 'Estimated from OpenAI token usage × published prices. Check platform.openai.com → Usage for billed amounts.',
    total: {
      images: t.images,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      costUsd: Number(t.costUsd.toFixed(4)),
    },
    byStage: tidy(byStage, 'stage'),
    byDay: tidy(byDay, 'day'),
    sinceServerStart: sessionUsage(),
  };
}
