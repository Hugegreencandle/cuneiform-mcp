// v0.20.0 — Curated period-to-chronology helper for trace_chunk_diffusion.
//
// Source-of-truth priority for ordering tablets chronologically:
//   1. FragmentScript.sortKey from src/fragmentMetadata.ts (eBL-curated).
//   2. Curated map below, keyed on period name as eBL returns it.
//   3. Unknown periods sort to the end (sentinel Infinity).
//
// The curated map keeps this module self-contained — chunkDiffusion can call
// getPeriodInfo() / comparePeriods() without first hitting fragment metadata
// for every host. Callers MAY pass a script.sortKey when available; if
// supplied, it short-circuits the map lookup.
//
// Approximate BCE bounds are pedagogical — periods overlap in historiography
// and these values are not author-cited dates. They're used only for ordering
// and span-years approximations in the diffusion output. Anyone needing
// precise dating should pull script.period directly from fragmentMetadata.

export type PeriodInfo = {
  name: string;
  approx_start_bce: number; // earliest possible (positive number; BCE)
  approx_end_bce: number;   // latest possible (positive number; BCE)
  sort_key: number;         // monotonic; older periods sort lower
};

// Curated ordering. sort_key matches order-of-attestation chronology; values
// are arbitrary positives that increase monotonically. Approximate BCE
// bounds are conventional textbook ranges.
const PERIOD_MAP: Record<string, PeriodInfo> = {
  "Ur III": { name: "Ur III", approx_start_bce: 2112, approx_end_bce: 2004, sort_key: 100 },
  "Early Old Babylonian": { name: "Early Old Babylonian", approx_start_bce: 2003, approx_end_bce: 1900, sort_key: 150 },
  "Old Babylonian": { name: "Old Babylonian", approx_start_bce: 1900, approx_end_bce: 1595, sort_key: 200 },
  "Old Assyrian": { name: "Old Assyrian", approx_start_bce: 1950, approx_end_bce: 1750, sort_key: 210 },
  "Middle Babylonian": { name: "Middle Babylonian", approx_start_bce: 1595, approx_end_bce: 1000, sort_key: 300 },
  "Middle Assyrian": { name: "Middle Assyrian", approx_start_bce: 1400, approx_end_bce: 1050, sort_key: 310 },
  "Middle Elamite": { name: "Middle Elamite", approx_start_bce: 1500, approx_end_bce: 1100, sort_key: 320 },
  "Neo-Assyrian": { name: "Neo-Assyrian", approx_start_bce: 911, approx_end_bce: 612, sort_key: 400 },
  "Neo-Babylonian": { name: "Neo-Babylonian", approx_start_bce: 626, approx_end_bce: 539, sort_key: 500 },
  "Persian": { name: "Persian", approx_start_bce: 539, approx_end_bce: 331, sort_key: 600 },
  "Achaemenid": { name: "Achaemenid", approx_start_bce: 539, approx_end_bce: 331, sort_key: 610 },
  "Late Babylonian": { name: "Late Babylonian", approx_start_bce: 539, approx_end_bce: 100, sort_key: 650 },
  "Hellenistic": { name: "Hellenistic", approx_start_bce: 331, approx_end_bce: 141, sort_key: 700 },
  "Seleucid": { name: "Seleucid", approx_start_bce: 312, approx_end_bce: 64, sort_key: 710 },
  "Parthian": { name: "Parthian", approx_start_bce: 247, approx_end_bce: -224, sort_key: 800 },
  "Sasanian": { name: "Sasanian", approx_start_bce: -224, approx_end_bce: -651, sort_key: 900 },
};

/**
 * Resolve a period name (as eBL returns it) to a PeriodInfo. Returns null if
 * the name is not in the curated map. Callers SHOULD prefer an eBL-supplied
 * script.sortKey for ordering when available — see comparePeriods below.
 */
export function getPeriodInfo(periodName: string | null | undefined): PeriodInfo | null {
  if (!periodName) return null;
  const direct = PERIOD_MAP[periodName];
  if (direct) return direct;
  // Best-effort case-insensitive lookup for minor casing drift.
  const lower = periodName.toLowerCase();
  for (const [key, info] of Object.entries(PERIOD_MAP)) {
    if (key.toLowerCase() === lower) return info;
  }
  return null;
}

/**
 * Compare two periods by chronology. Returns negative if a is older than b,
 * zero if same or both unknown, positive if a is younger. Unknown periods
 * sort to the end (treated as +Infinity).
 */
export function comparePeriods(a: string | null, b: string | null): number {
  const ka = periodSortKey(a);
  const kb = periodSortKey(b);
  if (ka === kb) return 0;
  return ka < kb ? -1 : 1;
}

/**
 * Return a numeric sort_key for a period name. Unknown → Infinity (sorts last).
 */
export function periodSortKey(periodName: string | null | undefined): number {
  const info = getPeriodInfo(periodName);
  return info ? info.sort_key : Number.POSITIVE_INFINITY;
}
