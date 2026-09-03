/**
 * Prompt templates for the two-stage motif transfer.
 *
 * Stage 1:
 * Extract ONLY the visible embroidery from the donor garment.
 *
 * Stage 2:
 * Apply the extracted embroidery to the target garment without changing
 * the target garment itself.
 */

/**
 * Stage 1 — extract embroidery from donor garment.
 *
 * IMPORTANT:
 * This prompt intentionally avoids asking the model to "design", "recreate",
 * "improve", or "complete" the embroidery.
 *
 * The reference image is the source of truth.
 */
export const EXTRACT_MOTIFS_PROMPT = [
  // ============================================================
  // PRIMARY TASK
  // ============================================================

  "TASK: Extract only the embroidery and decorative stitched work visible on the garment in the reference image.",

  "The reference image is the ONLY source of truth.",

  "This is an extraction task, NOT a design task.",

  "Do not create a new embroidery design.",
  "Do not redesign the embroidery.",
  "Do not reinterpret the embroidery.",
  "Do not beautify the embroidery.",
  "Do not simplify the embroidery.",
  "Do not improve the embroidery.",
  "Do not complete the embroidery.",
  "Do not invent embroidery that is not visible.",

  // ============================================================
  // WHAT COUNTS AS EMBROIDERY
  // ============================================================

  "Identify every visible embroidered or attached decorative element.",

  "Embroidery can be ANY colour.",
  "Preserve the actual colour of every embroidered element exactly as visible.",

  "This includes embroidery thread, metallic thread, zari, zardozi,",
  "sequins, beads, pearls, stones, rhinestones, crystals, appliqué,",
  "corded embroidery, stitched borders, embroidered tapes, floral motifs,",
  "paisley motifs, vines, leaves, flowers, geometric motifs and ornamental motifs.",

  // ============================================================
  // COLOUR
  // ============================================================

  "Do not assume that embroidery is gold or silver.",

  "Preserve every original embroidery colour.",
  "Gold must remain gold.",
  "Silver must remain silver.",
  "White must remain white.",
  "Red must remain red.",
  "Pink must remain pink.",
  "Blue must remain blue.",
  "Green must remain green.",
  "Black must remain black.",
  "Multicolour embroidery must remain multicolour.",

  "Never recolour the embroidery.",
  "Never convert coloured embroidery into metallic embroidery.",
  "Never convert metallic embroidery into another colour.",

  // ============================================================
  // REMOVE GARMENT FABRIC
  // ============================================================

  "Remove the garment fabric completely from the extracted embroidery.",

  "The garment fabric is irrelevant and must NOT be included in the output.",

  "Ignore the garment's colour, weave, texture, sheen, transparency,",
  "wrinkles, folds, shadows and fabric surface.",

  "Do not include blue, pink, red, green, black, white, beige or any other",
  "garment fabric underneath the embroidery.",

  "Do not reproduce pieces of garment fabric as if they were embroidery.",

  "The extracted pieces must contain embroidery only.",

  // ============================================================
  // EXACT FIDELITY
  // ============================================================

  "Preserve the exact visible embroidery from the source image.",

  "Preserve the exact motif shapes.",
  "Preserve the exact proportions.",
  "Preserve the exact spacing.",
  "Preserve the exact repetition.",
  "Preserve the exact thread density.",
  "Preserve the exact stitch density.",
  "Preserve the exact stitch direction.",
  "Preserve the exact outlines.",
  "Preserve the exact sequin placement.",
  "Preserve the exact bead placement.",
  "Preserve the exact pearl placement.",
  "Preserve the exact stone and rhinestone placement.",
  "Preserve the exact decorative details.",

  "Do not add details that are not visible in the reference.",

  // ============================================================
  // DO NOT ALTER GEOMETRY
  // ============================================================

  "Do not stretch the embroidery.",
  "Do not compress the embroidery.",
  "Do not rotate the embroidery unnecessarily.",
  "Do not mirror the embroidery.",
  "Do not make left and right pieces artificially symmetrical.",
  "Do not regularize irregular handmade embroidery.",
  "Do not straighten naturally curved embroidery unless required only to isolate it.",

  // ============================================================
  // VISIBILITY / OCCLUSION
  // ============================================================

  "Extract only what is actually visible in the reference image.",

  "If embroidery is partially hidden by a fold, sleeve, hand, mannequin,",
  "shadow, another garment part or image cropping, do not invent the hidden portion.",

  "If only part of a motif is visible, extract only the visible part.",

  "Do not hallucinate missing embroidery.",

  // ============================================================
  // PIECE SEPARATION
  // ============================================================

  "Keep physically distinct embroidery pieces separate.",

  "Do not merge unrelated embroidery pieces into one new design.",

  "Do not split a continuous embroidery border into arbitrary pieces.",

  "Preserve the actual structure and continuity of each visible embroidery piece.",

  // ============================================================
  // COMPONENTS
  // ============================================================

  "Identify and separate the visible embroidery according to its actual location on the garment.",

  "Extract the neckline embroidery as its own piece when present.",

  "Extract each distinct sleeve or cuff embroidery piece separately when present.",

  "Extract each distinct vertical body embroidery strip separately when present.",

  "Extract the hem embroidery as its own continuous piece when present.",

  "Extract standalone embroidered motifs separately when present.",

  "If a category does not exist in the source image, do not create one.",

  // ============================================================
  // PRESENTATION
  // ============================================================

  "Place the extracted embroidery pieces on a pure white background.",

  "Show each piece clearly and separately.",

  "Keep every piece front-facing and fully visible where the source permits.",

  "Do not place the embroidery on a mannequin.",
  "Do not show a person.",
  "Do not show the original garment.",
  "Do not show garment fabric.",

  "Do not create a fashion photograph.",

  // ============================================================
  // NO GENERATION ARTIFACTS
  // ============================================================

  "Do not create text.",
  "Do not create labels.",
  "Do not create numbers.",
  "Do not create letters.",
  "Do not create logos.",
  "Do not create watermarks.",
  "Do not create measurement markings.",

  // ============================================================
  // MOST IMPORTANT FINAL CONSTRAINT
  // ============================================================

  "SOURCE-FAITHFUL EXTRACTION: reproduce only embroidery that visibly exists in the reference image.",

  "The output must be an isolated embroidery reference sheet, not a newly designed embroidery sheet.",

  "Visual fidelity to the source is more important than composition, symmetry or aesthetics.",
].join(" ");


