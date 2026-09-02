import { Schema, model, Document, Types } from "mongoose";

/**
 * One requested variant. Tracked in our own collection because Magnific's
 * task_id is meaningless to us on its own — we need to know which product and
 * which option combination it was generated for.
 */
export interface IImageJob extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  taskId: string;
  status: "pending" | "completed" | "failed";
  /** The option combination this variant represents. */
  selections: { groupId: Types.ObjectId; optionId: Types.ObjectId }[];
  prompt: string;
  resultUrls: string[];
  error?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

const imageJobSchema = new Schema<IImageJob>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    taskId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    selections: [
      {
        _id: false,
        groupId: { type: Schema.Types.ObjectId, ref: "OptionGroup" },
        optionId: { type: Schema.Types.ObjectId, ref: "Option" },
      },
    ],
    prompt: { type: String, required: true },
    resultUrls: [{ type: String }],
    error: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const ImageJobModel = model<IImageJob>("ImageJob", imageJobSchema);
