// v0.73.0 — surface_genre_conflicts (Genre-Conflict Sentinel).
//
// Surfaces tablets where identify_composition's high-confidence composition-FAMILY
// (magic / divination / lexical, from registry typical_genre) disagrees with the
// tablet's eBL editorial genre-FAMILY (medicine / magic / divination / literature /
// lexical, parsed from primary_genre), then characterizes the shared-text evidence
// linking the tablet to a registry exemplar of the assigned composition.
//
// WHAT THE EVIDENCE ACTUALLY IS (read this before trusting a hit). The link is a
// shared length-20 sign-TRIGRAM window (which may span breaks/lacunae — NOT 20
// contiguous verbatim signs). Critically, at the default min_shared_chunks=1 the
// corroboration filter removes essentially ZERO cross-family hits, because
// identify_composition is itself ~0.6-weighted on chunk-overlap with these very
// exemplars — so a shared window is forced by construction. The corroboration is
// therefore NOT an independent check; it merely re-counts the model's own dominant
// evidence. The information lives in the RARITY of the shared window:
//   - rarest_window_host_count high (> discriminating_host_max) → the shared window
//     is a pan-corpus FORMULA (boilerplate); weak, uninformative evidence.
//   - rarest_window_host_count low (≤ discriminating_host_max) → a genuinely rare
//     shared passage. These split by overlap_fraction:
//       · low fraction  → embedded_quotation_candidate (a localized rare passage
//         inside an otherwise-on-genre tablet — the real "incantation in a medical
//         text" phenomenon; e.g. K.2433, magic-in-medicine, fraction 0.12);
//       · high fraction → likely_misassignment (the overlap dominates the tablet,
//         i.e. the model is probably just wrong about its genre; e.g. K.5078).
//
// INTEGRITY: observational HYPOTHESES for human review, NEVER labels. Does not feed
// the v1.0 G2 gate (that would be circular). The empirical disclosure above is the
// honest framing — earlier drafts overclaimed "verbatim cross-genre quotation".

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { COMPOSITION_REGISTRY } from "./compositionRegistry.js";
import { getChunksContaining } from "./chunkIndex.js";

// ─── Public types ───────────────────────────────────────────────────────────

export type ConflictSignal = "embedded_quotation_candidate" | "likely_misassignment" | "formulaic";

export type GenreConflict = {
  tablet_id: string;
  composition_id: string;
  composition_family: string; // model side (magic / divination / lexical …)
  ebl_genre: string; // raw eBL primary_genre path
  ebl_family: string; // catalog side (medicine / magic / divination / literature / lexical)
  confidence: number; // identify_composition confidence
  matched_exemplar: string; // a registry exemplar of composition_id hosting the rarest shared window
  shared_window_count: number; // # length-20 windows shared with the composition's exemplar set
  rarest_window_host_count: number; // host count of the rarest shared window (lower = more discriminating)
  tablet_window_count: number; // total length-20 windows the tablet hosts
  overlap_fraction: number; // shared_window_count / tablet_window_count
  signal: ConflictSignal;
};

export type SurfaceGenreConflictsResult = {
  conflicts: GenreConflict[];
  by_family_pair: Record<string, number>; // e.g. { "magic-in-medicine": 28, ... }
  by_signal: Record<ConflictSignal, number>;
  stats: {
    assignments_scanned: number;
    conf_above_threshold: number;
    cross_family: number;
    corroborated: number;
    exemplars_excluded: number; // self-exemplar tablets skipped
  };
  params: {
    min_confidence: number;
    min_shared_chunks: number;
    discriminating_host_max: number;
    misassignment_fraction_min: number;
    max_window_host_count: number | null;
  };
  warnings: string[];
};

export type SurfaceGenreConflictsOptions = {
  /** identify_composition confidence floor. Default 0.95. */
  minConfidence?: number;
  /** Minimum length-20 windows shared with the exemplar set. Default 1. */
  minSharedChunks?: number;
  /** Restrict to one model composition_id (e.g. "mis_pi"). */
  compositionId?: string;
  /** A shared window hosted by ≤ this many tablets counts as "discriminating". Default 5. */
  discriminatingHostMax?: number;
  /** overlap_fraction ≥ this on a discriminating hit ⇒ likely_misassignment. Default 0.4. */
  misassignmentFractionMin?: number;
  /** If set, keep only hits whose rarest shared window is hosted by ≤ this many tablets
   *  (drops the formulaic/boilerplate tail). Default null (keep all, classified). */
  maxWindowHostCount?: number;
  /** If set, keep only hits with this signal. */
  signal?: ConflictSignal;
  /** Override cache root for tests. */
  cacheDirOverride?: string;
};