/**
 * Stage 2 — apply extracted embroidery to target garment.
 *
 * Reference order:
 *   FIRST  = target/base garment
 *   SECOND = extracted embroidery sheet
 */
export const applyMotifsPrompt = (extra?: string) =>
  [
    // ============================================================
    // REFERENCE ROLES
    // ============================================================

    "The FIRST reference image is the target/base garment.",

    "The SECOND reference image is the extracted embroidery source.",

    "The target garment and embroidery source have different roles.",
    "Do not confuse the garment with the embroidery source.",

    // ============================================================
    // TARGET GARMENT — LOCK STRUCTURE
    // ============================================================

    "Use the FIRST reference image as the exact structural source for the garment.",

    "Preserve the garment's original silhouette.",
    "Preserve the garment's original neckline shape.",
    "Preserve the garment's original sleeve shape.",
    "Preserve the garment's original cuff shape.",
    "Preserve the garment's original hem shape.",
    "Preserve the garment's original length.",
    "Preserve the garment's original proportions.",
    "Preserve the garment's original seams.",
    "Preserve the garment's original construction.",

    "Do not redesign the garment.",
    "Do not change the cut.",
    "Do not change the fit.",
    "Do not change the neckline.",
    "Do not change the sleeve construction.",
    "Do not change the hemline.",
    "Do not add or remove garment panels.",

    // ============================================================
    // FABRIC — LOCK
    // ============================================================

    "Preserve the target garment's original fabric colour.",
    "Preserve the target garment's original fabric texture.",
    "Preserve the target garment's original sheen.",
    "Preserve the target garment's original folds and drape.",

    "Do not recolour the garment.",
    "Do not replace the garment fabric.",
    "Do not change the fabric type.",

    // ============================================================
    // EMBROIDERY SOURCE
    // ============================================================

    "Use ONLY the embroidery visible in the SECOND reference image.",

    "Ignore the white background of the embroidery source.",

    "Do not use the background of the embroidery source as part of the garment.",

    "Do not create additional embroidery.",

    "Do not invent missing embroidery.",

    "Do not redesign the embroidery.",

    "Do not simplify the embroidery.",

    "Do not reinterpret the embroidery.",

    // ============================================================
    // COLOUR PRESERVATION
    // ============================================================

    "Preserve the embroidery's original colours exactly.",

    "Do not recolour the embroidery to match the garment.",

    "Do not convert embroidery to gold.",
    "Do not convert embroidery to silver.",
    "Do not remove coloured embroidery.",

    "If the embroidery is multicolour, preserve all visible colours.",
    "If the embroidery is monochrome, preserve that monochrome colour.",
    "If the embroidery contains metallic and non-metallic colours, preserve both.",

    // ============================================================
    // DETAIL PRESERVATION
    // ============================================================

    "Preserve the exact motif shapes from the embroidery source.",

    "Preserve the exact thread density.",
    "Preserve the exact stitch appearance.",
    "Preserve the exact sequin placement.",
    "Preserve the exact bead placement.",
    "Preserve the exact pearl placement.",
    "Preserve the exact stone placement.",
    "Preserve the exact decorative details.",

    "Do not add decorative details that do not exist in the embroidery source.",

    // ============================================================
    // PLACEMENT
    // ============================================================

    "Apply the extracted embroidery to the corresponding garment locations.",

    "Place neckline embroidery only around the existing neckline.",
    "Place sleeve or cuff embroidery only on the corresponding sleeve or cuff areas.",
    "Place vertical embroidery only where the corresponding vertical embroidery exists.",
    "Place hem embroidery only along the existing hem.",

    "Follow the existing garment seams and natural fabric curvature.",

    "The embroidery should conform naturally to the garment surface without",
    "changing the garment's underlying shape.",

    // ============================================================
    // DO NOT DUPLICATE / INVENT
    // ============================================================

    "Do not duplicate a motif unless duplication is visibly present in the embroidery source.",

    "Do not mirror a motif merely to make the garment symmetrical.",

    "Do not extend embroidery into areas where it does not exist in the source.",

    "Do not create new borders to fill empty areas.",

    // ============================================================
    // CLEAN OUTPUT
    // ============================================================

    "Do not add jewellery.",
    "Do not add accessories.",
    "Do not add buttons unless they already exist on the target garment.",
    "Do not add a different garment.",
    "Do not add another person.",
    "Do not change the background unnecessarily.",

    extra ?? "",

    // ============================================================
    // FINAL PRIORITY
    // ============================================================

    "The FIRST image controls the garment.",
    "The SECOND image controls the embroidery.",
    "Do not let the embroidery source change the garment silhouette.",
    "Do not let the garment source change the embroidery design.",

    "The final image must look like the SAME target garment with the SAME extracted embroidery accurately applied to it.",
  ]
    .filter(Boolean)
    .join(" ");

