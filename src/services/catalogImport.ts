/**
 * Bulk import of the Design Builder catalogue from the client's spreadsheet
 * (services/catalogSheet.ts reads the file).
 *
 * Two phases. `plan` reads every row against the catalogue as it stands and
 * works out each change by name — `<step code>/<option value>` for options,
 * the slug for garments — so the preview can show everything, step rules
 * included, without writing. `apply` then saves through the same functions
 * the admin screens use (services/adminCatalog.ts), so Shopify-owned fields
 * are written to Shopify too.
 *
 * Nothing is applied while any row has an error, rows never delete anything,
 * and running the same sheet twice changes nothing the second time — so a
 * failure part-way through is fixed by uploading the sheet again.
 */

import { Types } from 'mongoose';
import { logger } from '@config/logger';
import { GarmentTypeModel, IGarmentType } from '@models/garmenttype';
import { OptionGroupModel, IOptionGroup, OptionInputType } from '@models/optiongroup';
import { OptionModel, IOption } from '@models/option';
import { MeasurementTemplateModel } from '@models/measurementtemplate';
import { IOptionConfig } from '@models/optionconfig';
import { ApiError } from '@utils/apiError';
import * as catalog from './adminCatalog';
import { FAMILIES, ParsedSheets, buildWorkbook } from './catalogSheet';

/* ---- Report --------------------------------------------------------------- */

export interface RowResult {
  row: number;
  name: string;
  action: 'create' | 'update' | 'unchanged' | 'error';
  changes: string[];
  errors: string[];
}

export interface ImportReport {
  applied: boolean;
  garments: RowResult[];
  options: RowResult[];
  newSteps: string[];
  /** Measurement fields the sheet names that the site doesn't have yet; added on import. */
  newMeasurements: string[];
  /** Steps, required steps, option limits and step conditions, per garment. */
  rules: { garment: string; changes: string[] }[];
  warnings: string[];
  errorCount: number;
}

