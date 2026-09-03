import { Schema, model, Document, Types } from "mongoose";

/**
 * One requested variant. Tracked in our own collection because Magnific's
 * task_id is meaningless to us on its own — we need to know which product and
 * which option combination it was generated for.
 */
/**
 * Which stage of the transfer pipeline produced this job.
 *   extract  — donor garment in, isolated motif sheet out
 *   apply    — target garment + motif sheet in, finished garment out
 *   variant  — legacy single-reference product variant
 */
export type ImageJobStage = 'extract' | 'apply' | 'variant';

export interface IImageJob extends Document {
  _id: Types.ObjectId;
  /** Absent for studio jobs, which are not tied to a product. */
  productId?: Types.ObjectId;
  stage: ImageJobStage;
  /** Which garment area an extract job was cropped to, when specified. */
  region?: string;
  /** Groups jobs from one run together so the UI can show the chain. */
  runId: string;
  /** The finished sheet this job consumed, when stage is 'apply'. */
  sourceJobId?: Types.ObjectId;
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
    productId: { type: Schema.Types.ObjectId, ref: 'Product', index: true },
    stage: {
      type: String,
      enum: ['extract', 'apply', 'variant'],
      default: 'variant',
      index: true,
    },
    region: { type: String },
    runId: { type: String, required: true, index: true },
    sourceJobId: { type: Schema.Types.ObjectId, ref: 'ImageJob' },
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
