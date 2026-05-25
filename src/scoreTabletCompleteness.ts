// v0.34.0 — score_tablet_completeness.
//
// Given a fragment, estimate what fraction of the original composition is
// preserved. Two complementary metrics:
//
//   sign_count_ratio   = query.sign_count / max(exemplar.sign_count)
//   chunk_coverage     = |query_chunks ∩ composition_canonical_chunks|
//                        / |composition_canonical_chunks|
//
// where composition_canonical_chunks = chunks (length-20 hashes from the
// v0.20 index) that appear in ≥2 of the composition's registry exemplars.
// The canonical-chunk set is the structural backbone of the composition,
// stripped of single-witness noise.
//
// Composition can be provided directly via composition_id, or inferred
// via identifyComposition's top candidate (only used when confidence ≥
// fallback_min_confidence, default 0.3).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import {
  COMPOSITION_REGISTRY,
  getCompositionById,
  type CompositionEntry,
} from "./compositionRegistry.js";
import { getChunksContaining, loadChunkIndex } from "./chunkIndex.js";
import { identifyComposition } from "./identifyComposition.js";

const ALL_SIGNS_FILE = "all-signs-full.json";
const DAMAGE_TOKENS = new Set(["X", "x", "?"]);
const MIN_EXEMPLARS_FOR_CANONICAL = 2;

export type CompletenessMetrics = {
  sign_count_ratio: number | null;
  chunk_coverage_ratio: number | null;
  chunks_hosted_count: number;
  canonical_chunks_count: number;
  query_sign_count: number | null;
  largest_exemplar_id: string | null;
  largest_exemplar_sign_count: number | null;
  lacuna_density: number | null;
};

export type CompositionResolution = {
  source: "explicit" | "inferred" | "unresolved";
  composition_id: string | null;
  composition_name: string | null;
  inferred_confidence: number | null;
  inferred_rationale: string | null;
};

export type ScoreTabletCompletenessResult = {
  query_tablet_id: string;
  composition: CompositionResolution;
  metrics: CompletenessMetrics;
  preserved_chunk_hashes: string[];
  missing_chunk_hashes: string[];
  index_stats: {
    chunk_index_loaded: boolean;
    signs_cache_loaded: boolean;
    exemplars_with_chunks: number;
    exemplars_with_signs: number;
  };
  warnings: string[];
};

export type ScoreTabletCompletenessOptions = {
  tabletId: string;
  compositionId?: string;
  fallbackMinConfidence?: number;
  includeChunkLists?: boolean;
};

// ─── Local signs cache (shared pattern with identifyComposition) ───────────