/* ---- Helpers -------------------------------------------------------------- */

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const stepCode = (label: string) => catalog.slugify(label).replace(/-/g, '_');
const list = (cell: string) => cell.split(/[|,;\n]/).map((s) => s.trim()).filter(Boolean);
const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function parsePrice(cell: string, errors: string[], column: string): number | undefined {
  if (!cell) return undefined;
  const n = Number(cell.replace(/[₹,\s]|rs\.?|inr/gi, ''));
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${column} "${cell}" is not a price in rupees`);
    return undefined;
  }
  return Math.round(n * 100);
}

function parseYesNo(cell: string, errors: string[]): boolean | undefined {
  if (!cell) return undefined;
  const v = norm(cell);
  if (['yes', 'y', 'true', '1', 'show', 'visible'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'hide', 'hidden'].includes(v)) return false;
  errors.push(`show_on_website "${cell}" should be yes or no`);
  return undefined;
}

function tooLong(value: string, max: number, column: string, errors: string[]) {
  if (value.length > max) errors.push(`${column} is ${value.length} characters; the most is ${max}`);
}

/* ---- Plan ----------------------------------------------------------------- */

interface PlannedOption {
  result: RowResult;
  key: string;
  code: string;
  label: string;
  existing?: IOption;
  fields: { label?: string; priceModifier?: number; description?: string; hex?: string; isActive?: boolean };
  /** Option keys in other steps; resolved after every row is read. */
  pairs: string[];
  /** Garment slugs; null = every garment with this step. */
  onlyFor: string[] | null;
  rawOnlyWith: string;
  rawOnlyFor: string;
}

interface PlannedGarment {
  result: RowResult;
  slug: string;
  existing?: IGarmentType;
  fields: {
    name?: string;
    family?: IGarmentType['family'];
    basePrice?: number;
    description?: string;
    isActive?: boolean;
  };
  /** Measurement field names, existing or new; ids are looked up when saving. */
  measurements?: string[];
  steps?: string[];
  required?: string[];
}

/** A garment step with option ids swapped for keys, so new options can be planned for. */
interface KeyConfig {
  code: string;
  isRequired: boolean;
  allowed: string[] | null;
  defaultKey?: string;
  dependsOn?: { code: string; keys: string[] };
}

interface Plan {
  report: ImportReport;
  newSteps: Map<string, { label: string; hasHex: boolean }>;
  newMeasurements: Map<string, string>;
  options: PlannedOption[];
  garments: PlannedGarment[];
  configs: Map<string, KeyConfig[]>;
}

async function plan(sheets: ParsedSheets): Promise<Plan> {
  const [garmentDocs, groupDocs, optionDocs, templateDocs] = await Promise.all([
    GarmentTypeModel.find({ isDeleted: false }).sort({ position: 1, name: 1 }).exec(),
    OptionGroupModel.find().exec(),
    OptionModel.find({ isDeleted: false }).exec(),
    MeasurementTemplateModel.find().exec(),
  ]);

  const report: ImportReport = { applied: false, garments: [], options: [], newSteps: [], newMeasurements: [], rules: [], warnings: [], errorCount: 0 };
  if (sheets.ignoredColumns.length) {
    report.warnings.push(`Ignored columns: ${sheets.ignoredColumns.join(', ')}. Pictures are uploaded under Missing pictures.`);
  }

  /* Steps */
  const groupByCode = new Map(groupDocs.map((g) => [g.code, g]));
  const groupByLabel = new Map(groupDocs.map((g) => [norm(g.label), g]));
  const codeById = new Map(groupDocs.map((g) => [g._id.toString(), g.code]));
  const newSteps = new Map<string, { label: string; hasHex: boolean }>();
  const labelOf = (code: string) => groupByCode.get(code)?.label ?? newSteps.get(code)?.label ?? code;
  const findStep = (name: string) => {
    const g = groupByLabel.get(norm(name)) ?? groupByCode.get(stepCode(name));
    if (g) return g.code;
    const code = stepCode(name);
    return newSteps.has(code) ? code : undefined;
  };

  /* Options, by key */
  const keyOf = (o: IOption) => `${codeById.get(o.groupId.toString())}/${o.value}`;
  const optionByKey = new Map(optionDocs.map((o) => [keyOf(o), o]));
  const keyById = new Map(optionDocs.map((o) => [o._id.toString(), keyOf(o)]));
  const toKeys = (ids: Types.ObjectId[] = []) =>
    ids.map((id) => keyById.get(id.toString())).filter((k): k is string => Boolean(k));

  /* ---- Options sheet ---- */
  const options: PlannedOption[] = [];
  const seenOption = new Map<string, number>();

  for (const { row, values } of sheets.options) {
    const step = values.step ?? '';
    const name = values.option_name ?? '';
    const result: RowResult = { row, name: [step, name].filter(Boolean).join(' › '), action: 'unchanged', changes: [], errors: [] };
    report.options.push(result);
    const errors = result.errors;

    if (!step) errors.push('step is empty');
    if (!name) errors.push('option_name is empty');
    tooLong(name, 80, 'option_name', errors);
    tooLong(step, 80, 'step', errors);
    const value = catalog.slugify(name);
    if (name && !value) errors.push('option_name needs letters or numbers');
    if (!step || !value) continue;

    let code = findStep(step);
    if (!code) {
      code = stepCode(step);
      if (!code) {
        errors.push('step needs letters or numbers');
        continue;
      }
      newSteps.set(code, { label: step.trim(), hasHex: false });
    }

    const key = `${code}/${value}`;
    if (seenOption.has(key)) errors.push(`same option as row ${seenOption.get(key)}`);
    seenOption.set(key, row);

    const priceModifier = parsePrice(values.extra_price_inr ?? '', errors, 'extra_price_inr');
    const isActive = parseYesNo(values.show_on_website ?? '', errors);
    const description = values.description || undefined;
    if (description) tooLong(description, 500, 'description', errors);

    let hex: string | undefined;
    if (values.colour_hex) {
      hex = (values.colour_hex.startsWith('#') ? values.colour_hex : `#${values.colour_hex}`).toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex)) errors.push(`colour_hex "${values.colour_hex}" should look like #722F37`);
      const created = newSteps.get(code);
      if (created) created.hasHex = true;
    }

    const existing = optionByKey.get(key);
    const label = name.trim();
    const fields: PlannedOption['fields'] = {};

    if (existing) {
      if (existing.label !== label) {
        fields.label = label;
        result.changes.push(`name "${existing.label}" → "${label}"`);
      }
      if (priceModifier !== undefined && priceModifier !== existing.priceModifier) {
        fields.priceModifier = priceModifier;
        result.changes.push(`price ${inr(existing.priceModifier)} → ${inr(priceModifier)}`);
      }
      if (description !== undefined && description !== (existing.description ?? '')) {
        fields.description = description;
        result.changes.push('description');
      }
      if (hex && hex !== existing.hex?.toLowerCase()) {
        fields.hex = hex;
        result.changes.push(`colour ${existing.hex ?? 'none'} → ${hex}`);
      }
      if (isActive !== undefined && isActive !== existing.isActive) {
        fields.isActive = isActive;
        result.changes.push(isActive ? 'shown on website' : 'hidden from website');
      }
    } else {
      Object.assign(fields, { label, priceModifier: priceModifier ?? 0, description, hex, isActive: isActive ?? true });
      result.action = 'create';
      result.changes.push(`${inr(priceModifier ?? 0)} extra${isActive === false ? ', hidden' : ''}`);
    }

    options.push({
      result,
      key,
      code,
      label,
      existing,
      fields,
      pairs: [],
      onlyFor: null,
      rawOnlyWith: values.only_with ?? '',
      rawOnlyFor: values.only_for_garments ?? '',
    });
  }

  /* ---- Garments sheet ---- */
  const garmentBySlug = new Map(garmentDocs.map((g) => [g.slug, g]));
  const templateByName = new Map(templateDocs.map((t) => [norm(t.name), t]));
  const templateNameById = new Map(templateDocs.map((t) => [t._id.toString(), t.name]));
  const newMeasurements = new Map<string, string>();
  const garments: PlannedGarment[] = [];
  const seenGarment = new Map<string, number>();

  for (const { row, values } of sheets.garments) {
    const name = values.garment_name ?? '';
    const result: RowResult = { row, name, action: 'unchanged', changes: [], errors: [] };
    report.garments.push(result);
    const errors = result.errors;

    if (name.trim().length < 2) errors.push('garment_name needs at least 2 characters');
    tooLong(name, 100, 'garment_name', errors);
    const slug = catalog.slugify(name);
    if (!slug) continue;
    if (seenGarment.has(slug)) errors.push(`same garment as row ${seenGarment.get(slug)}`);
    seenGarment.set(slug, row);

    const existing = garmentBySlug.get(slug);
    const basePrice = parsePrice(values.starting_price_inr ?? '', errors, 'starting_price_inr');
    if (!existing && basePrice === undefined && !values.starting_price_inr) errors.push('starting_price_inr is needed for a new garment');
    const isActive = parseYesNo(values.show_on_website ?? '', errors);
    const description = values.description || undefined;
    if (description) tooLong(description, 1000, 'description', errors);

    let family: IGarmentType['family'] | undefined;
    if (values.family) {
      const f = norm(values.family).replace(/[\s_]+/g, '-');
      if ((FAMILIES as readonly string[]).includes(f)) family = f as IGarmentType['family'];
      else errors.push(`family "${values.family}" should be ${FAMILIES.join(', ')}`);
    }

    let steps: string[] | undefined;
    if (values.steps_in_order) {
      steps = [];
      for (const s of list(values.steps_in_order)) {
        const code = findStep(s);
        if (!code) errors.push(`step "${s}" has no options on the Options sheet and is not on the site`);
        else if (steps.includes(code)) errors.push(`step "${s}" is listed twice`);
        else steps.push(code);
      }
    }

    let required: string[] | undefined;
    if (values.required_steps) {
      const available = steps ?? (existing?.optionConfigs ?? []).map((c) => codeById.get(c.groupId.toString()) ?? '');
      required = [];
      for (const s of list(values.required_steps)) {
        const code = findStep(s);
        if (!code || !available.includes(code)) errors.push(`required step "${s}" is not one of this garment's steps`);
        else required.push(code);
      }
    }

    let measurements: string[] | undefined;
    if (values.measurement_fields) {
      measurements = [];
      for (const m of list(values.measurement_fields)) {
        tooLong(m, 60, 'measurement_fields', errors);
        const name = templateByName.get(norm(m))?.name ?? newMeasurements.get(norm(m)) ?? m;
        if (!templateByName.has(norm(m))) newMeasurements.set(norm(m), name);
        if (!measurements.includes(name)) measurements.push(name);
      }
    }

    const fields: PlannedGarment['fields'] = {};
    const label = name.trim();

    if (existing) {
      if (existing.name !== label) {
        fields.name = label;
        result.changes.push(`name "${existing.name}" → "${label}"`);
      }
      if (family && family !== existing.family) {
        fields.family = family;
        result.changes.push(`family ${existing.family} → ${family}`);
      }
      if (basePrice !== undefined && basePrice !== existing.basePrice) {
        fields.basePrice = basePrice;
        result.changes.push(`price ${inr(existing.basePrice)} → ${inr(basePrice)}`);
      }
      if (description !== undefined && description !== (existing.description ?? '')) {
        fields.description = description;
        result.changes.push('description');
      }
      if (isActive !== undefined && isActive !== existing.isActive) {
        fields.isActive = isActive;
        result.changes.push(isActive ? 'shown on website' : 'hidden from website');
      }
      const current = existing.measurementTemplates.map((id) => templateNameById.get(id.toString()) ?? '');
      if (measurements && !sameSet(current, measurements)) {
        result.changes.push(`measurements: ${measurements.join(', ')}`);
      }
    } else {
      Object.assign(fields, {
        name: label,
        family: family ?? 'indian',
        basePrice,
        description,
        isActive: isActive ?? false,
      });
      result.action = 'create';
      result.changes.push(`from ${inr(basePrice ?? 0)}, ${isActive ? 'visible' : 'hidden until switched on'}`);
    }

    garments.push({ result, slug, existing, fields, measurements, steps, required });
  }

  /* ---- Cross references: only_with and only_for_garments ---- */
  const garmentSlugByName = new Map<string, string>();
  for (const g of garmentDocs) {
    garmentSlugByName.set(norm(g.name), g.slug);
    garmentSlugByName.set(g.slug, g.slug);
  }
  for (const g of garments) garmentSlugByName.set(norm(g.fields.name ?? g.existing?.name ?? g.slug), g.slug);

  /* Every option after the import: label and step, for resolving names. */
  const allOptions = new Map<string, { code: string; label: string }>();
  for (const [key, o] of optionByKey) allOptions.set(key, { code: key.split('/')[0], label: o.label });
  for (const o of options) allOptions.set(o.key, { code: o.code, label: o.label });

  for (const o of options) {
    const errors = o.result.errors;

    for (const ref of list(o.rawOnlyWith)) {
      /* "Neck Type: V Neck" names the step when an option name is in two steps. */
      const colon = ref.indexOf(':');
      const stepPart = colon > 0 ? findStep(ref.slice(0, colon)) : undefined;
      const optionName = norm(stepPart ? ref.slice(colon + 1) : ref);
      const matches = [...allOptions].filter(
        ([, v]) => norm(v.label) === optionName && v.code !== o.code && (!stepPart || v.code === stepPart)
      );
      if (!matches.length) errors.push(`only_with "${ref}" is not an option in another step`);
      else if (matches.length > 1) {
        errors.push(
          `only_with "${ref}" is in ${matches.map(([, v]) => labelOf(v.code)).join(' and ')}; write it as "Step: ${ref}"`
        );
      } else o.pairs.push(matches[0][0]);
    }

    if (o.rawOnlyFor) {
      o.onlyFor = [];
      if (norm(o.rawOnlyFor) !== 'none') {
        for (const g of list(o.rawOnlyFor)) {
          const slug = garmentSlugByName.get(norm(g)) ?? garmentSlugByName.get(catalog.slugify(g));
          if (slug) o.onlyFor.push(slug);
          else errors.push(`only_for_garments "${g}" is not a garment on the site or the Garments sheet`);
        }
      }
    }

    const before = o.existing ? toKeys(o.existing.pairsWith) : [];
    if (!sameSet(before, o.pairs)) {
      o.result.changes.push(
        o.pairs.length ? `only with ${o.pairs.map((k) => allOptions.get(k)?.label).join(', ')}` : 'offered with any choice'
      );
    }
  }

  for (const r of [...report.options, ...report.garments]) {
    if (r.errors.length) r.action = 'error';
    else if (r.action === 'unchanged' && r.changes.length) r.action = 'update';
  }
  report.errorCount = [...report.options, ...report.garments].reduce((n, r) => n + r.errors.length, 0);
  report.newSteps = [...newSteps.values()].map((s) => s.label);
  report.newMeasurements = [...newMeasurements.values()];

  const result: Plan = { report, newSteps, newMeasurements, options, garments, configs: new Map() };
  if (report.errorCount) return result;

  /* ---- Garment steps and rules, worked out by key ---- */

  /* Each step's options after the import. */
  const byStep = new Map<string, { all: Set<string>; active: Set<string> }>();
  const stepOptions = (code: string) => {
    if (!byStep.has(code)) byStep.set(code, { all: new Set(), active: new Set() });
    return byStep.get(code)!;
  };
  const pairsOf = new Map<string, string[]>();
  for (const [key, o] of optionByKey) {
    const s = stepOptions(key.split('/')[0]);
    s.all.add(key);
    if (o.isActive) s.active.add(key);
    pairsOf.set(key, toKeys(o.pairsWith));
  }
  for (const o of options) {
    const s = stepOptions(o.code);
    s.all.add(o.key);
    const active = o.fields.isActive ?? o.existing?.isActive ?? true;
    if (active) s.active.add(o.key);
    else s.active.delete(o.key);
    pairsOf.set(o.key, o.pairs);
  }

  const sheetOptionsByStep = new Map<string, PlannedOption[]>();
  for (const o of options) sheetOptionsByStep.set(o.code, [...(sheetOptionsByStep.get(o.code) ?? []), o]);

  const toKeyConfig = (c: IOptionConfig): KeyConfig => ({
    code: codeById.get(c.groupId.toString()) ?? '',
    isRequired: c.isRequired,
    allowed: c.allowedOptions?.length ? toKeys(c.allowedOptions) : null,
    defaultKey: c.defaultOption ? keyById.get(c.defaultOption.toString()) : undefined,
    dependsOn: c.dependsOn?.groupId
      ? { code: codeById.get(c.dependsOn.groupId.toString()) ?? '', keys: toKeys(c.dependsOn.optionIds) }
      : undefined,
  });

  const plannedBySlug = new Map(garments.map((g) => [g.slug, g]));
  const allSlugs = [...new Set([...garmentDocs.map((g) => g.slug), ...garments.map((g) => g.slug)])];
  const usedFor = new Map<string, Set<string>>();

  for (const slug of allSlugs) {
    const doc = garmentBySlug.get(slug);
    const planned = plannedBySlug.get(slug);
    const before = [...(doc?.optionConfigs ?? [])].sort((a, b) => a.position - b.position).map(toKeyConfig);
    let after: KeyConfig[] = before.map((c) => ({ ...c, allowed: c.allowed && [...c.allowed] }));

    if (planned?.steps) {
      after = planned.steps.map((code) => after.find((c) => c.code === code) ?? { code, isRequired: false, allowed: null });
    }
    if (planned?.required) for (const c of after) c.isRequired = planned.required.includes(c.code);

    after.forEach((c, index) => {
      const rows = sheetOptionsByStep.get(c.code);
      if (!rows) return;
      const universe = stepOptions(c.code).all;

      /* only_for_garments: each row includes or excludes itself, nothing else. */
      const excluded = rows.filter((o) => o.onlyFor && !o.onlyFor.includes(slug));
      let allowed = c.allowed ? new Set(c.allowed) : null;
      if (!allowed && excluded.length) allowed = new Set(universe);
      if (allowed) {
        rows.forEach((o) => allowed!.add(o.key));
        excluded.forEach((o) => allowed!.delete(o.key));
        c.allowed = [...universe].every((k) => allowed!.has(k)) ? null : [...allowed].filter((k) => universe.has(k));
      }
      rows.filter((o) => o.onlyFor?.includes(slug)).forEach((o) => usedFor.set(o.key, (usedFor.get(o.key) ?? new Set()).add(slug)));

      if (c.defaultKey && c.allowed && !c.allowed.includes(c.defaultKey)) c.defaultKey = undefined;

      /* Every offered option only_with the same earlier step → the step waits for it. */
      const offered = [...(c.allowed ?? universe)].filter((k) => stepOptions(c.code).active.has(k));
      const pairedSteps = new Set(offered.flatMap((k) => (pairsOf.get(k) ?? []).map((p) => p.split('/')[0])));
      const allPaired = offered.length > 0 && offered.every((k) => (pairsOf.get(k) ?? []).length > 0);
      const [parent] = [...pairedSteps];
      if (allPaired && pairedSteps.size === 1 && after.slice(0, index).some((p) => p.code === parent)) {
        c.dependsOn = { code: parent, keys: [...new Set(offered.flatMap((k) => pairsOf.get(k) ?? []))] };
      }
    });

    /* A step can't wait on a step the garment no longer has before it. */
    after.forEach((c, index) => {
      if (c.dependsOn && !after.slice(0, index).some((p) => p.code === c.dependsOn!.code)) c.dependsOn = undefined;
    });

    result.configs.set(slug, after);

    /* Describe what changed for the preview. */
    const name = planned?.fields.name ?? doc?.name ?? slug;
    const changes: string[] = [];
    const order = (cs: KeyConfig[]) => cs.map((c) => labelOf(c.code)).join(' → ');
    if (order(before) !== order(after)) changes.push(`steps: ${order(after) || 'none'}`);
    const req = (cs: KeyConfig[]) => cs.filter((c) => c.isRequired).map((c) => labelOf(c.code)).join(', ');
    if (req(before) !== req(after)) changes.push(`required: ${req(after) || 'none'}`);
    for (const c of after) {
      const old = before.find((b) => b.code === c.code);
      const label = labelOf(c.code);
      if (old && !sameSet(old.allowed ?? [], c.allowed ?? [])) {
        changes.push(c.allowed ? `${label}: offers ${c.allowed.length} of ${stepOptions(c.code).all.size} options` : `${label}: offers every option`);
      }
      if (c.dependsOn && (!old?.dependsOn || !sameSet(old.dependsOn.keys, c.dependsOn.keys) || old.dependsOn.code !== c.dependsOn.code)) {
        changes.push(`${label}: shown only after ${c.dependsOn.keys.map((k) => allOptions.get(k)?.label).join(' or ')}`);
      }
      if (!old && c.allowed) changes.push(`${label}: offers ${c.allowed.length} of ${stepOptions(c.code).all.size} options`);
    }
    if (before.some((b) => b.dependsOn) && !after.some((c) => c.dependsOn)) changes.push('no step waits on another now');
    if (changes.length) {
      report.rules.push({ garment: name, changes });
      if (planned && planned.result.action === 'unchanged') {
        planned.result.action = 'update';
        planned.result.changes.push('steps or rules (see below)');
      }
    }
  }

  for (const o of options) {
    const missing = (o.onlyFor ?? []).filter((slug) => !usedFor.get(o.key)?.has(slug));
    if (missing.length) {
      const names = missing.map((slug) => plannedBySlug.get(slug)?.fields.name ?? garmentBySlug.get(slug)?.name ?? slug);
      report.warnings.push(`${o.label} (row ${o.result.row}) is for ${names.join(', ')}, which has no ${labelOf(o.code)} step.`);
    }
  }

  return result;
}