// ─── Family extractors (pure, exported for testing) ─────────────────────────

/** Model-side family = token before "/" in typical_genre. "magic / ritual" → "magic". */
export function compositionFamily(typicalGenre: string | null | undefined): string | null {
  if (!typicalGenre) return null;
  const head = typicalGenre.split("/")[0].trim().toLowerCase();
  return head || null;
}

/**
 * Catalog-side family from an eBL `primary_genre` path. Substring priority — the
 * medicine family (incl. eBL's "Medical"/"Therapeutic" leaves) is checked before
 * Magic so a nested "Technical → Medicine" path resolves to medicine, not magic.
 * null = uncategorized (excluded from conflict detection).
 */
export function eblGenreFamily(genre: string | null | undefined): string | null {
  if (!genre) return null;
  if (/medicine|medical|therapeutic/i.test(genre)) return "medicine";
  if (/magic/i.test(genre)) return "magic";
  if (/divination/i.test(genre)) return "divination";
  if (/literature/i.test(genre)) return "literature";
  if (/lexical/i.test(genre)) return "lexical";
  return null;
}

/** Classify a corroborated hit by shared-window rarity + overlap fraction. */
export function classifyConflict(
  rarestHost: number | null,
  overlapFraction: number,
  discriminatingHostMax: number,
  misassignmentFractionMin: number,
): ConflictSignal {
  if (rarestHost == null || rarestHost > discriminatingHostMax) return "formulaic";
  return overlapFraction >= misassignmentFractionMin ? "likely_misassignment" : "embedded_quotation_candidate";
}

// ─── Assignment-cache loader (read-only mirror of v0.54 cache) ──────────────

type CachedAssignment = {
  top_composition_id?: string;
  confidence?: number;
  primary_genre?: string;
  is_in_exemplar_list?: boolean;
};

function cacheDir(override?: string): string {
  return override || process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache/cuneiform-mcp");
}