/** Which part of a garment a single extraction call is looking at. */
export type MotifRegion = "neckline" | "sleeve" | "hem" | "placket" | "motif";

const REGION_LABEL: Record<MotifRegion, string> = {
  neckline: "neckline border",
  sleeve: "sleeve or cuff border",
  hem: "hem border",
  placket: "vertical placket border",
  motif: "standalone embroidered motif",
};

/**
 * Single-region extraction.
 *
 * Asking for one piece from a cropped photo, rather than four pieces from a
 * whole garment, removes the two things that were producing invented output:
 *
 *   - "arrange several pieces on a sheet" invites a catalogue layout, and the
 *     model has seen thousands of trim-supplier catalogues
 *   - trim occupying 5% of a full-garment frame gives the model almost nothing
 *     to read, so it falls back on its priors
 *
 * Crop to the region, ask for that region alone, run it once per region.
 */
export const extractRegionPrompt = (region: MotifRegion) =>
  [
    "IMAGE EXTRACTION TASK.",

    `The reference image is a close-up crop of the ${REGION_LABEL[region]} of a`,
    "garment.",

    "Extract ONLY the embroidery that is visibly present in this crop.",

    "DO NOT DESIGN. DO NOT REDESIGN. DO NOT RECREATE. DO NOT INTERPRET.",
    "DO NOT IMPROVE. DO NOT SIMPLIFY. DO NOT COMPLETE. DO NOT INVENT.",

    "REMOVE ALL GARMENT FABRIC. The fabric may be any colour — ignore its",
    "colour, texture, weave, shine, folds, wrinkles, shadows and drape.",
    "No fabric of any colour may remain attached to or behind the embroidery.",

    "Retain only pixels belonging to the actual visible embroidery: thread,",
    "stitching, metallic thread, zari, zardozi, sequins, beads, pearls, stones,",
    "crystals, rhinestones and appliqué.",

    "PRESERVE THE ORIGINAL EMBROIDERY COLOURS. Do not convert the embroidery to",
    "gold or silver. Do not recolour it. If it is white, silver, pastel or",
    "monochrome, keep it exactly that.",

    "PRESERVE THE ORIGINAL DESIGN: exact motif shapes, proportions, spacing,",
    "repetition, thread density, stitch density and bead, sequin, pearl and",
    "stone placement.",

    "Do not mirror. Do not make anything symmetrical. Do not extend. Do not",
    "create missing portions. If part of the embroidery is hidden, cropped or",
    "unclear, DO NOT INVENT IT.",

    "Output exactly ONE piece: the single continuous embroidered border or motif",
    "visible in this crop, laid flat, unfolded and front-facing.",

    "Do not produce multiple pieces. Do not produce a collection, a sheet, a",
    "catalogue layout, diamond patches or square swatches.",

    "Do not create labels, text, numbers, product codes, logos or watermarks.",

    "Place it on a pure flat white background with no garment, mannequin, model",
    "or fabric visible.",

    "SOURCE FIDELITY IS MORE IMPORTANT THAN PRESENTATION. When uncertain,",
    "preserve less rather than invent more.",
  ].join(" ");