/* ---- Apply ---------------------------------------------------------------- */

const inputTypeFor = (label: string, hasHex: boolean): OptionInputType =>
  hasHex ? 'color_select' : /^sizes?$/i.test(label.trim()) ? 'size_select' : 'single_select';

async function apply(p: Plan) {
  let step = '';
  try {
    await catalog.withEntryCache(async () => {
      const lastGroup = await OptionGroupModel.findOne().sort({ position: -1 }).exec();
      let groupPosition = (lastGroup?.position ?? 0) + 1;
      for (const [, s] of p.newSteps) {
        step = `new step ${s.label}`;
        await catalog.createGroup({ label: s.label, inputType: inputTypeFor(s.label, s.hasHex), position: groupPosition++ });
      }

      const groups = await OptionGroupModel.find().exec();
      const groupIdByCode = new Map(groups.map((g: IOptionGroup) => [g.code, g._id.toString()]));

      /* New options go after the step's existing ones, in sheet order. */
      const nextPosition = new Map<string, number>();
      for (const o of p.options) {
        step = `Options row ${o.result.row}`;
        if (o.existing) {
          if (Object.keys(o.fields).length) await catalog.updateOption(o.existing._id.toString(), o.fields);
          continue;
        }
        const groupId = groupIdByCode.get(o.code)!;
        if (!nextPosition.has(o.code)) {
          const last = await OptionModel.findOne({ groupId, isDeleted: false }).sort({ position: -1 }).exec();
          nextPosition.set(o.code, (last?.position ?? -1) + 1);
        }
        const position = nextPosition.get(o.code)!;
        nextPosition.set(o.code, position + 1);
        await catalog.createOption(groupId, { ...o.fields, label: o.label, position });
      }

      /* Ids for every key, now that new options exist. */
      step = 'option pairing';
      const codeById = new Map(groups.map((g) => [g._id.toString(), g.code]));
      const optionDocs = await OptionModel.find({ isDeleted: false }).exec();
      const idOf = new Map(optionDocs.map((o) => [`${codeById.get(o.groupId.toString())}/${o.value}`, o._id]));
      const ids = (keys: string[]) => keys.map((k) => idOf.get(k)).filter((id): id is Types.ObjectId => Boolean(id));

      for (const o of p.options) {
        const id = idOf.get(o.key);
        const current = optionDocs.find((d) => d._id.equals(id))?.pairsWith.map(String) ?? [];
        const next = ids(o.pairs);
        if (id && !sameSet(current, next.map(String))) await OptionModel.updateOne({ _id: id }, { pairsWith: next }).exec();
      }

      step = 'new measurement fields';
      const lastTemplate = await MeasurementTemplateModel.findOne().sort({ displayOrder: -1 }).exec();
      let displayOrder = (lastTemplate?.displayOrder ?? 0) + 1;
      for (const name of p.newMeasurements.values()) {
        await MeasurementTemplateModel.create({ name, unit: 'in', displayOrder: displayOrder++ });
      }
      const templates = await MeasurementTemplateModel.find().exec();
      const templateIdByName = new Map(templates.map((t) => [norm(t.name), t._id]));
      const measurementIds = (names?: string[]) =>
        names?.map((n) => templateIdByName.get(norm(n))).filter((id): id is Types.ObjectId => Boolean(id));

      const lastGarment = await GarmentTypeModel.findOne({ isDeleted: false }).sort({ position: -1 }).exec();
      let garmentPosition = (lastGarment?.position ?? 0) + 1;
      for (const g of p.garments) {
        step = `Garments row ${g.result.row}`;
        const measurementTemplates = measurementIds(g.measurements);
        const current = g.existing?.measurementTemplates.map(String) ?? [];
        const measurementsChanged = measurementTemplates && !sameSet(current, measurementTemplates.map(String));
        if (g.existing) {
          const fields = { ...g.fields, ...(measurementsChanged ? { measurementTemplates } : {}) };
          if (Object.keys(fields).length) await catalog.updateGarment(g.existing._id.toString(), fields);
        } else {
          await catalog.createGarment({
            ...g.fields,
            measurementTemplates: measurementTemplates ?? [],
            name: g.fields.name!,
            basePrice: g.fields.basePrice ?? 0,
            position: garmentPosition++,
          });
        }
      }

      /* Steps and rules: MongoDB only. */
      step = 'garment steps';
      for (const [slug, configs] of p.configs) {
        const garment = await GarmentTypeModel.findOne({ slug, isDeleted: false }).exec();
        if (!garment) continue;
        const next: IOptionConfig[] = configs.map((c, position) => ({
          groupId: new Types.ObjectId(groupIdByCode.get(c.code)),
          position,
          isRequired: c.isRequired,
          allowedOptions: c.allowed ? ids(c.allowed) : [],
          ...(c.defaultKey && idOf.get(c.defaultKey) ? { defaultOption: idOf.get(c.defaultKey) } : {}),
          ...(c.dependsOn && groupIdByCode.get(c.dependsOn.code)
            ? { dependsOn: { groupId: new Types.ObjectId(groupIdByCode.get(c.dependsOn.code)), optionIds: ids(c.dependsOn.keys) } }
            : {}),
        }));
        const serial = (cs: IOptionConfig[]) =>
          JSON.stringify(cs.map((c) => [String(c.groupId), c.isRequired, c.allowedOptions.map(String).sort(), String(c.defaultOption ?? ''), c.dependsOn ? [String(c.dependsOn.groupId), c.dependsOn.optionIds.map(String).sort()] : null]));
        const current = [...garment.optionConfigs].sort((a, b) => a.position - b.position);
        if (serial(current) !== serial(next)) {
          await GarmentTypeModel.updateOne({ _id: garment._id }, { optionConfigs: next }).exec();
        }
      }
    });
  } catch (err) {
    logger.error({ err, step }, 'Design catalogue import stopped');
    const reason = err instanceof Error ? err.message : String(err);
    throw ApiError.badRequest(
      `Import stopped at ${step}: ${reason}. Everything before it was saved; fix the problem and upload the same sheet again to finish.`
    );
  }
}