function loadAssignments(override?: string): Record<string, CachedAssignment> | null {
  const path = join(cacheDir(override), "composition-assignments.json");
  if (!existsSync(path)) return null;
  try {
    return (JSON.parse(readFileSync(path, "utf-8")).assignments ?? null) as Record<string, CachedAssignment> | null;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function surfaceGenreConflicts(opts: SurfaceGenreConflictsOptions = {}): SurfaceGenreConflictsResult {
  const minConfidence = opts.minConfidence ?? 0.95;
  const minSharedChunks = Math.max(1, opts.minSharedChunks ?? 1);
  const discriminatingHostMax = opts.discriminatingHostMax ?? 5;
  const misassignmentFractionMin = opts.misassignmentFractionMin ?? 0.4;
  const maxWindowHostCount = opts.maxWindowHostCount ?? null;
  const warnings: string[] = [];

  const familyOf = new Map<string, string | null>();
  const exemplarsOf = new Map<string, Set<string>>();
  for (const c of COMPOSITION_REGISTRY) {
    familyOf.set(c.id, compositionFamily(c.typical_genre));
    exemplarsOf.set(c.id, new Set(c.exemplar_tablets ?? []));
  }

  const assignments = loadAssignments(opts.cacheDirOverride);
  const emptyBySignal: Record<ConflictSignal, number> = {
    embedded_quotation_candidate: 0,
    likely_misassignment: 0,
    formulaic: 0,
  };
  if (!assignments) {
    warnings.push("composition-assignments.json not found — run scripts/build-corpus-composition-assignments.mjs.");
    return {
      conflicts: [],
      by_family_pair: {},
      by_signal: { ...emptyBySignal },
      stats: { assignments_scanned: 0, conf_above_threshold: 0, cross_family: 0, corroborated: 0, exemplars_excluded: 0 },
      params: {
        min_confidence: minConfidence,
        min_shared_chunks: minSharedChunks,
        discriminating_host_max: discriminatingHostMax,
        misassignment_fraction_min: misassignmentFractionMin,
        max_window_host_count: maxWindowHostCount,
      },
      warnings,
    };
  }

  // Per-composition exemplar window index: hash → { host_count, exemplar } (memoized).
  const exIndexCache = new Map<string, Map<string, { host: number; exemplar: string }>>();
  function exemplarWindowIndex(compId: string): Map<string, { host: number; exemplar: string }> {
    let idx = exIndexCache.get(compId);
    if (idx) return idx;
    idx = new Map();
    for (const ex of exemplarsOf.get(compId) ?? []) {
      for (const entry of getChunksContaining(ex)) {
        if (!idx.has(entry.hash)) idx.set(entry.hash, { host: entry.occurrences.length, exemplar: ex });
      }
    }
    exIndexCache.set(compId, idx);
    return idx;
  }

  let confAbove = 0;
  let crossFamily = 0;
  let exemplarsExcluded = 0;
  const conflicts: GenreConflict[] = [];
  const byPair: Record<string, number> = {};
  const bySignal: Record<ConflictSignal, number> = { ...emptyBySignal };

  for (const [tablet, a] of Object.entries(assignments)) {
    const compId = a.top_composition_id;
    if (!compId || (a.confidence ?? 0) <= minConfidence) continue;
    if (opts.compositionId && compId !== opts.compositionId) continue;
    // A registry exemplar of its OWN assigned composition is not "catalog-invisible".
    if (a.is_in_exemplar_list && (exemplarsOf.get(compId)?.has(tablet) ?? false)) {
      exemplarsExcluded++;
      continue;
    }
    confAbove++;
    const cf = familyOf.get(compId) ?? null;
    const ef = eblGenreFamily(a.primary_genre);
    if (!cf || !ef || cf === ef) continue;
    crossFamily++;

    // Shared-window evidence against the composition's exemplar set.
    const exIdx = exemplarWindowIndex(compId);
    if (exIdx.size === 0) continue;
    const tabletChunks = getChunksContaining(tablet);
    let shared = 0;
    let rarestHost = Infinity;
    let rarestExemplar = "";
    for (const entry of tabletChunks) {
      const hit = exIdx.get(entry.hash);
      if (!hit) continue;
      shared++;
      if (hit.host < rarestHost) {
        rarestHost = hit.host;
        rarestExemplar = hit.exemplar;
      }
    }
    if (shared < minSharedChunks) continue;

    const tabletWindows = tabletChunks.length;
    const overlapFraction = tabletWindows > 0 ? shared / tabletWindows : 0;
    const signal = classifyConflict(rarestHost === Infinity ? null : rarestHost, overlapFraction, discriminatingHostMax, misassignmentFractionMin);

    if (maxWindowHostCount != null && rarestHost > maxWindowHostCount) continue;
    if (opts.signal && signal !== opts.signal) continue;

    const key = `${cf}-in-${ef}`;
    byPair[key] = (byPair[key] ?? 0) + 1;
    bySignal[signal]++;
    conflicts.push({
      tablet_id: tablet,
      composition_id: compId,
      composition_family: cf,
      ebl_genre: a.primary_genre ?? "",
      ebl_family: ef,
      confidence: +(a.confidence ?? 0).toFixed(4),
      matched_exemplar: rarestExemplar,
      shared_window_count: shared,
      rarest_window_host_count: rarestHost === Infinity ? 0 : rarestHost,
      tablet_window_count: tabletWindows,
      overlap_fraction: +overlapFraction.toFixed(4),
      signal,
    });
  }

  // Most informative first: embedded candidates, then misassignments, then formulaic;
  // within a signal, rarer shared window first, then lower overlap fraction.
  const signalRank: Record<ConflictSignal, number> = {
    embedded_quotation_candidate: 0,
    likely_misassignment: 1,
    formulaic: 2,
  };
  conflicts.sort(
    (x, y) =>
      signalRank[x.signal] - signalRank[y.signal] ||
      x.rarest_window_host_count - y.rarest_window_host_count ||
      x.overlap_fraction - y.overlap_fraction ||
      x.tablet_id.localeCompare(y.tablet_id),
  );

  return {
    conflicts,
    by_family_pair: byPair,
    by_signal: bySignal,
    stats: {
      assignments_scanned: Object.keys(assignments).length,
      conf_above_threshold: confAbove,
      cross_family: crossFamily,
      corroborated: conflicts.length,
      exemplars_excluded: exemplarsExcluded,
    },
    params: {
      min_confidence: minConfidence,
      min_shared_chunks: minSharedChunks,
      discriminating_host_max: discriminatingHostMax,
      misassignment_fraction_min: misassignmentFractionMin,
      max_window_host_count: maxWindowHostCount,
    },
    warnings,
  };
}
