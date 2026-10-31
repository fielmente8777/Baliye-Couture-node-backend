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
 * The steps in the order the Design Builder set, exactly as the stepper shows
 * them (CreateDesignShell.tsx), so both agree on "earlier". Pairing works
 * both ways, so any order is valid: Embroidery before Neck narrows the necks
 * to the embroidery's, Embroidery after Neck narrows the embroidery list.
 */
function stepOrder(configs: IOptionConfig[]) {
  return [...configs].sort((a, b) => a.position - b.position);
}

/** `option`'s pairs that are options of the step `groupId`. */
const pairsIn = (option: IOption, groupId: string, groupOf: Map<string, string>) =>
  (option.pairsWith ?? []).map(String).filter((id) => groupOf.get(id) === groupId);

/**
 * Pairing (`pairsWith`, e.g. an embroidery's neck, sleeve, lower and colour).
 * It works both ways and follows the step order: an option is offered only if
 * it suits every choice made in an earlier step. A suits B when A's pairs in
 * B's step (if it has any there) include B, and B's pairs in A's step include
 * A. So Colour and Neck, before Embroidery, narrow the embroidery list; the
 * chosen embroidery then narrows Sleeve, Length, Lower and Dupatta, after it.
 * Each step is checked on its own, so the neck and the sleeve must both fit.
 *
 * A later step with no choice yet hides nothing, except that an option whose
 * pairs in a later step are all missing from this garment is dropped — the
 * customer could never finish it (an embroidery for a salwar, on a sharara).
 * Pairs pointing at deactivated or deleted options are ignored.
 *
 * Mirrored by `isOptionAvailable` in the stepper (CreateDesignShell.tsx).
 */
function isPairable(
  option: IOption,
  earlier: IOption[],
  later: string[],
  offered: Map<string, Set<string>>,
  groupOf: Map<string, string>
) {
  const own = option.groupId.toString();
  for (const chosen of earlier) {
    const mine = pairsIn(option, chosen.groupId.toString(), groupOf);
    if (mine.length && !mine.includes(chosen._id.toString())) return false;
    const theirs = pairsIn(chosen, own, groupOf);
    if (theirs.length && !theirs.includes(option._id.toString())) return false;
  }
  return later.every((gid) => {
    const mine = pairsIn(option, gid, groupOf);
    return mine.length === 0 || mine.some((id) => offered.get(gid)?.has(id));
  });
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

  const ordered = stepOrder(configs);
  const rankOf = new Map(ordered.map((c, i) => [c.groupId.toString(), i]));

  /* What each step offers on this garment before pairing. */
  const offered = new Map<string, Set<string>>();
  for (const config of ordered) {
    const allowed = config.allowedOptions?.map((id) => id.toString()) ?? [];
    const gid = config.groupId.toString();
    offered.set(
      gid,
      new Set(
        options
          .filter((o) => o.groupId.toString() === gid && (allowed.length === 0 || allowed.includes(o._id.toString())))
          .map((o) => o._id.toString())
      )
    );
  }

  const optionById = new Map<string, IOption>(options.map((o) => [o._id.toString(), o]));
  const groupOf = new Map(options.map((o) => [o._id.toString(), o.groupId.toString()]));
  const selectedBefore = (rank: number) =>
    selections
      .filter((s) => (rankOf.get(s.groupId) ?? Infinity) < rank)
      .map((s) => optionById.get(s.optionId))
      .filter((o): o is IOption => Boolean(o));

  const resolved: ResolvedGroup[] = [];

  for (const config of ordered) {
    const group = groupMap.get(config.groupId.toString());
    /* Silently skip groups the admin deactivated — better than 500ing a page. */
    if (!group) continue;

    const gid = config.groupId.toString();
    const rank = rankOf.get(gid) ?? 0;
    const earlier = selectedBefore(rank);
    const later = ordered.slice(rank + 1).map((c) => c.groupId.toString());

    const groupOptions = options.filter((o) => {
      if (!offered.get(gid)?.has(o._id.toString())) return false;
      return isPairable(o, earlier, later, offered, groupOf);
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