/* ---- Entry points --------------------------------------------------------- */

let running = false;

export async function importCatalog(sheets: ParsedSheets, { dryRun }: { dryRun: boolean }): Promise<ImportReport> {
  if (!sheets.garments.length && !sheets.options.length) throw ApiError.badRequest('The sheet has no rows to import');
  if (running) throw ApiError.conflict('Another import is running. Try again in a minute.');

  running = true;
  try {
    const p = await plan(sheets);
    if (dryRun || p.report.errorCount) return p.report;
    await apply(p);
    p.report.applied = true;
    logger.info(
      { garments: p.report.garments.length, options: p.report.options.length, newSteps: p.report.newSteps },
      'Design catalogue imported from sheet'
    );
    return p.report;
  } finally {
    running = false;
  }
}

/**
 * The workbook to send the client: blank, or filled with the catalogue as it
 * stands so they can edit it. A filled sheet uploaded unchanged changes nothing.
 */
export async function catalogWorkbook({ filled }: { filled: boolean }): Promise<Buffer> {
  const templates = await MeasurementTemplateModel.find().sort({ displayOrder: 1, name: 1 }).exec();
  const measurementNames = templates.map((t) => t.name);
  if (!filled) return buildWorkbook({ garments: [], options: [], measurementNames });

  const [garments, groups, options] = await Promise.all([
    GarmentTypeModel.find({ isDeleted: false }).sort({ position: 1, name: 1 }).exec(),
    OptionGroupModel.find().sort({ position: 1, label: 1 }).exec(),
    OptionModel.find({ isDeleted: false }).sort({ position: 1, label: 1 }).exec(),
  ]);

  const groupById = new Map(groups.map((g) => [g._id.toString(), g]));
  const templateById = new Map(templates.map((t) => [t._id.toString(), t.name]));
  const optionById = new Map(options.map((o) => [o._id.toString(), o]));
  const labelCount = new Map<string, number>();
  for (const o of options) labelCount.set(norm(o.label), (labelCount.get(norm(o.label)) ?? 0) + 1);

  const garmentRows = garments.map((g) => {
    const configs = [...g.optionConfigs].sort((a, b) => a.position - b.position);
    const stepLabel = (c: IOptionConfig) => groupById.get(c.groupId.toString())?.label ?? '';
    return {
      garment_name: g.name,
      family: g.family,
      starting_price_inr: g.basePrice / 100,
      description: g.description ?? '',
      steps_in_order: configs.map(stepLabel).join('|'),
      required_steps: configs.filter((c) => c.isRequired).map(stepLabel).join('|'),
      measurement_fields: g.measurementTemplates.map((id) => templateById.get(id.toString())).filter(Boolean).join('|'),
      show_on_website: g.isActive ? 'yes' : 'no',
    };
  });

  const optionRows = groups.flatMap((group) =>
    options
      .filter((o) => o.groupId.equals(group._id))
      .map((o) => {
        /* Garments with this step, and which of them offer this option. */
        const withStep = garments.filter((g) => g.optionConfigs.some((c) => c.groupId.equals(group._id)));
        const offering = withStep.filter((g) => {
          const c = g.optionConfigs.find((cfg) => cfg.groupId.equals(group._id))!;
          return !c.allowedOptions.length || c.allowedOptions.some((id) => id.equals(o._id));
        });
        const pairs = o.pairsWith
          .map((id) => optionById.get(id.toString()))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) =>
            (labelCount.get(norm(p.label)) ?? 0) > 1 ? `${groupById.get(p.groupId.toString())?.label}: ${p.label}` : p.label
          );
        return {
          step: group.label,
          option_name: o.label,
          extra_price_inr: o.priceModifier / 100,
          colour_hex: o.hex ?? '',
          description: o.description ?? '',
          only_with: pairs.join('|'),
          only_for_garments:
            offering.length === withStep.length ? '' : offering.length ? offering.map((g) => g.name).join('|') : 'none',
          show_on_website: o.isActive ? 'yes' : 'no',
        };
      })
  );

  return buildWorkbook({ garments: garmentRows, options: optionRows, measurementNames });
}

