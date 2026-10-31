import { Schema, model, Document, Types } from 'mongoose';

export const ADMIN_ROLES = ['owner', 'member'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface IAdmin extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  profileImage?: string;
  isActive: boolean;
  /**
   * owner: the client's own accounts (seeded); manages the team.
   * member: a team member an owner added; sees and edits the whole panel,
   * but not the team. Accounts made before roles existed read as owner.
   */
  role: AdminRole;
  /** The owner who added this member. */
  addedBy?: Types.ObjectId;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    profileImage: { type: String },
    isActive: { type: Boolean, default: true },
    role: { type: String, enum: ADMIN_ROLES, default: 'owner' },
    addedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export const AdminModel = model<IAdmin>('Admin', adminSchema);