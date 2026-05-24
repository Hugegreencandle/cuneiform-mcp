// v0.31.0 — Persistent validation-resolution store (active-learning feedback loop).
//
// Closes one of the v1.0 readiness gates: grow the labeled-pair set from the
// bootstrap n=12 (methods-paper hardcoded positives in
// scripts/train-joint-pair-model.mjs) toward the ≥100 production-quality
// threshold organically as Dane works the prioritize_validation_queue ranker.
//
// The loop:
//   1. prioritize_validation_queue surfaces top-K candidates
//   2. Dane reviews a candidate; concludes the pair is positive / negative / uncertain
//   3. record_validation_resolution persists that judgment
//   4. (offline) scripts/train-joint-pair-model.mjs reads the persisted positives
//      alongside the methods-paper hardcoded list when retraining
//
// Storage: JSON file at ~/.cache/cuneiform-mcp/validation-resolutions.json.
// Same convention as joint-pair-model.json, sign-embeddings.json, etc.

import fs from "fs";
import path from "path";
import os from "os";

export type ResolutionVerdict = "positive" | "negative" | "uncertain";

export type ResolutionSource =
  | "validation_queue"
  | "user_manual"
  | "methods_paper"
  | "audit_resolution";

export type ValidationResolution = {
  pair_id: string;
  tablet_a: string;
  tablet_b: string;
  verdict: ResolutionVerdict;
  rationale: string;
  recorded_at: string;
  recorded_by: string;
  source: ResolutionSource;
  methods_paper_section: string | null;
  tool_version: string;
};

export type ResolutionStoreStats = {
  n_total: number;
  n_positive: number;
  n_negative: number;
  n_uncertain: number;
  n_by_source: Record<ResolutionSource, number>;
  progress_to_v1_target: number;
  v1_target_positives: number;
  bootstrap_positives_from_methods_paper: number;
};

export type ValidationResolutionsStore = {
  schema_version: 1;
  created_at: string;
  updated_at: string;
  resolutions: ValidationResolution[];
  stats: ResolutionStoreStats;
};

const V1_POSITIVE_TARGET = 100;
const BOOTSTRAP_POSITIVES = 12;
const STORE_FILE = "validation-resolutions.json";

function cacheDir(): string {
  return path.join(os.homedir(), ".cache", "cuneiform-mcp");
}

export function resolutionsCachePath(): string {
  return path.join(cacheDir(), STORE_FILE);
}

export function canonicalPairId(a: string, b: string): string {
  if (a === b) throw new Error(`canonicalPairId: tablet_a and tablet_b must differ (got "${a}")`);
  const [x, y] = [a, b].sort();
  return `${x}↔${y}`;
}

export function emptyStore(): ValidationResolutionsStore {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    created_at: now,
    updated_at: now,
    resolutions: [],
    stats: recomputeStats([]),
  };
}

export function recomputeStats(resolutions: ValidationResolution[]): ResolutionStoreStats {
  const bySource: Record<ResolutionSource, number> = {
    validation_queue: 0,
    user_manual: 0,
    methods_paper: 0,
    audit_resolution: 0,
  };
  let pos = 0;
  let neg = 0;
  let unc = 0;
  for (const r of resolutions) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    if (r.verdict === "positive") pos++;
    else if (r.verdict === "negative") neg++;
    else unc++;
  }
  const allPositives = pos + BOOTSTRAP_POSITIVES;
  return {
    n_total: resolutions.length,
    n_positive: pos,
    n_negative: neg,
    n_uncertain: unc,
    n_by_source: bySource,
    progress_to_v1_target: Math.min(1, allPositives / V1_POSITIVE_TARGET),
    v1_target_positives: V1_POSITIVE_TARGET,
    bootstrap_positives_from_methods_paper: BOOTSTRAP_POSITIVES,
  };
}

