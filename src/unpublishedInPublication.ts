// v0.18.13 — Untransliterated-backlog discovery, scoped to a publication.
//
// Surfaces tablets that are cataloged in a given museum publication (e.g. CT,
// KAR, BAM, OECT, CTN, AOAT) but have NOT yet been entered into the eBL
// transliteration pipeline — i.e. their sign-content is unavailable to the
// lexical-graph / fuzzy / thematic indices. These are the highest-value
// targets for new transliteration work: the publication itself supplies the
// hand-copy or photograph, so the tablet is editorially "known" — only the
// digitization step is missing.
//
// Algorithm:
//   1. Iterate getAllTabletRecords() from anomalySurface.js.
//   2. For each tablet, fetch its cached FragmentMetadata via
//      getFragmentMetadata(id) (no network — purely cache-bound).
//   3. Filter to tablets whose `designation` field contains the requested
//      publication pattern (case-insensitive substring; designations look
//      like "CT 23, pl. 4" / "KAR 44" / "BAM 248" / "OECT 11 7" so a plain
//      substring of the abbreviation is sufficient for v1).
//   4. Split matches by in_lex_graph (true = transliterated, false = not).
//   5. Return the untransliterated set + a small transliterated sample for
//      sanity-checking the pattern match.
//
// Critical caveat: only tablets whose fragment-metadata is already in the
// on-disk cache can be matched (designation lives in FragmentMetadata, which
// is sparse by default — typically <1% corpus coverage). If overall coverage
// is low (<5%), the tool emits a warning telling the user to run
// `enrich_prefix_metadata(prefix_filter='BM')` (or the appropriate prefix)
// first. Without enrichment the result will look empty even for well-known
// publications.
//
// Pure stdlib + reuse of getAllTabletRecords + fragmentMetadata helpers.

