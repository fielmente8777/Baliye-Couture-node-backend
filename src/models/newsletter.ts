import { Schema, model, Document, Types } from 'mongoose';

/**
 * Newsletter sign-ups from the website (home page form). The admin panel
 * lists them and exports a CSV for the mailing tool; nothing is sent from here.
 */
export interface INewsletterSubscriber extends Document {
  _id: Types.ObjectId;
  email: string;
  /** Where on the site they signed up, e.g. "home". */
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const newsletterSchema = new Schema<INewsletterSubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    source: { type: String, default: 'home', trim: true },
  },
  { timestamps: true }
);

export const NewsletterSubscriberModel = model<INewsletterSubscriber>('NewsletterSubscriber', newsletterSchema);