export function loadResolutionsStore(): ValidationResolutionsStore {
  const fp = resolutionsCachePath();
  if (!fs.existsSync(fp)) return emptyStore();
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(raw) as ValidationResolutionsStore;
    if (parsed.schema_version !== 1) {
      throw new Error(`unsupported schema_version: ${parsed.schema_version}`);
    }
    parsed.stats = recomputeStats(parsed.resolutions);
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to load resolutions store at ${fp}: ${msg}`);
  }
}

export function saveResolutionsStore(store: ValidationResolutionsStore): void {
  const dir = cacheDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fp = resolutionsCachePath();
  store.updated_at = new Date().toISOString();
  store.stats = recomputeStats(store.resolutions);
  fs.writeFileSync(fp, JSON.stringify(store, null, 2));
}

export type RecordResolutionInput = {
  tabletA: string;
  tabletB: string;
  verdict: ResolutionVerdict;
  rationale: string;
  recordedBy?: string;
  source?: ResolutionSource;
  methodsPaperSection?: string;
  toolVersion: string;
};

export type RecordResolutionResult = {
  resolution: ValidationResolution;
  action: "created" | "updated";
  previous: ValidationResolution | null;
  store_stats: ResolutionStoreStats;
  cache_path: string;
};

export function recordResolution(input: RecordResolutionInput): RecordResolutionResult {
  const store = loadResolutionsStore();
  const pairId = canonicalPairId(input.tabletA.trim(), input.tabletB.trim());
  const [aSorted, bSorted] = [input.tabletA.trim(), input.tabletB.trim()].sort();

  const now = new Date().toISOString();
  const resolution: ValidationResolution = {
    pair_id: pairId,
    tablet_a: aSorted,
    tablet_b: bSorted,
    verdict: input.verdict,
    rationale: input.rationale.trim(),
    recorded_at: now,
    recorded_by: (input.recordedBy ?? "manual").trim(),
    source: input.source ?? "validation_queue",
    methods_paper_section: input.methodsPaperSection?.trim() || null,
    tool_version: input.toolVersion,
  };

  const existingIdx = store.resolutions.findIndex((r) => r.pair_id === pairId);
  let action: "created" | "updated";
  let previous: ValidationResolution | null = null;
  if (existingIdx >= 0) {
    previous = store.resolutions[existingIdx];
    store.resolutions[existingIdx] = resolution;
    action = "updated";
  } else {
    store.resolutions.push(resolution);
    action = "created";
  }

  saveResolutionsStore(store);

  return {
    resolution,
    action,
    previous,
    store_stats: store.stats,
    cache_path: resolutionsCachePath(),
  };
}

export type ListResolutionsFilter = {
  verdict?: ResolutionVerdict;
  source?: ResolutionSource;
  tablet?: string;
  sinceIso?: string;
  limit?: number;
};

export type ListResolutionsResult = {
  resolutions: ValidationResolution[];
  total_matched: number;
  total_in_store: number;
  filter_applied: ListResolutionsFilter;
  store_stats: ResolutionStoreStats;
  cache_path: string;
};

export function listResolutions(filter: ListResolutionsFilter = {}): ListResolutionsResult {
  const store = loadResolutionsStore();
  let filtered = store.resolutions.slice();
  if (filter.verdict) filtered = filtered.filter((r) => r.verdict === filter.verdict);
  if (filter.source) filtered = filtered.filter((r) => r.source === filter.source);
  if (filter.tablet) {
    const t = filter.tablet.trim();
    filtered = filtered.filter((r) => r.tablet_a === t || r.tablet_b === t);
  }
  if (filter.sinceIso) {
    const cutoff = filter.sinceIso;
    filtered = filtered.filter((r) => r.recorded_at >= cutoff);
  }

  filtered.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const totalMatched = filtered.length;
  const limited = typeof filter.limit === "number" ? filtered.slice(0, filter.limit) : filtered;

  return {
    resolutions: limited,
    total_matched: totalMatched,
    total_in_store: store.resolutions.length,
    filter_applied: filter,
    store_stats: store.stats,
    cache_path: resolutionsCachePath(),
  };
}

export function _resetForTests(): void {
  const fp = resolutionsCachePath();
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}
