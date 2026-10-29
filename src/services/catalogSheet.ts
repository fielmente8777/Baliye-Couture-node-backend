/**
 * The Design Builder spreadsheet: one workbook the client fills in and the
 * admin uploads (services/catalogImport.ts reads it into the catalogue).
 *
 * Pure: no database. Columns are defined once here and used for the blank
 * template, the "current catalogue" export and reading uploads, so the three
 * can never drift apart. CSV files with the same headers are read too.
 */

import ExcelJS from 'exceljs';
import { ApiError } from '@utils/apiError';

export const FAMILIES = ['indian', 'western', 'indo-western'] as const;

type Column = { key: string; header: string; width: number; note: string };

export const GARMENT_COLUMNS: Column[] = [
  { key: 'garment_name', header: 'garment_name', width: 22, note: 'Required. The garment as customers see it, e.g. Kurti. A name already on the site updates that garment.' },
  { key: 'family', header: 'family', width: 14, note: 'indian, western or indo-western. Blank = indian for a new garment.' },
  { key: 'starting_price_inr', header: 'starting_price_inr', width: 18, note: 'Required for a new garment. Rupees, numbers only, e.g. 1299.' },
  { key: 'description', header: 'description', width: 40, note: 'One or two sentences shown on the garment card.' },
  { key: 'steps_in_order', header: 'steps_in_order', width: 50, note: 'Every step for this garment, in order, separated by | e.g. Fabric|Colour|Neck Type|Size. Each step needs its options on the Options sheet (or already on the site).' },
  { key: 'required_steps', header: 'required_steps', width: 34, note: 'Steps the customer must choose before checkout, separated by |. Others are optional.' },
  { key: 'measurement_fields', header: 'measurement_fields', width: 46, note: 'Measurements to ask for, separated by |, using the names in the admin (Measurements), e.g. Bust|Waist|Hip.' },
  { key: 'show_on_website', header: 'show_on_website', width: 16, note: 'yes or no. Blank = no for a new garment, so it can be checked first.' },
];

export const OPTION_COLUMNS: Column[] = [
  { key: 'step', header: 'step', width: 16, note: 'Required. The step this option belongs to, e.g. Fabric, Neck Type, Dupatta. A new name creates a new step.' },
  { key: 'option_name', header: 'option_name', width: 26, note: 'Required. What the customer picks, e.g. Chanderi. A name already in that step updates it.' },
  { key: 'extra_price_inr', header: 'extra_price_inr', width: 15, note: 'Rupees added to the garment price when chosen. Blank = 0 for a new option.' },
  { key: 'colour_hex', header: 'colour_hex', width: 12, note: 'Colour steps only: the swatch colour, e.g. #722F37.' },
  { key: 'description', header: 'description', width: 40, note: 'Optional short line shown under the option.' },
  { key: 'only_with', header: 'only_with', width: 30, note: 'Offer this option only when the customer has chosen one of these options in an earlier step, separated by |, e.g. Round Neck|Boat Neck. Blank = always offered.' },
  { key: 'only_for_garments', header: 'only_for_garments', width: 30, note: 'Offer this option only on these garments, separated by |, e.g. Anarkali|Sharara Set. Blank = every garment with this step. "none" = no garment.' },
  { key: 'show_on_website', header: 'show_on_website', width: 16, note: 'yes or no. Blank = yes for a new option.' },
];

export type SheetRow = { row: number; values: Record<string, string> };

export interface ParsedSheets {
  garments: SheetRow[];
  options: SheetRow[];
  /** Columns present in the file that the importer does not read. */
  ignoredColumns: string[];
}

/* ---- Reading -------------------------------------------------------------- */

const normaliseHeader = (h: string) =>
  h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Display text of an ExcelJS cell, whatever kind of value it holds. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
    if ('text' in value) return String(value.text);
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('error' in value) return '';
  }
  return String(value);
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type Table = { name: string; header: string[]; rows: { row: number; cells: string[] }[] };

