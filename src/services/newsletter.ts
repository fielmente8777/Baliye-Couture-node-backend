import { NewsletterSubscriberModel } from '../models/newsletter';
import { ApiError } from '../utils/apiError';

/** Signing up twice is not an error: the visitor just sees "you're on the list". */
export async function subscribe(email: string, source = 'home') {
  await NewsletterSubscriberModel.updateOne(
    { email },
    { $setOnInsert: { email, source } },
    { upsert: true }
  );
}

export async function listSubscribers({ search, page, limit }: { search?: string; page: number; limit: number }) {
  const filter = search ? { email: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
  const [items, total] = await Promise.all([
    NewsletterSubscriberModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NewsletterSubscriberModel.countDocuments(filter),
  ]);
  return { items, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function removeSubscriber(id: string) {
  const deleted = await NewsletterSubscriberModel.findByIdAndDelete(id);
  if (!deleted) throw ApiError.notFound('Subscriber not found');
}

/** Every subscriber, newest first, as a CSV for Shopify Email, Mailchimp and the like. */
export async function subscribersCsv() {
  const rows = await NewsletterSubscriberModel.find().sort({ createdAt: -1 }).lean();
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return [
    'email,source,signed_up',
    ...rows.map((r) => [r.email, r.source, r.createdAt.toISOString()].map(cell).join(',')),
  ].join('\n');
}
