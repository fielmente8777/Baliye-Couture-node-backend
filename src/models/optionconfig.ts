import { Schema, Types } from 'mongoose';

/**
 * How one option group behaves in one context — a garment type, or a
 * customizable product. Shared by both so the validation and pricing engine has
 * a single shape to work against (§38: both entry points feed one
 * Customization layer).
 */
export interface IOptionConfig {
  groupId: Types.ObjectId;
  /** Display order in the stepper; lets the dashboard reorder steps (§24). */
  position: number;
  /** Customer must choose before continuing (§25). */
  isRequired: boolean;
  /**
   * Empty means "every active option in this group". Populated restricts the
   * product to a subset — a Patiala Suit offering only three lower types.
   */
  allowedOptions: Types.ObjectId[];
  defaultOption?: Types.ObjectId;
  /**
   * Show this group only when another group's selection matches (§26).
   * One level deep by design: "Sleeve = Full Sleeve reveals Cuff" is the real
   * requirement, and arbitrary nesting turns this into a rules engine.
   */
  dependsOn?: {
    groupId: Types.ObjectId;
    optionIds: Types.ObjectId[];
  };
}

export const optionConfigSchema = new Schema<IOptionConfig>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'OptionGroup', required: true },
    position: { type: Number, default: 0 },
    isRequired: { type: Boolean, default: false },
    allowedOptions: [{ type: Schema.Types.ObjectId, ref: 'Option' }],
    defaultOption: { type: Schema.Types.ObjectId, ref: 'Option' },
    dependsOn: {
      type: {
        groupId: { type: Schema.Types.ObjectId, ref: 'OptionGroup' },
        optionIds: [{ type: Schema.Types.ObjectId, ref: 'Option' }],
      },
      default: undefined,
    },
  },
  { _id: false }
);