/** Which sheet a table is, from its headers, so file and tab names don't matter. */
function kindOf(header: string[]): 'garments' | 'options' | null {
  if (header.includes('garment_name')) return 'garments';
  if (header.includes('option_name') && header.includes('step')) return 'options';
  return null;
}

function toRows(table: Table, columns: Column[], ignored: Set<string>): SheetRow[] {
  const known = new Set(columns.map((c) => c.key));
  table.header.forEach((h) => h && !known.has(h) && ignored.add(h));

  return table.rows
    .map(({ row, cells }) => {
      const values: Record<string, string> = {};
      table.header.forEach((h, i) => {
        if (known.has(h)) values[h] = (cells[i] ?? '').trim();
      });
      return { row, values };
    })
    .filter((r) => Object.values(r.values).some(Boolean));
}

export async function parseSheets(files: { originalname: string; buffer: Buffer }[]): Promise<ParsedSheets> {
  const tables: Table[] = [];

  for (const file of files) {
    const name = file.originalname;
    if (/\.csv$/i.test(name)) {
      const [header = [], ...rest] = parseCsv(file.buffer.toString('utf8').replace(/^﻿/, ''));
      tables.push({
        name,
        header: header.map(normaliseHeader),
        rows: rest.map((cells, i) => ({ row: i + 2, cells })),
      });
    } else if (/\.xlsx$/i.test(name)) {
      const book = new ExcelJS.Workbook();
      try {
        await book.xlsx.load(file.buffer as unknown as ArrayBuffer);
      } catch {
        throw ApiError.badRequest(`"${name}" could not be opened as an Excel file`);
      }
      book.eachSheet((sheet) => {
        const header: string[] = [];
        sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
          header[col - 1] = normaliseHeader(cellText(cell.value));
        });
        const rows: Table['rows'] = [];
        sheet.eachRow((r, n) => {
          if (n === 1) return;
          rows.push({ row: n, cells: header.map((_, i) => cellText(r.getCell(i + 1).value)) });
        });
        tables.push({ name: `${name} › ${sheet.name}`, header, rows });
      });
    } else {
      throw ApiError.badRequest(`"${name}" is not an .xlsx or .csv file`);
    }
  }

  const ignored = new Set<string>();
  const garments: SheetRow[] = [];
  const options: SheetRow[] = [];
  let found = 0;

  for (const table of tables) {
    const kind = kindOf(table.header);
    if (kind === 'garments') garments.push(...toRows(table, GARMENT_COLUMNS, ignored));
    if (kind === 'options') options.push(...toRows(table, OPTION_COLUMNS, ignored));
    if (kind) found += 1;
  }

  if (!found) {
    throw ApiError.badRequest(
      'No Garments or Options sheet found. The first row must be the headers from the template (garment_name… or step, option_name…).'
    );
  }

  return { garments, options, ignoredColumns: [...ignored] };
}

/* ---- Writing -------------------------------------------------------------- */

const BRAND = 'FF7A1F2B';
const yesNo = ['"yes,no"'];

function addDataSheet(
  book: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: Record<string, string | number>[],
  validations: Record<string, string[]>
) {
  const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ key: c.key, header: c.header, width: c.width }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.height = 20;
  columns.forEach((c, i) => {
    header.getCell(i + 1).note = c.note;
  });

  rows.forEach((r) => sheet.addRow(r));

  /* Dropdowns on the first few hundred rows; typing a value still works. */
  const last = Math.max(rows.length + 200, 300);
  columns.forEach((c, i) => {
    const list = validations[c.key];
    if (!list) return;
    for (let n = 2; n <= last; n++) {
      sheet.getCell(n, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: list };
    }
  });
  sheet.getColumn(columns.findIndex((c) => c.key === 'description') + 1).alignment = { wrapText: true, vertical: 'top' };
}

