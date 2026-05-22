// v0.18.15 — Provenance-based discovery over the enriched fragment-metadata cache.
//
// Direct city-axis mirror of v0.18.14 find_tablets_by_genre. Answers the
// methods-paper-aligned question "find all tablets from site X in the
// corpus" — e.g. "all Sippar tablets", "all Nineveh tablets", "all Nippur
// tablets". Companion to compare_dialects (which uses city+period to build
// a cohort for outlier ranking) and to collectionCoverage's per-prefix
// city distribution (which counts but does not list). Where those tools
// answer "what cities exist here?" and "who deviates from this city's
// modal practice?", this tool answers "give me the per-city witness list
// across the entire corpus, sorted by sign_count desc".
//
// Use cases: historical-cohort building, scribal-school analysis,
// comparative work between two sites (run twice with different cities,
// then diff the prefix/period distributions).
//
// Critical caveat: matching runs against the enriched fragment-metadata
// cache (see fragmentMetadata.ts). As of v0.18.13 the cache holds only
// ~0.6% of the corpus (~226 of ~36,500 tablets). Most tablets will be
// silently skipped because their city is unknown. The tool emits a
// coverage warning when fewer than ~10% of scanned tablets have metadata.
// Run enrich_prefix_metadata(prefix_filter="X") to backfill specific
// prefixes before running broad provenance queries.
//
// Algorithm:
//   1. Iterate getAllTabletRecords() from anomalySurface
//   2. Optional prefix-filter narrowing
//   3. For each candidate, fetch FragmentMetadata via getFragmentMetadata
//   4. Match city via cityMatches (normalized substring — tolerates
//      "Sippar (Tell Abu Habba)" vs "Sippar")
//   5. Optionally narrow by period (normalized substring on getPeriod)
//   6. Apply min_sign_count filter
//   7. Sort by sign_count desc; cap at top_n
//   8. Build per-prefix + per-period + per-genre distributions over ALL
//      matches (not just the returned slice)
//
// Pure stdlib + read-only access to the anomaly index and metadata cache.

