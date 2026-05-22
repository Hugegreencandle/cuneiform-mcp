// v0.18.15 — Genre-cohort anchor-tablet discovery within a prefix.
//
// Within a (prefix, genre) cohort, surface the "anchor tablets" — those that
// are simultaneously LARGE (high sign_count) and HIGHLY CONNECTED (most other
// tablets in the cohort point to them via fuzzy parallels). These are the
// canonical-template candidates: the surviving witnesses that other fragments
// are likely copies of, derived from, or paraphrases against.
//
// Motivation: the methods paper's BM.77056 cluster surfaced K.15325 as the
// Mīs pî anchor for prefix K — the largest, most-connected witness, the one
// every other K Mīs pî fragment pointed back to. Finding that anchor required
// hand-iterating fuzzy parallels across the cohort and counting reciprocal
// hits. This tool answers the question in a single call: "within prefix X +
// genre Y, give me the anchor witnesses ranked by canonical-template
// plausibility."
//
// Algorithm:
//   1. Filter getAllTabletRecords() to: matches prefix + has fragment metadata
//      whose genres match the pattern + sign_count >= min_sign_count
//   2. For each candidate, call findFuzzyParallels(topK=15, minJ=0.20)
//   3. Count how many returned parallels are ALSO in the cohort set =
//      intra_cohort_degree (the cohort-internal connectivity of this candidate)
//   4. anchor_score = sqrt(sign_count) × intra_cohort_degree.
//      Square-root the size term so a 5000-sign tablet doesn't simply dominate
//      every cohort by mass; degree multiplies linearly so an isolated tablet
//      (degree 0) scores 0 no matter how large.
//   5. Rank desc by anchor_score, return top_n with per-anchor stats
//      (strongest cohort-internal parallel, designation, period, city).
//
// Caveats:
//   - Genre filter depends on the enriched fragment-metadata cache. Without
//     metadata, the cohort is empty or tiny — emits a coverage warning so the
//     researcher knows to run enrich_prefix_metadata first.
//   - intra_cohort_degree is capped by topK (default 15). For a saturated
//     cohort where every tablet has 50+ neighbors, raise max_tablets_to_scan
//     and consider raising topK if a future revision exposes it.
//
// Pure stdlib + reuse of getAllTabletRecords + findFuzzyParallels +
// fragment-metadata cache. Companion to find_tablets_by_genre (v0.18.14,
// which enumerates witnesses) and find_strongest_fuzzy_pairs_in_prefix
// (v0.18.11, which finds raw pair edges without a genre lens).

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { getAllTabletRecords } from "./anomalySurface.js";
import {
  getFragmentMetadata,
  getPeriod,
  getCity,
  metadataCoverage,
  type FragmentMetadata,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type GenreAnchorTablet = {
  tablet_id: string;
  sign_count: number;
  intra_cohort_degree: number;
  anchor_score: number;
  strongest_parallel_id: string | null;
  strongest_parallel_fuzzy_j: number;
  designation: string | null;
  period: string | null;
  city: string | null;
};

export type FindGenreAnchorTabletsSummary = {
  total_anchors_returned: number;
  cohort_size: number;
  mean_anchor_score: number;
  top_designation_pattern: string | null;
};

export type FindGenreAnchorTabletsResult = {
  query: {
    prefix_filter: string;
    genre_pattern: string;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_n_anchors: number;
  };
  cohort_size: number;
  anchors: GenreAnchorTablet[];
  summary: FindGenreAnchorTabletsSummary;
  warnings: string[];
};

export type FindGenreAnchorTabletsOptions = {
  prefixFilter: string;
  genrePattern: string;
  minSignCount?: number; // default 100
  maxTabletsToScan?: number; // default 200, max 1000
  topNAnchors?: number; // default 10
};

// Internal probe constants — match the methods-paper anchor-discovery sweep
// (K.15325 was surfaced via topK=15, minJ=0.20).
const FUZZY_PROBE_TOPK = 15;
const FUZZY_PROBE_THRESHOLD = 0.20;

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

/**
 * Case-insensitive substring match against BOTH the full hierarchy strings
 * (metadata.genres[]) AND the per-category flat list (metadata.genres_flat[]).
 * Mirrors v0.18.14 find_tablets_by_genre with include_subgenres=true.
 */
function genreMatches(metadata: FragmentMetadata, patternLower: string): boolean {
  const flat = metadata.genres_flat;
  if (Array.isArray(flat)) {
    for (const cat of flat) {
      if (typeof cat === "string" && cat.toLowerCase().includes(patternLower)) return true;
    }
  }
  const hier = metadata.genres;
  if (Array.isArray(hier)) {
    for (const h of hier) {
      if (typeof h === "string" && h.toLowerCase().includes(patternLower)) return true;
    }
  }
  return false;
}

function emptyResult(
  query: FindGenreAnchorTabletsResult["query"],
  warnings: string[],
): FindGenreAnchorTabletsResult {
  return {
    query,
    cohort_size: 0,
    anchors: [],
    summary: {
      total_anchors_returned: 0,
      cohort_size: 0,
      mean_anchor_score: 0,
      top_designation_pattern: null,
    },
    warnings,
  };
}

/**
 * Derive a short "top designation pattern" string from the returned anchor
 * set — strips trailing numerics / fragment qualifiers to surface the common
 * stem (e.g. "K.15325", "K.2761", "K.5896" → "K.*"). Pure cosmetic summary
 * for the methods-paper-style description line; null when the set is empty
 * or no common stem can be extracted.
 */
function topDesignationPattern(anchors: GenreAnchorTablet[]): string | null {
  if (anchors.length === 0) return null;
  const prefixes = anchors
    .map((a) => prefixOf(a.tablet_id))
    .filter((p) => p.length > 0);
  if (prefixes.length === 0) return null;
  const counts = new Map<string, number>();
  for (const p of prefixes) counts.set(p, (counts.get(p) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [p, c] of counts.entries()) {
    if (c > bestCount) {
      best = p;
      bestCount = c;
    }
  }
  return best !== null ? `${best}.*` : null;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findGenreAnchorTablets(
  opts: FindGenreAnchorTabletsOptions,
): FindGenreAnchorTabletsResult {
  const prefixFilter = (opts.prefixFilter ?? "").trim();
  const patternRaw = (opts.genrePattern ?? "").trim();
  const minSignCount = Math.max(0, opts.minSignCount ?? 100);
  const maxScan = Math.max(10, Math.min(1000, opts.maxTabletsToScan ?? 200));
  const topN = Math.max(1, opts.topNAnchors ?? 10);
  const warnings: string[] = [];

  const query: FindGenreAnchorTabletsResult["query"] = {
    prefix_filter: prefixFilter,
    genre_pattern: patternRaw,
    min_sign_count: minSignCount,
    max_tablets_to_scan: maxScan,
    top_n_anchors: topN,
  };

  if (prefixFilter.length === 0) {
    return emptyResult(query, [
      "prefix_filter is required — anchor discovery is scoped to a single museum-collection bucket. Use list_collection_prefixes to enumerate options.",
    ]);
  }
  if (patternRaw.length === 0) {
    return emptyResult(query, [
      "genre_pattern is required — examples: 'Mīs pî', 'Šuʾila', 'Maqlû', 'Šurpu', 'Bīt rimki', 'Udug-ḫul'.",
    ]);
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(query, [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  const patternLower = patternRaw.toLowerCase();

  // Step 1: build the prefix scan list — every tablet in this prefix with
  // sign_count >= threshold. Track how many of those have any metadata at
  // all (independent of genre) so we can warn on low coverage even when the
  // cohort filter zeroes-out for unrelated reasons.
  const prefixScanList = tablets.filter(
    (t) => prefixOf(t.id) === prefixFilter && t.sign_count >= minSignCount,
  );

  if (prefixScanList.length === 0) {
    warnings.push(
      `No tablets in prefix ${prefixFilter} have sign_count >= ${minSignCount}. Lower min_sign_count or pick a different prefix.`,
    );
    return emptyResult(query, warnings);
  }

  let withMetadata = 0;
  const cohort: Array<{
    id: string;
    sign_count: number;
    metadata: FragmentMetadata;
  }> = [];

  for (const t of prefixScanList) {
    const md = getFragmentMetadata(t.id);
    if (!md) continue;
    withMetadata++;
    if (!genreMatches(md, patternLower)) continue;
    cohort.push({ id: t.id, sign_count: t.sign_count, metadata: md });
  }

  const coveragePct = prefixScanList.length > 0
    ? Math.round((withMetadata / prefixScanList.length) * 1000) / 10
    : 0;

  // Low-coverage warning — a thin or empty cohort might just mean unenriched
  // metadata, not absence of witnesses. Always surface this when coverage is
  // low so callers don't draw "no anchors exist" conclusions from a metadata
  // gap.
  if (prefixScanList.length >= 50 && coveragePct < 10) {
    warnings.push(
      `Low metadata coverage — only ${withMetadata}/${prefixScanList.length} tablets in prefix ${prefixFilter} (${coveragePct}%) have fragment metadata. Most tablets were silently skipped from genre matching. Run enrich_prefix_metadata(prefix_filter="${prefixFilter}") first.`,
    );
  } else if (withMetadata === 0 && prefixScanList.length > 0) {
    warnings.push(
      `No tablets in prefix ${prefixFilter} have enriched fragment metadata. Genre matching is impossible. Run enrich_prefix_metadata(prefix_filter="${prefixFilter}") to populate the cache.`,
    );
  }

  if (cohort.length === 0) {
    warnings.push(
      `No tablets in prefix ${prefixFilter} match genre pattern "${patternRaw}" with sign_count >= ${minSignCount}.`,
    );
    return emptyResult(query, warnings);
  }

  // Cap the scan at maxScan, prioritizing the largest tablets — these are
  // the most likely anchors and also the most reliable fuzzy-J probes.
  const scanList = [...cohort]
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, maxScan);

  if (cohort.length > maxScan) {
    warnings.push(
      `Cohort has ${cohort.length} tablets but scan capped at ${maxScan} (largest by sign_count). Raise max_tablets_to_scan to widen.`,
    );
  }

  const cohortIdSet = new Set(scanList.map((c) => c.id));

  // Step 2-3: per-candidate fuzzy probe + intra-cohort degree count.
  // Bail early if the fuzzy index is missing — first warning is deterministic
  // across the loop so we don't burn N useless calls.
  let indexUnavailableWarning: string | null = null;
  let probedWithResults = 0;
  const anchors: GenreAnchorTablet[] = [];

  for (const seed of scanList) {
    const fuzzy = findFuzzyParallels({
      tabletId: seed.id,
      topK: FUZZY_PROBE_TOPK,
      minFuzzyJaccard: FUZZY_PROBE_THRESHOLD,
    });

    if (fuzzy.parallels.length === 0 && fuzzy.warnings.length > 0) {
      if (indexUnavailableWarning === null) {
        indexUnavailableWarning = fuzzy.warnings[0];
      }
      const looksLikeIndexFailure =
        /not loaded|cache not found|fuzzy index unavailable/i.test(indexUnavailableWarning);
      if (looksLikeIndexFailure && probedWithResults === 0) {
        warnings.push(indexUnavailableWarning);
        return emptyResult(query, warnings);
      }
      // Tablet simply isn't in the fuzzy index — degree 0, not an anchor.
      continue;
    }

    if (fuzzy.parallels.length > 0) probedWithResults++;

    // Intra-cohort: only count parallels that are themselves in the cohort.
    // Among those, capture the strongest by fuzzy_jaccard for the anchor row.
    let intraDegree = 0;
    let strongestId: string | null = null;
    let strongestJ = 0;
    for (const par of fuzzy.parallels) {
      if (par.tablet_id === seed.id) continue;
      if (!cohortIdSet.has(par.tablet_id)) continue;
      intraDegree++;
      if (par.fuzzy_jaccard > strongestJ) {
        strongestJ = par.fuzzy_jaccard;
        strongestId = par.tablet_id;
      }
    }

    // Step 4: anchor_score = sqrt(sign_count) × intra_cohort_degree. Degree 0
    // → score 0 (an isolated tablet, even if huge, isn't a canonical anchor).
    const score = Math.sqrt(seed.sign_count) * intraDegree;

    anchors.push({
      tablet_id: seed.id,
      sign_count: seed.sign_count,
      intra_cohort_degree: intraDegree,
      anchor_score: +score.toFixed(4),
      strongest_parallel_id: strongestId,
      strongest_parallel_fuzzy_j: +strongestJ.toFixed(4),
      designation: seed.metadata.designation ?? null,
      period: getPeriod(seed.metadata),
      city: getCity(seed.metadata),
    });
  }

  if (indexUnavailableWarning !== null && anchors.length === 0) {
    warnings.push(indexUnavailableWarning);
    return emptyResult(query, warnings);
  }

  // Step 5: rank by anchor_score desc; tie-break on sign_count desc, then
  // tablet_id asc for stable output.
  anchors.sort((a, b) => {
    if (b.anchor_score !== a.anchor_score) return b.anchor_score - a.anchor_score;
    if (b.sign_count !== a.sign_count) return b.sign_count - a.sign_count;
    return a.tablet_id.localeCompare(b.tablet_id);
  });

  const topAnchors = anchors.slice(0, topN);

  const meanScore =
    topAnchors.length > 0
      ? topAnchors.reduce((sum, a) => sum + a.anchor_score, 0) / topAnchors.length
      : 0;

  // Corpus-wide coverage stats — useful context line independent of the
  // prefix filter (answers "how enriched is the corpus overall?").
  // Surfaced via the warning channel only when the local probe was thin;
  // otherwise just reflected in the summary section.
  if (warnings.length === 0 && metadataCoverage().total_with_metadata < 500) {
    warnings.push(
      `Corpus-wide metadata coverage is still thin (${metadataCoverage().total_with_metadata} enriched tablets total). Anchor discovery is reliable only within prefixes you've run enrich_prefix_metadata on.`,
    );
  }

  return {
    query,
    cohort_size: cohort.length,
    anchors: topAnchors,
    summary: {
      total_anchors_returned: topAnchors.length,
      cohort_size: cohort.length,
      mean_anchor_score: +meanScore.toFixed(4),
      top_designation_pattern: topDesignationPattern(topAnchors),
    },
    warnings,
  };
}