/** Plain lines, '# ' headings, or [label, text] rows. */
const GUIDE: (string | [string, string])[] = [
  'Design Builder sheet',
  '',
  'This file adds or updates the garments and choices in "Create your own design" in one go.',
  'Fill in the Garments and Options tabs, then send the file back. Nothing goes live until it is uploaded in the admin panel, which shows a preview of every change first.',
  '',
  '# How it works',
  ['Garments tab', 'One row per garment (Kurti, Anarkali…). steps_in_order lists the steps the customer goes through, in order.'],
  ['Options tab', 'One row per choice inside a step (Fabric → Cotton, Chanderi…). The step name must match the one used in steps_in_order.'],
  ['Matching', 'Names already on the website update what is there. New names are added. Nothing is ever deleted by this sheet: to remove something, set show_on_website to no.'],
  ['Blank cells', 'On an existing garment or option, a blank price, description, colour or show_on_website is left as it is.'],
  ['Lists', 'Separate several names with | (a comma also works), e.g. Fabric|Colour|Size.'],
  ['Prices', 'In rupees, numbers only: 1299, not ₹1,299.'],
  ['Pictures', 'Pictures are not part of this sheet. Send them in a folder named after each garment or option (e.g. "Chanderi.jpg"); they are uploaded in the admin under Missing pictures.'],
  ['Column help', 'Hover over a column heading (the small red corner) to see what it expects.'],
  '',
  '# Rules you can set',
  ['Step only after a choice', 'If every option in a step has only_with pointing at options in one earlier step, the whole step only appears after one of those is chosen. Example: Plain Cuff and Embroidered Cuff both say only_with = Full Sleeve, so the Sleeve Cuff step shows only after Full Sleeve.'],
  ['Option only after a choice', 'only_with on a single option: Zari V Border with only_with = V Neck only appears when V Neck was picked.'],
  ['Option only on some garments', 'only_for_garments: Georgette with Anarkali|Sharara Set is not offered on a Kurti.'],
  '',
  '# Example rows',
  ['Garments', 'Kurti | indian | 1299 | A versatile kurti… | Fabric|Colour|Neck Type|Sleeve Type|Length|Size | Fabric|Colour|Neck Type|Size | Bust|Waist|Hip|Shoulder|Sleeve Length|Kurta Length | yes'],
  ['Options', 'Fabric | Georgette | 250 | | Flowing and light. | | Anarkali|Sharara Set | yes'],
  ['Options', 'Colour | Wine | 0 | #722F37 | | | | yes'],
  ['Options', 'Sleeve Cuff | Embroidered Cuff | 250 | | | Full Sleeve | | yes'],
];

function addGuide(book: ExcelJS.Workbook, measurementNames: string[]) {
  const sheet = book.addWorksheet('How to fill');
  sheet.columns = [{ width: 30 }, { width: 110 }];

  const lines = [...GUIDE];
  if (measurementNames.length) {
    lines.push('', '# Measurement names on the site', ['measurement_fields', measurementNames.join(' | ')]);
  }

  lines.forEach((line, i) => {
    const row = sheet.getRow(i + 1);
    if (typeof line === 'string') {
      const heading = line.startsWith('# ');
      row.getCell(1).value = heading ? line.slice(2) : line;
      if (i === 0) row.font = { bold: true, size: 16, color: { argb: BRAND } };
      else if (heading) row.font = { bold: true, size: 12, color: { argb: BRAND } };
    } else {
      row.getCell(1).value = line[0];
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = line[1];
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    }
  });
}

export async function buildWorkbook(data: {
  garments: Record<string, string | number>[];
  options: Record<string, string | number>[];
  measurementNames: string[];
}): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Baliye Couture admin';

  addGuide(book, data.measurementNames);
  addDataSheet(book, 'Garments', GARMENT_COLUMNS, data.garments, {
    family: [`"${FAMILIES.join(',')}"`],
    show_on_website: yesNo,
  });
  addDataSheet(book, 'Options', OPTION_COLUMNS, data.options, { show_on_website: yesNo });

  return Buffer.from(await book.xlsx.writeBuffer());
}
