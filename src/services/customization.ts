/**
 * The validation and pricing engine (§30, §31).
 *
 * One code path serves both entry points in §38's diagram: designing from a
 * garment type, and customizing a pre-designed product. Both hand this module
 * an IOptionConfig[] and a set of chosen option ids; nothing here knows or
 * cares which it came from.
 */

import { Types } from 'mongoose';

import { IOptionConfig } from '@models/optionconfig';
import { IOption, OptionModel } from '@models/option';
import { IOptionGroup, OptionGroupModel } from '@models/optiongroup';
import { IDesignSelection, IPriceBreakdown } from '@models/customdesign';
import { ApiError } from '@utils/apiError';

export interface SelectionInput {
  groupId: string;
  optionId: string;
}

/** A group resolved against the catalog, ready for the frontend to render. */
export interface ResolvedGroup {
  group: IOptionGroup;
  config: IOptionConfig;
  options: IOption[];
  isVisible: boolean;
}

/**
 * Expands configs into the groups and options a customer may actually pick,
 * honouring `allowedOptions` and dropping anything deactivated since.
 */
export async function resolveConfigs(
  configs: IOptionConfig[],
  selections: SelectionInput[] = []
): Promise<ResolvedGroup[]> {
  if (configs.length === 0) return [];

  const groupIds = configs.map((c) => c.groupId);
  const groups = await OptionGroupModel.find({ _id: { $in: groupIds }, isActive: true }).exec();
  const groupMap = new Map(groups.map((g) => [g._id.toString(), g]));

  const options = await OptionModel.find({
    groupId: { $in: groupIds },
    isActive: true,
    isDeleted: false,
  })
    .sort({ position: 1, label: 1 })
    .exec();

  const selectedByGroup = new Map(selections.map((s) => [s.groupId, s.optionId]));

  const resolved: ResolvedGroup[] = [];

  for (const config of [...configs].sort((a, b) => a.position - b.position)) {
    const group = groupMap.get(config.groupId.toString());
    /* Silently skip groups the admin deactivated — better than 500ing a page. */
    if (!group) continue;

    const allowed = config.allowedOptions?.map((id) => id.toString()) ?? [];

    const groupOptions = options.filter((o) => {
      if (o.groupId.toString() !== config.groupId.toString()) return false;
      return allowed.length === 0 || allowed.includes(o._id.toString());
    });

    /**
     * Conditional visibility (§26): a dependent group is hidden until the
     * group it depends on holds one of the triggering options.
     */
    let isVisible = true;
    if (config.dependsOn?.groupId) {
      const parentChoice = selectedByGroup.get(config.dependsOn.groupId.toString());
      isVisible = Boolean(
        parentChoice &&
          config.dependsOn.optionIds.some((id) => id.toString() === parentChoice)
      );
    }

    resolved.push({ group, config, options: groupOptions, isVisible });
  }

  return resolved;
}

/**
 * Rejects anything the product team did not configure. The client is never
 * trusted: an id absent from `allowedOptions`, belonging to another group, or
 * since deactivated, fails here regardless of what the UI showed.
 */
export async function validateSelections(
  configs: IOptionConfig[],
  selections: SelectionInput[]
): Promise<IDesignSelection[]> {
  const resolved = await resolveConfigs(configs, selections);
  const chosen: IDesignSelection[] = [];

  for (const { group, config, options, isVisible } of resolved) {
    const selection = selections.find((s) => s.groupId === config.groupId.toString());

    if (!isVisible) {
      /* A hidden group must not carry a value — it would price something the
         customer was never shown. */
      if (selection) {
        throw ApiError.badRequest(
          `${group.label} does not apply to the options you selected`
        );
      }
      continue;
    }

    if (!selection) {
      if (config.isRequired) throw ApiError.badRequest(`Please select a ${group.label}`);
      continue;
    }

    const option = options.find((o) => o._id.toString() === selection.optionId);
    if (!option) {
      throw ApiError.badRequest(`That ${group.label} option is not available for this design`);
    }

    chosen.push({
      groupId: group._id,
      groupCode: group.code,
      groupLabel: group.label,
      optionId: option._id,
      optionLabel: option.label,
      optionValue: option.value,
      priceModifier: option.priceModifier ?? 0,
    });
  }

  /* Anything sent for a group that isn't configured at all is a client bug. */
  const configuredIds = new Set(configs.map((c) => c.groupId.toString()));
  const stray = selections.find((s) => !configuredIds.has(s.groupId));
  if (stray) throw ApiError.badRequest('One of the selected options is not part of this design');

  return chosen;
}

/**
 * Base + every modifier − discount (§31). The backend is the only source of
 * truth for price; the frontend may estimate, but this figure is what is stored.
 */
export function calculatePrice(
  basePrice: number,
  selections: IDesignSelection[],
  discount = 0,
  currency = 'INR'
): IPriceBreakdown {
  const adjustments = selections
    .filter((s) => s.priceModifier !== 0)
    .map((s) => ({ label: `${s.groupLabel}: ${s.optionLabel}`, amount: s.priceModifier }));

  const total =
    adjustments.reduce((sum, a) => sum + a.amount, basePrice) - discount;

  return {
    basePrice,
    adjustments,
    discount,
    /* Guard against a misconfigured discount producing a negative charge. */
    total: Math.max(total, 0),
    currency,
  };
}

/** Turns preset selections on a product into the engine's input shape. */
export const toSelectionInput = (
  presets: { groupId: Types.ObjectId; optionId: Types.ObjectId }[]
): SelectionInput[] =>
  presets.map((p) => ({ groupId: p.groupId.toString(), optionId: p.optionId.toString() }));