import { getAllTabletRecords } from "./anomalySurface.js";
import {
  getFragmentMetadata,
  getPeriod,
  getCity,
  getPrimaryGenre,
  metadataCoverage,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ProvenanceMatch = {
  tablet_id: string;
  prefix: string;
  designation: string | null;
  sign_count: number;
  period: string | null;
  city: string | null;
  primary_genre: string | null;
  in_lex_graph: boolean;
};

export type FindTabletsByProvenanceSummary = {
  total_matches: number;
  total_returned: number;
  total_with_metadata_in_corpus: number;
  total_scanned: number;
  metadata_coverage_pct: number; // over the SCANNED set (post prefix-filter), 1 decimal
  prefix_distribution: Record<string, number>; // top-15 only
  period_distribution: Record<string, number>; // top-5 only
  genre_distribution: Record<string, number>; // top-5 only
};

export type FindTabletsByProvenanceResult = {
  query: {
    city: string;
    period: string | null;
    prefix_filter: string | null;
    min_sign_count: number;
    top_n: number;
  };
  matches: ProvenanceMatch[];
  summary: FindTabletsByProvenanceSummary;
  warnings: string[];
};

export type FindTabletsByProvenanceOptions = {
  city: string;
  period?: string;
  prefixFilter?: string;
  minSignCount?: number; // default 0
  topN?: number; // default 50, max 500
};

// ─── Internals ─────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  // Matches the convention used across the codebase (reconstructCluster,
  // collectionCoverage, findByGenre). Splits before the first "." or ",".
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function normalizeForMatch(s: string | null): string {
  if (!s) return "";
  // Lowercase + strip punctuation/whitespace so "Sippar (Tell Abu Habba)",
  // "Sippar-Amnānum", and "sippar" all collapse to a shared root. eBL field
  // values are not perfectly normalized across the corpus, so a strict
  // equality match would silently drop legitimate cohort members.
  return s.toLowerCase().replace(/[\s_\-.,/()]+/g, "");
}

function cityMatches(metadataCity: string | null, queryCity: string): boolean {
  const m = normalizeForMatch(metadataCity);
  const q = normalizeForMatch(queryCity);
  if (m.length === 0 || q.length === 0) return false;
  // Substring match in either direction — tolerates "Sippar (Tell Abu Habba)"
  // vs "Sippar" and similar variants. Matches compareDialects semantics.
  return m === q || m.includes(q) || q.includes(m);
}

function periodMatches(metadataPeriod: string | null, queryPeriod: string): boolean {
  const m = normalizeForMatch(metadataPeriod);
  const q = normalizeForMatch(queryPeriod);
  if (m.length === 0 || q.length === 0) return false;
  return m === q || m.includes(q) || q.includes(m);
}

function emptyResult(
  query: FindTabletsByProvenanceResult["query"],
  warnings: string[],
): FindTabletsByProvenanceResult {
  return {
    query,
    matches: [],
    summary: {
      total_matches: 0,
      total_returned: 0,
      total_with_metadata_in_corpus: 0,
      total_scanned: 0,
      metadata_coverage_pct: 0,
      prefix_distribution: {},
      period_distribution: {},
      genre_distribution: {},
    },
    warnings,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findTabletsByProvenance(
  opts: FindTabletsByProvenanceOptions,
): FindTabletsByProvenanceResult {
  const cityRaw = (opts.city ?? "").trim();
  const periodRaw = opts.period && opts.period.trim().length > 0
    ? opts.period.trim()
    : null;
  const prefixFilter = opts.prefixFilter && opts.prefixFilter.trim().length > 0
    ? opts.prefixFilter.trim()
    : null;
  const minSignCount = Math.max(0, opts.minSignCount ?? 0);
  const topN = Math.max(1, Math.min(500, opts.topN ?? 50));
  const warnings: string[] = [];

  const query: FindTabletsByProvenanceResult["query"] = {
    city: cityRaw,
    period: periodRaw,
    prefix_filter: prefixFilter,
    min_sign_count: minSignCount,
    top_n: topN,
  };

  if (cityRaw.length === 0) {
    return emptyResult(query, [
      "city is required and must be non-empty. Examples: 'Sippar', 'Nineveh', 'Nippur', 'Babylon', 'Uruk', 'Susa', 'Mari', 'Lagash', 'Ur'.",
    ]);
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(query, [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  // Build the scan set: optionally prefix-narrowed.
  const scanList = prefixFilter
    ? tablets.filter((t) => prefixOf(t.id) === prefixFilter)
    : tablets;

  if (scanList.length === 0) {
    warnings.push(
      `No tablets match the scan criteria${prefixFilter ? ` (prefix=${prefixFilter})` : ""}.`,
    );
    return emptyResult(query, warnings);
  }

  const matches: ProvenanceMatch[] = [];
  let enrichedCount = 0;

  for (const t of scanList) {
    const md = getFragmentMetadata(t.id);
    if (!md) continue;
    enrichedCount++;

    const mdCity = getCity(md);
    if (!cityMatches(mdCity, cityRaw)) continue;

    if (periodRaw !== null) {
      const mdPeriod = getPeriod(md);
      if (!periodMatches(mdPeriod, periodRaw)) continue;
    }

    if (t.sign_count < minSignCount) continue;

    matches.push({
      tablet_id: t.id,
      prefix: prefixOf(t.id),
      designation: md.designation ?? t.designation ?? null,
      sign_count: t.sign_count,
      period: getPeriod(md) ?? t.period ?? null,
      city: mdCity ?? t.city ?? null,
      primary_genre: getPrimaryGenre(md),
      in_lex_graph: t.in_lex_graph,
    });
  }

  // Sort by sign_count desc — largest/most-informative witnesses first.
  // Tie-break alphabetically by tablet_id for stable output.
  matches.sort((a, b) => {
    if (b.sign_count !== a.sign_count) return b.sign_count - a.sign_count;
    return a.tablet_id.localeCompare(b.tablet_id);
  });

  // Distributions are computed over ALL matches (not the returned slice)
  // so callers can reason about the full witness population even when
  // top_n is restrictive.
  const prefixDistAll: Record<string, number> = {};
  const periodDistAll: Record<string, number> = {};
  const genreDistAll: Record<string, number> = {};
  for (const m of matches) {
    prefixDistAll[m.prefix] = (prefixDistAll[m.prefix] ?? 0) + 1;
    const periodKey = m.period ?? "(unknown)";
    periodDistAll[periodKey] = (periodDistAll[periodKey] ?? 0) + 1;
    const genreKey = m.primary_genre ?? "(unknown)";
    genreDistAll[genreKey] = (genreDistAll[genreKey] ?? 0) + 1;
  }

  // Top-15 prefix distribution.
  const prefixDistTop15: Record<string, number> = {};
  Object.entries(prefixDistAll)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([k, v]) => {
      prefixDistTop15[k] = v;
    });

  // Top-5 period distribution.
  const periodDistTop5: Record<string, number> = {};
  Object.entries(periodDistAll)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([k, v]) => {
      periodDistTop5[k] = v;
    });

  // Top-5 genre distribution.
  const genreDistTop5: Record<string, number> = {};
  Object.entries(genreDistAll)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([k, v]) => {
      genreDistTop5[k] = v;
    });

  const truncated = matches.slice(0, topN);

  const coveragePct = scanList.length > 0
    ? Math.round((enrichedCount / scanList.length) * 1000) / 10
    : 0;

  // Low-coverage warning — researchers need to know that "0 matches" might
  // mean "no metadata", not "no witnesses in the corpus".
  if (scanList.length >= 50 && coveragePct < 10) {
    warnings.push(
      `Low metadata coverage: only ${enrichedCount}/${scanList.length} scanned tablets (${coveragePct}%) have enriched metadata. Most tablets were silently skipped. Run enrich_prefix_metadata${prefixFilter ? `(prefix_filter="${prefixFilter}")` : "()"} to backfill from the eBL API before relying on this result for completeness.`,
    );
  }
  if (enrichedCount === 0 && scanList.length > 0) {
    warnings.push(
      `No tablets in the scan set have enriched metadata. Provenance matching is impossible — run enrich_prefix_metadata to populate the cache.`,
    );
  }

  // Corpus-wide metadata totals for context (independent of the prefix
  // filter — answers "how much of the whole corpus is enriched?").
  const corpusCoverage = metadataCoverage();

  return {
    query,
    matches: truncated,
    summary: {
      total_matches: matches.length,
      total_returned: truncated.length,
      total_with_metadata_in_corpus: corpusCoverage.total_with_metadata,
      total_scanned: scanList.length,
      metadata_coverage_pct: coveragePct,
      prefix_distribution: prefixDistTop15,
      period_distribution: periodDistTop5,
      genre_distribution: genreDistTop5,
    },
    warnings,
  };
}
