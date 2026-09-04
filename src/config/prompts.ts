/**
 * Prompt templates for the two-stage motif transfer.
 *
 * Nano Banana caps prompts at 3000 characters, so these are written tight.
 * That turned out to cost nothing: the earlier versions repeated the same
 * instruction five ways, and repetition does not increase compliance. What
 * does the work is the negatives — "do not invent", "do not recolour", "no
 * labels" — and stating which image is which.
 *
 * Keep every template under ~2000 characters so an operator's extra
 * instruction has room to be appended without breaching the cap.
 */

/** Hard ceiling imposed by the provider. */
export const MAX_PROMPT_CHARS = 3000;

/** Which part of a garment a single extraction call is looking at. */
export type MotifRegion = "neckline" | "sleeve" | "hem" | "placket" | "motif";

const REGION_LABEL: Record<MotifRegion, string> = {
  neckline: "neckline border",
  sleeve: "sleeve or cuff border",
  hem: "hem border",
  placket: "vertical placket border",
  motif: "standalone embroidered motif",
};

/** Shared fidelity rules — the part that actually changes model behaviour. */
const FIDELITY = [
  "Do not design, redesign, recreate, interpret, improve, simplify or invent.",
  "Remove ALL garment fabric: ignore its colour, texture, weave, sheen, folds,",
  "wrinkles and shadows. No fabric may remain attached to or behind the",
  "embroidery.",
  "Keep only actual embroidery: thread, stitching, metallic thread, zari,",
  "zardozi, sequins, beads, pearls, stones, crystals and appliqué.",
  "Preserve the original colours exactly — do not convert anything to gold or",
  "silver, do not recolour. White, silver, pastel and multicolour must stay as",
  "they are.",
  "Preserve exact motif shapes, proportions, spacing, repetition, thread",
  "density and bead, sequin and stone placement.",
  "Do not mirror, do not make symmetrical, do not extend. If part is hidden or",
  "cropped, do not invent it.",
  "No labels, text, numbers, product codes, logos or watermarks.",
  "Pure flat white background. No garment, mannequin, model or shadows.",
  "Fidelity to the source matters more than presentation. When uncertain,",
  "preserve less rather than invent more.",
].join(" ");

/** Whole-garment extraction from a single photograph. */
export const EXTRACT_MOTIFS_PROMPT = [
  "IMAGE EXTRACTION TASK. The reference image shows a garment with embroidery.",
  "Extract only the embroidery that is visibly present on it.",
  FIDELITY,
  "Lay each element out flat, unfolded and front-facing, separated by clear",
  "space. Keep physically separate elements separate.",
].join(" ");

/** One cropped border — the most faithful mode when you want just the neckline. */
export const extractRegionPrompt = (region: MotifRegion) =>
  [
    `IMAGE EXTRACTION TASK. The reference image is a close-up crop of the`,
    `${REGION_LABEL[region]} of a garment.`,
    "Extract only the embroidery visible in this crop.",
    FIDELITY,
    "Output exactly ONE piece: the single continuous border or motif visible",
    "here, laid flat, unfolded and front-facing. Do not produce multiple pieces,",
    "a collection, a sheet, a catalogue layout, diamond patches or swatches.",
  ].join(" ");

/** One uploaded view of the donor garment, with what it shows. */
export interface DonorView {
  label: string;
}

/**
 * Several photographs of the SAME garment.
 *
 * The load-bearing sentence is that these are one garment: without it the model
 * duplicates every border that appears in two photographs.
 */
export const extractFromViewsPrompt = (views: DonorView[]) =>
  [
    "IMAGE EXTRACTION TASK.",
    `The ${views.length} reference images are photographs of the SAME single`,
    "garment from different angles:",
    views.map((view, i) => `image ${i + 1} shows the ${view.label}`).join("; ") + ".",
    "These are ONE garment, not several. Where the same border appears in more",
    "than one photograph, extract it ONCE, using whichever view shows it most",
    "clearly. Extract every distinct embroidered element across all images.",
    FIDELITY,
    "Lay each element out flat, unfolded and front-facing, separated by clear",
    "space. Keep physically separate elements separate.",
  ].join(" ");

/** Shared rules for applying a sheet to a garment. */
const APPLY_RULES = [
  "Apply the motifs to the matching areas of the garment, following its seams",
  "and curvature so the trim sits naturally on the cloth.",
  "Preserve the embroidery exactly as it appears on the sheet: original",
  "colours, motif shapes, thread density and bead, sequin and stone placement.",
  "Do not recolour the embroidery to match the garment. Do not assume it is",
  "metallic. Do not redesign, simplify or redraw any motif — the sheet is the",
  "sole source of truth for the trim.",
  "Do not change the garment's colour or neckline shape. No jewellery,",
  "accessories, model or different background.",
  "Studio product photograph, plain neutral background, full garment in frame.",
].join(" ");

/** Stage 2 with a single sheet. */
export const applyMotifsPrompt = (extra?: string) =>
  [
    "The FIRST reference image is the base garment photograph. Keep its",
    "resolution, crop, pose, lighting, fabric colour, fabric texture and",
    "silhouette completely unaltered.",
    "The SECOND reference image is an embroidery motif sheet. Use only its",
    "motifs; ignore its white background.",
    APPLY_RULES,
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");

/** Stage 2 with several named sheets — neckline, cuff, hem. */
export const applyMotifSheetsPrompt = (sheetLabels: string[], extra?: string) =>
  [
    "The FIRST reference image is the base garment photograph. Keep its",
    "resolution, crop, pose, lighting, fabric colour, fabric texture and",
    "silhouette completely unaltered.",
    `The next ${sheetLabels.length} reference images are embroidery motif sheets:`,
    sheetLabels.map((label, i) => `image ${i + 2} is the ${label}`).join("; ") + ".",
    "Use only their motifs; ignore their white backgrounds. Place each on the",
    "garment area its label names.",
    APPLY_RULES,
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
