// v0.66.0 — Bilingual genre prior registry.
//
// A static, hand-curated allow-list of the canonical genres known to host
// Sumerian/Akkadian bilingual editions (interlinear or alternating-line). It
// is used as a *pre-filter* by scripts/build-bilingual-index.mjs so the
// corpus-wide enrichment hits ~4,370 candidate tablets instead of all
// ~36,317 in fragment-metadata.json — an ~88% reduction in eBL API budget.
//
// Coverage was verified against ~/.cache/cuneiform-mcp/fragment-metadata.json
// 2026-05-28 against the canonical genre strings used by eBL. Counts in
// parentheses are observed corpus counts at that time (totals shift as
// enrich_prefix_metadata backfills new prefixes).
//
// NOTE: this is NOT used by detect_bilingual_tablet at decision time —
// that tool relies on per-Word language tags from the live /fragments/{id}
// response and therefore works on ANY tablet regardless of genre. The
// genre prior only narrows the universe for the cache-builder.

/**
 * Canonical genre strings (eBL hierarchy form, " → "-separated) that the
 * scholarly literature flags as the principal hosts of Sumerian/Akkadian
 * bilingual editions. Match exactly against fragment-metadata.json's
 * `genres[]` array. Substring-prefix matching is intentional in callers so
 * variant suffixes (e.g. "Marduk's Address to the Demons (Udugḫul 11)")
 * still hit the parent prior.
 */
export const BILINGUAL_PRIOR_GENRES: readonly string[] = [
  "CANONICAL → Literature → Narrative → Lugal-e",
  "CANONICAL → Literature → Narrative → Angim",
  "CANONICAL → Magic → Exorcistic → Udugḫul",
  "CANONICAL → Magic → Purification → Mīs pî",
  "CANONICAL → Magic → Exorcistic → Šurpu",
  "CANONICAL → Lexicography → Sign list → Diri",
  "CANONICAL → Lexicography → Thematic Word Lists → Ura",
  "CANONICAL → Lexicography → God List → An = Anum",
  "CANONICAL → Lexicography → Acrographic word list → Izi",
  "CANONICAL → Literature → Lamentations",
  "CANONICAL → Literature → Hymns → Divine → Šuʾila",
  "CANONICAL → Magic → Exorcistic → Marduk’s Address to the Demons",
];

/**
 * Test whether a given genre hierarchy string belongs to the bilingual
 * prior. Uses startsWith() so "Marduk's Address to the Demons (Udugḫul 11)"
 * matches the prior entry "Marduk's Address to the Demons" verbatim, and
 * any future subgenre extensions ("Lugal-e Tablet 1", etc.) still land in
 * their parent class.
 */
export function isBilingualPriorGenre(genre: string): boolean {
  if (typeof genre !== "string" || genre.length === 0) return false;
  for (const prior of BILINGUAL_PRIOR_GENRES) {
    if (genre === prior || genre.startsWith(prior)) return true;
  }
  return false;
}

/**
 * Test whether a fragment-metadata record's genres array overlaps the
 * bilingual prior. Returns the first matching prior string (canonical form)
 * for downstream reporting, or null if no prior hits.
 */
export function matchBilingualPriorGenre(
  genres: readonly string[] | undefined | null,
): string | null {
  if (!Array.isArray(genres)) return null;
  for (const g of genres) {
    if (typeof g !== "string") continue;
    for (const prior of BILINGUAL_PRIOR_GENRES) {
      if (g === prior || g.startsWith(prior)) return prior;
    }
  }
  return null;
}
