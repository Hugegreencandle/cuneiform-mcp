// v0.55.0 — list_candidate_exemplars.
//
// Reads the v0.54 composition-assignments cache and surfaces discovered
// candidate exemplars (tablets that classify at p≥min_confidence to a
// registry composition but are NOT in that composition's exemplar_tablets
// list). Each candidate is paired with the closest registered exemplar
// for that composition (by registry exemplar order — first listed = the
// canonical anchor) so the candidate becomes an actionable
// record_validation_resolution input.
//
// Used to drive the v1.0 G1 active-learning loop: list → review → record.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { COMPOSITION_REGISTRY, getCompositionById } from "./compositionRegistry.js";
import { loadResolutionsStore, canonicalPairId } from "./validationResolutions.js";
import { REGISTRY_BOOTSTRAP_NOTE_V1 } from "./provenanceTags.js";

const ASSIGNMENTS_FILE = "composition-assignments.json";

export type CandidateExemplar = {
  tablet_id: string;
  composition_id: string;
  composition_name: string;
  composition_type: "specific_composition" | "curriculum";
  confidence: number;
  period: string | null;
  primary_genre: string | null;
  sign_count: number | null;
  suggested_pair_anchor: string;
  suggested_pair_id: string;
  is_already_in_store: boolean;
  rationale: string;
};

export type ListCandidateExemplarsResult = {
  query: {
    composition_id_filter: string | null;
    min_confidence: number;
    exclude_already_in_store: boolean;
    top_k: number;
  };
  candidates: CandidateExemplar[];
  totals_by_composition: Array<{ composition_id: string; count: number }>;
  cache_stats: {
    cache_loaded: boolean;
    cache_built_at: string | null;
    total_assignments: number;
  };
  store_stats: {
    n_positive_in_store: number;
    n_uncertain_in_store: number;
    v1_target: number;
  };
  warnings: string[];
};

export type ListCandidateExemplarsOptions = {
  compositionId?: string;
  minConfidence?: number;
  excludeAlreadyInStore?: boolean;
  topK?: number;
};

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

type CachedAssignment = {
  top_composition_id: string;
  top_composition_name?: string;
  composition_type?: "specific_composition" | "curriculum";
  confidence: number;
  is_in_exemplar_list?: boolean;
  period?: string | null;
  primary_genre?: string | null;
  sign_count?: number | null;
};

type AssignmentsCache = {
  version?: string;
  built_at?: string;
  assignments: Record<string, CachedAssignment>;
};

let _cache: AssignmentsCache | null = null;
let _loadError: string | null = null;

function loadAssignments(): AssignmentsCache | null {
  if (_cache) return _cache;
  if (_loadError) return null;
  const path = join(cacheDir(), ASSIGNMENTS_FILE);
  if (!existsSync(path)) {
    _loadError = `composition-assignments.json not built — run scripts/build-corpus-composition-assignments.mjs`;
    return null;
  }
  try {
    _cache = JSON.parse(readFileSync(path, "utf-8")) as AssignmentsCache;
    return _cache;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export function _resetForTests(): void {
  _cache = null;
  _loadError = null;
}

export function listCandidateExemplars(
  opts: ListCandidateExemplarsOptions = {},
): ListCandidateExemplarsResult {
  const warnings: string[] = [REGISTRY_BOOTSTRAP_NOTE_V1];
  const minConfidence = Math.max(0, Math.min(1, opts.minConfidence ?? 0.9));
  const excludeAlready = opts.excludeAlreadyInStore ?? true;
  const topK = Math.max(1, Math.min(500, opts.topK ?? 50));
  const compFilter = opts.compositionId ?? null;

  const cache = loadAssignments();
  if (!cache) {
    if (_loadError) warnings.push(_loadError);
    return {
      query: {
        composition_id_filter: compFilter,
        min_confidence: minConfidence,
        exclude_already_in_store: excludeAlready,
        top_k: topK,
      },
      candidates: [],
      totals_by_composition: [],
      cache_stats: { cache_loaded: false, cache_built_at: null, total_assignments: 0 },
      store_stats: { n_positive_in_store: 0, n_uncertain_in_store: 0, v1_target: 100 },
      warnings,
    };
  }

  // Build registered-exemplar lookup
  const registered = new Set<string>();
  for (const c of COMPOSITION_REGISTRY) {
    for (const t of c.exemplar_tablets) registered.add(t);
  }

  // Load store for "already in store" filter
  let storePairIds: Set<string>;
  let nPos = 0;
  let nUnc = 0;
  try {
    const store = loadResolutionsStore();
    storePairIds = new Set(store.resolutions.map((r) => r.pair_id));
    nPos = store.stats.n_positive;
    nUnc = store.stats.n_uncertain;
  } catch {
    storePairIds = new Set();
  }

  const candidates: CandidateExemplar[] = [];
  for (const [tabletId, a] of Object.entries(cache.assignments)) {
    if (a.confidence < minConfidence) continue;
    if (compFilter && a.top_composition_id !== compFilter) continue;
    if (registered.has(tabletId)) continue; // already a registered exemplar
    const compEntry = getCompositionById(a.top_composition_id);
    if (!compEntry) continue;
    const anchor = compEntry.exemplar_tablets[0];
    if (!anchor) continue;
    const pid = canonicalPairId(tabletId, anchor);
    const inStore = storePairIds.has(pid);
    if (excludeAlready && inStore) continue;
    candidates.push({
      tablet_id: tabletId,
      composition_id: a.top_composition_id,
      composition_name: a.top_composition_name ?? compEntry.name,
      composition_type: a.composition_type ?? compEntry.composition_type,
      confidence: a.confidence,
      period: a.period ?? null,
      primary_genre: a.primary_genre ?? null,
      sign_count: a.sign_count ?? null,
      suggested_pair_anchor: anchor,
      suggested_pair_id: pid,
      is_already_in_store: inStore,
      rationale: `v0.54 identify_composition assigned ${tabletId} → ${a.top_composition_id} at p=${a.confidence.toFixed(3)}. Suggested pair anchor: ${anchor} (registry's first exemplar of ${a.top_composition_id}). Pair via record_validation_resolution to confirm/reject.`,
    });
  }

  candidates.sort(
    (a, b) =>
      b.confidence - a.confidence || a.tablet_id.localeCompare(b.tablet_id),
  );

  // Compute totals BEFORE topK slicing
  const totalsMap = new Map<string, number>();
  for (const c of candidates) {
    totalsMap.set(c.composition_id, (totalsMap.get(c.composition_id) ?? 0) + 1);
  }
  const totals_by_composition = Array.from(totalsMap.entries())
    .map(([composition_id, count]) => ({ composition_id, count }))
    .sort((a, b) => b.count - a.count);

  return {
    query: {
      composition_id_filter: compFilter,
      min_confidence: minConfidence,
      exclude_already_in_store: excludeAlready,
      top_k: topK,
    },
    candidates: candidates.slice(0, topK),
    totals_by_composition,
    cache_stats: {
      cache_loaded: true,
      cache_built_at: cache.built_at ?? null,
      total_assignments: Object.keys(cache.assignments).length,
    },
    store_stats: { n_positive_in_store: nPos, n_uncertain_in_store: nUnc, v1_target: 100 },
    warnings,
  };
}