type CorpusEntry = { tokens: string[]; rawSigns: string };
let _corpus: Map<string, CorpusEntry> | null = null;
let _corpusLoadError: string | null = null;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function loadSignsCorpus(): Map<string, CorpusEntry> | null {
  if (_corpus) return _corpus;
  if (_corpusLoadError) return null;
  const path = join(cacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) {
    _corpusLoadError = `signs cache not found: ${path}`;
    return null;
  }
  try {
    const records = JSON.parse(readFileSync(path, "utf-8")) as Array<{
      _id: string;
      signs: string;
    }>;
    const out = new Map<string, CorpusEntry>();
    for (const r of records) {
      if (!r._id || typeof r.signs !== "string") continue;
      const tokens = r.signs.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      out.set(r._id, { tokens, rawSigns: r.signs });
    }
    _corpus = out;
    return out;
  } catch (e) {
    _corpusLoadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export function _resetCacheForTests(): void {
  _corpus = null;
  _corpusLoadError = null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function signCountFor(tabletId: string): number | null {
  const corpus = loadSignsCorpus();
  if (!corpus) return null;
  const e = corpus.get(tabletId);
  if (!e) return null;
  return e.tokens.length;
}

function lacunaDensityFor(tabletId: string): number | null {
  const corpus = loadSignsCorpus();
  if (!corpus) return null;
  const e = corpus.get(tabletId);
  if (!e) return null;
  if (e.tokens.length === 0) return null;
  let dmg = 0;
  for (const t of e.tokens) if (DAMAGE_TOKENS.has(t)) dmg++;
  return dmg / e.tokens.length;
}

function chunkHashSetFor(tabletId: string): Set<string> {
  const out = new Set<string>();
  for (const c of getChunksContaining(tabletId)) out.add(c.hash);
  return out;
}

function canonicalChunkHashes(entry: CompositionEntry): Set<string> {
  // Hashes that appear in ≥MIN_EXEMPLARS_FOR_CANONICAL exemplars.
  const hashCounts = new Map<string, number>();
  for (const ex of entry.exemplar_tablets) {
    const seen = new Set<string>();
    for (const c of getChunksContaining(ex)) seen.add(c.hash);
    for (const h of seen) hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [hash, n] of hashCounts) {
    if (n >= MIN_EXEMPLARS_FOR_CANONICAL) out.add(hash);
  }
  return out;
}

function largestExemplar(entry: CompositionEntry): {
  id: string | null;
  sign_count: number | null;
  with_signs: number;
} {
  let topId: string | null = null;
  let topCount: number | null = null;
  let withSigns = 0;
  for (const ex of entry.exemplar_tablets) {
    const sc = signCountFor(ex);
    if (sc !== null) withSigns++;
    if (sc !== null && (topCount === null || sc > topCount)) {
      topId = ex;
      topCount = sc;
    }
  }
  return { id: topId, sign_count: topCount, with_signs: withSigns };
}

// ─── Main entry point ──────────────────────────────────────────────────────

export function scoreTabletCompleteness(
  opts: ScoreTabletCompletenessOptions,
): ScoreTabletCompletenessResult {
  const tabletId = opts.tabletId.trim();
  const fallbackMin = opts.fallbackMinConfidence ?? 0.3;
  const includeLists = opts.includeChunkLists ?? false;
  const warnings: string[] = [];

  const chunkIdx = loadChunkIndex();
  const chunkLoaded = chunkIdx !== null;
  if (!chunkLoaded) warnings.push("chunk index not loaded; chunk_coverage axis disabled");

  const corpus = loadSignsCorpus();
  const signsLoaded = corpus !== null;
  if (!signsLoaded) warnings.push("signs cache not loaded; sign_count_ratio + lacuna_density disabled");

  // Resolve composition.
  let composition: CompositionResolution;
  let entry: CompositionEntry | null = null;
  if (opts.compositionId) {
    entry = getCompositionById(opts.compositionId);
    if (!entry) {
      warnings.push(`composition_id "${opts.compositionId}" not in registry`);
      composition = {
        source: "unresolved",
        composition_id: opts.compositionId,
        composition_name: null,
        inferred_confidence: null,
        inferred_rationale: `not in registry of ${COMPOSITION_REGISTRY.length} compositions`,
      };
    } else {
      composition = {
        source: "explicit",
        composition_id: entry.id,
        composition_name: entry.name,
        inferred_confidence: null,
        inferred_rationale: "caller-specified composition_id",
      };
    }
  } else {
    // Infer via identify_composition.
    const ident = identifyComposition({ tabletId, topK: 3 });
    const top = ident.candidates[0];
    if (!top) {
      composition = {
        source: "unresolved",
        composition_id: null,
        composition_name: null,
        inferred_confidence: null,
        inferred_rationale: "identify_composition returned no candidates",
      };
    } else if (top.confidence < fallbackMin) {
      composition = {
        source: "unresolved",
        composition_id: top.composition_id,
        composition_name: top.composition_name,
        inferred_confidence: top.confidence,
        inferred_rationale: `top candidate confidence ${top.confidence.toFixed(3)} below fallback_min ${fallbackMin}; pass composition_id explicitly to override`,
      };
    } else {
      entry = getCompositionById(top.composition_id);
      composition = {
        source: "inferred",
        composition_id: top.composition_id,
        composition_name: top.composition_name,
        inferred_confidence: top.confidence,
        inferred_rationale: top.rationale,
      };
    }
  }

  // Compute metrics.
  const querySignCount = signsLoaded ? signCountFor(tabletId) : null;
  const lacunaDensity = signsLoaded ? lacunaDensityFor(tabletId) : null;

  let signCountRatio: number | null = null;
  let chunkCoverageRatio: number | null = null;
  let chunksHostedCount = 0;
  let canonicalChunksCount = 0;
  let largestExemplarId: string | null = null;
  let largestExemplarSignCount: number | null = null;
  let exemplarsWithChunks = 0;
  let exemplarsWithSigns = 0;
  const preservedHashes: string[] = [];
  const missingHashes: string[] = [];

  if (entry && chunkLoaded) {
    const canonical = canonicalChunkHashes(entry);
    canonicalChunksCount = canonical.size;
    const queryChunks = chunkHashSetFor(tabletId);
    for (const h of canonical) {
      if (queryChunks.has(h)) {
        chunksHostedCount++;
        if (includeLists) preservedHashes.push(h);
      } else if (includeLists) {
        missingHashes.push(h);
      }
    }
    if (canonicalChunksCount > 0) {
      chunkCoverageRatio = chunksHostedCount / canonicalChunksCount;
    }
    for (const ex of entry.exemplar_tablets) {
      if (getChunksContaining(ex).length > 0) exemplarsWithChunks++;
    }
  }

  if (entry && signsLoaded) {
    const largest = largestExemplar(entry);
    largestExemplarId = largest.id;
    largestExemplarSignCount = largest.sign_count;
    exemplarsWithSigns = largest.with_signs;
    if (querySignCount !== null && largestExemplarSignCount && largestExemplarSignCount > 0) {
      signCountRatio = Math.min(1, querySignCount / largestExemplarSignCount);
    }
  }

  return {
    query_tablet_id: tabletId,
    composition,
    metrics: {
      sign_count_ratio: signCountRatio,
      chunk_coverage_ratio: chunkCoverageRatio,
      chunks_hosted_count: chunksHostedCount,
      canonical_chunks_count: canonicalChunksCount,
      query_sign_count: querySignCount,
      largest_exemplar_id: largestExemplarId,
      largest_exemplar_sign_count: largestExemplarSignCount,
      lacuna_density: lacunaDensity,
    },
    preserved_chunk_hashes: preservedHashes,
    missing_chunk_hashes: missingHashes,
    index_stats: {
      chunk_index_loaded: chunkLoaded,
      signs_cache_loaded: signsLoaded,
      exemplars_with_chunks: exemplarsWithChunks,
      exemplars_with_signs: exemplarsWithSigns,
    },
    warnings,
  };
}
