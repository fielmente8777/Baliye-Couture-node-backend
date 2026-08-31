import { Schema, model, Document, Types } from 'mongoose';

export type AddressType = 'home' | 'work' | 'other';

/**
 * A saved shipping address (Profile-1, Profile-3).
 *
 * Kept as its own collection rather than an array on User: orders reference an
 * address, a customer can accumulate many, and soft-deleting one must not
 * disturb the others.
 */
export interface IAddress extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  fullName: string;
  /** Free-text line: "Flat No. 102, Orchid Residency, MG Road". */
  street: string;
  /** Optional second line — the design shows two lines of street text. */
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  /** Delivery contact, which is not always the account holder's number. */
  phone?: string;
  type: AddressType;
  isDefault: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    street: { type: String, required: true, trim: true, maxlength: 300 },
    landmark: { type: String, trim: true, maxlength: 150 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    pincode: { type: String, required: true, trim: true, maxlength: 12 },
    country: { type: String, trim: true, maxlength: 100, default: 'India' },
    phone: { type: String, trim: true, maxlength: 20 },
    type: { type: String, enum: ['home', 'work', 'other'], default: 'home' },
    isDefault: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const AddressModel = model<IAddress>('Address', addressSchema);