import { getAllTabletRecords } from "./anomalySurface.js";
import {
  getFragmentMetadata,
  getPeriod,
  metadataCoverage,
  type FragmentMetadata,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type UnpublishedInPublicationCandidate = {
  tablet_id: string;
  designation: string;
  period: string | null;
  prefix: string;
  sign_count: number;
};

export type UnpublishedInPublicationTransliteratedSample = {
  tablet_id: string;
  designation: string;
  prefix: string;
  sign_count: number;
};

export type UnpublishedInPublicationSummary = {
  total_matching_publication: number;
  transliterated_count: number;
  untransliterated_count: number;
  transliterated_pct: number;
  total_with_metadata_in_corpus: number;
  metadata_coverage_pct: number;
};

export type FindUnpublishedInPublicationResult = {
  query: {
    publication_pattern: string;
    prefix_filter: string | null;
    top_n: number;
  };
  summary: UnpublishedInPublicationSummary;
  untransliterated: UnpublishedInPublicationCandidate[];
  transliterated_sample: UnpublishedInPublicationTransliteratedSample[];
  warnings: string[];
};

export type FindUnpublishedInPublicationOptions = {
  publicationPattern: string;
  prefixFilter?: string;
  topN?: number; // default 50, max 500
};

// ─── Internals ─────────────────────────────────────────────────────────────

const DEFAULT_TOP_N = 50;
const MAX_TOP_N = 500;
const TRANSLITERATED_SAMPLE_SIZE = 10;

// Coverage thresholds for warning emission. <5% of the corpus enriched =>
// the result is likely to be very thin; tell the user to run enrichment.
const LOW_COVERAGE_RATIO = 0.05;

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function emptyResult(
  query: FindUnpublishedInPublicationResult["query"],
  summary: UnpublishedInPublicationSummary,
  warnings: string[],
): FindUnpublishedInPublicationResult {
  return {
    query,
    summary,
    untransliterated: [],
    transliterated_sample: [],
    warnings,
  };
}

function zeroSummary(
  totalWithMetadata: number,
  coveragePct: number,
): UnpublishedInPublicationSummary {
  return {
    total_matching_publication: 0,
    transliterated_count: 0,
    untransliterated_count: 0,
    transliterated_pct: 0,
    total_with_metadata_in_corpus: totalWithMetadata,
    metadata_coverage_pct: coveragePct,
  };
}

/**
 * Discover tablets cataloged in a given publication that have no eBL
 * transliteration. See file header for algorithm + caveat.
 */
export function findUnpublishedInPublication(
  opts: FindUnpublishedInPublicationOptions,
): FindUnpublishedInPublicationResult {
  const warnings: string[] = [];

  const publicationPattern = (opts.publicationPattern ?? "").trim();
  const prefixFilter =
    opts.prefixFilter && opts.prefixFilter.length > 0 ? opts.prefixFilter : null;
  const topN = Math.max(1, Math.min(MAX_TOP_N, opts.topN ?? DEFAULT_TOP_N));

  const query: FindUnpublishedInPublicationResult["query"] = {
    publication_pattern: publicationPattern,
    prefix_filter: prefixFilter,
    top_n: topN,
  };

  if (publicationPattern.length === 0) {
    return emptyResult(query, zeroSummary(0, 0), [
      "publication_pattern is required (e.g. 'CT', 'KAR', 'BAM', 'OECT', 'CTN').",
    ]);
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(query, zeroSummary(0, 0), [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  const coverage = metadataCoverage();
  const totalCorpus = tablets.length;
  const totalWithMetadata = coverage.total_with_metadata;
  const coveragePct = totalCorpus > 0
    ? +((totalWithMetadata / totalCorpus) * 100).toFixed(2)
    : 0;

  if (totalCorpus === 0 || totalWithMetadata === 0) {
    warnings.push(
      `No fragment-metadata is cached (coverage ${coveragePct}% of ${totalCorpus} tablets). Run enrich_prefix_metadata(prefix_filter='BM') (or the appropriate prefix for this publication) before querying.`,
    );
    return emptyResult(query, zeroSummary(totalWithMetadata, coveragePct), warnings);
  }

  if (totalWithMetadata / totalCorpus < LOW_COVERAGE_RATIO) {
    warnings.push(
      `Low metadata coverage — only ${coveragePct}% of tablets have a cached designation field. Results will be sparse; run enrich_prefix_metadata(prefix_filter='${prefixFilter ?? "BM"}') for fuller results.`,
    );
  }

  const patternLower = publicationPattern.toLowerCase();

  type Match = {
    tablet_id: string;
    designation: string;
    prefix: string;
    sign_count: number;
    in_lex_graph: boolean;
    metadata: FragmentMetadata;
  };

  const matches: Match[] = [];

  for (const t of tablets) {
    const prefix = prefixOf(t.id);
    if (prefixFilter !== null && prefix !== prefixFilter) continue;

    const meta = getFragmentMetadata(t.id);
    if (!meta) continue;
    const designation = meta.designation;
    if (!designation) continue;
    if (!designation.toLowerCase().includes(patternLower)) continue;

    matches.push({
      tablet_id: t.id,
      designation,
      prefix,
      sign_count: t.sign_count,
      in_lex_graph: t.in_lex_graph,
      metadata: meta,
    });
  }

  const totalMatches = matches.length;
  const transliterated = matches.filter((m) => m.in_lex_graph);
  const untransliterated = matches.filter((m) => !m.in_lex_graph);

  const transliteratedPct = totalMatches > 0
    ? +((transliterated.length / totalMatches) * 100).toFixed(2)
    : 0;

  const summary: UnpublishedInPublicationSummary = {
    total_matching_publication: totalMatches,
    transliterated_count: transliterated.length,
    untransliterated_count: untransliterated.length,
    transliterated_pct: transliteratedPct,
    total_with_metadata_in_corpus: totalWithMetadata,
    metadata_coverage_pct: coveragePct,
  };

  if (totalMatches === 0) {
    warnings.push(
      `No tablets in the cached metadata matched publication pattern "${publicationPattern}"${
        prefixFilter !== null ? ` within prefix=${prefixFilter}` : ""
      }. Either the pattern is wrong, no cataloged tablets from this publication have been enriched yet, or the publication abbreviation differs from the designation string (try variants).`,
    );
    return emptyResult(query, summary, warnings);
  }

  // Sort untransliterated by sign_count desc (largest = most valuable to
  // transliterate first; longer tablets carry more lexical signal). Stable
  // tie-break by tablet_id for determinism.
  const untransliteratedSorted = [...untransliterated].sort((a, b) => {
    if (b.sign_count !== a.sign_count) return b.sign_count - a.sign_count;
    return a.tablet_id.localeCompare(b.tablet_id);
  });

  const untransliteratedTop: UnpublishedInPublicationCandidate[] = untransliteratedSorted
    .slice(0, topN)
    .map((m) => ({
      tablet_id: m.tablet_id,
      designation: m.designation,
      period: getPeriod(m.metadata),
      prefix: m.prefix,
      sign_count: m.sign_count,
    }));

  // Transliterated sample: first N by sign_count desc, same ordering rule.
  const transliteratedSample: UnpublishedInPublicationTransliteratedSample[] = [...transliterated]
    .sort((a, b) => {
      if (b.sign_count !== a.sign_count) return b.sign_count - a.sign_count;
      return a.tablet_id.localeCompare(b.tablet_id);
    })
    .slice(0, TRANSLITERATED_SAMPLE_SIZE)
    .map((m) => ({
      tablet_id: m.tablet_id,
      designation: m.designation,
      prefix: m.prefix,
      sign_count: m.sign_count,
    }));

  return {
    query,
    summary,
    untransliterated: untransliteratedTop,
    transliterated_sample: transliteratedSample,
    warnings,
  };
}
