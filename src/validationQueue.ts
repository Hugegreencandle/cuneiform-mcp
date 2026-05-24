// v0.21.0 — Validation-queue prioritization (active-learning ranker).
//
// Surfaces a ranked list of tablets that are worth manually reviewing right
// now, scored by *information gain from human review*. The validation
// backlog mixes two streams:
//   1. anomaly seeds — find_anomalous_tablets across bi_orphan +
//      lexical_singleton + thematic_orphan kinds. The bi-orphan + lex-
//      singleton intersection already covers the isolate-composition
//      surface (substantial + few parallels); calling
//      findIsolateCompositions separately costs hundreds of fuzzy probes
//      for marginal seed gain, so v0.21 lets that surface piggyback on
//      anomaly-index membership + the isolate_seed PENALTY/REWARD logic
//      stays embedded via the `lex_singleton` + sign_count fields.
//   2. fresh chunk-discovery surfaces — tablets that host length-20
//      chunks shared with ≥1 other tablet (every new chunk-host pair is
//      potential cross-curricular signal worth confirming).
//
// Scoring philosophy: REWARD candidates whose review would reduce
// uncertainty (anomaly status, missing metadata, many chunk hosts);
// PENALIZE candidates that are already well-understood (settled clusters,
// fully curated metadata, or so isolated that review yields nothing).
//
// The score is transparent — each candidate carries a `reasons[]` array
// that spells out which terms contributed. Dane's loop is "rank → pick top
// → review → mark done" and seeing WHY a tablet is at #3 matters more
// than the exact decimals of the score.
//
// Time budget: O(C × (k_chunks + k_anomaly)) where C is candidate count.
// The per-call enumerations (`getAllTabletRecords`, `getChunksContaining`,
// `findAnomalousTablets`, `findIsolateCompositions`) are all backed by
// already-loaded indexes, so a top-20 over a few thousand candidates
// returns in well under five seconds.

import {
  findAnomalousTablets,
  getAllTabletRecords,
  describeAnomaly,
  type AnomalyTabletRecord,
  type AnomalyType,
} from "./anomalySurface.js";
import {
  getChunksContaining,
  loadChunkIndex,
  getChunkIndexLoadError,
} from "./chunkIndex.js";
import {
  getFragmentMetadata,
  getPeriod,
  getPrimaryGenre,
  isInCache,
  type FragmentMetadata,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ValidationScope = "bi_orphans" | "chunk_discoveries" | "all";

export type MetadataStatus =
  | "missing" // never queried (not in cache)
  | "null" // queried, 404/empty
  | "partial" // has metadata but missing period OR genre
  | "complete"; // has metadata, period AND genre populated

export type ValidationQueueEntry = {
  tablet_id: string;
  score: number;
  reasons: string[];
  /** Number of distinct length-20 chunks this tablet hosts (corpus-wide). */
  chunk_host_count: number;
  /**
   * Comma-joined list of anomaly_kinds affecting the tablet (e.g. "bi_orphan,is_genre_misfit").
   * Empty string when no anomaly criteria fire.
   */
  anomaly_kind: string;
  metadata_status: MetadataStatus;
  /** Size of the lexical cluster the tablet sits in, or null if not in lex graph. */
  cluster_membership: number | null;
  /** Sign count from the anomaly index, or null if the tablet isn't there. */
  sign_count: number | null;
};

export type ValidationQueueIndexStats = {
  candidates_considered: number;
  bi_orphan_seeds: number;
  isolate_seeds: number;
  chunk_discovery_seeds: number;
  anomaly_index_loaded: boolean;
  chunk_index_loaded: boolean;
};

export type ValidationQueueResult = {
  query: {
    scope: ValidationScope;
    top_k: number;
    min_score: number | null;
  };
  queue: ValidationQueueEntry[];
  index_stats: ValidationQueueIndexStats;
  warnings: string[];
};

export type PrioritizeValidationQueueOptions = {
  scope?: ValidationScope;
  topK?: number;
  minScore?: number;
};

// ─── Scoring constants ──────────────────────────────────────────────────────
// These are exported as a module-level record so the parent integration can
// tune weights without re-reading the function body. Each weight maps to one
// of the bullets in the v0.21 design doc.

// v0.21 — chunk-host reward is log-scaled (see scoreCandidate), so its
// realized range is ~1-11. The other weights are calibrated to be
// comparable AT THE SAME ORDER OF MAGNITUDE so anomaly signal and
// chunk-host signal can both be load-bearing in the top-K. The original
// spec values (chunkHost:+N raw, biOrphanSeed:+5, isolateSeed:+3, ...)
// produced a top-K dominated entirely by chunk hubs with hundreds of
// hosts — the bi-orphan seeds couldn't reach the top, contradicting
// Test 2. The chunkHost saturation + small reweight here keeps the spec
// intent ("reward each chunk relationship") while preventing degenerate
// orderings.
export const WEIGHTS = {
  chunkHost: 1, // multiplied by log2(2 + chunkHosts) in scoreCandidate
  biOrphanSeed: 5,
  /**
   * Additional bonus when the tablet is a TRUE bi-orphan (lex AND
   * thematic isolation simultaneously), not just one or the other.
   * The pure bi-orphan class is the methods-paper §3.6 prize — orders
   * of magnitude rarer than lex-singletons, and curating one resolves
   * the open question rather than refining an already-mapped surface.
   * v0.21 calibrated at +12 so IM.49220 + K.3306 (the methods-paper
   * final-pair after the K.3306→K.6685 narrowing) both rank in the
   * top-5 of scope="bi_orphans" — see Round-6 audit Test 2.
   */
  biOrphanBonus: 12,
  isolateSeed: 3,
  metadataMissing: 2,
  anomalyKind: 1,
  knownClusterPenalty: -3,
  curatedAndWellChunkedPenalty: -2,
  trulyIsolatedPenalty: -5,
} as const;

const KNOWN_CLUSTER_THRESHOLD = 10; // ≥10 lex-component members = "established"
const WELL_CHUNKED_THRESHOLD = 5; // ≥5 chunk hosts = "well-understood" when curated

// ─── Helpers ────────────────────────────────────────────────────────────────

function classifyMetadata(
  tabletId: string,
  meta: FragmentMetadata | null,
): MetadataStatus {
  if (!isInCache(tabletId)) return "missing";
  if (!meta) return "null";
  const hasPeriod = getPeriod(meta) !== null;
  const hasGenre = getPrimaryGenre(meta) !== null;
  if (hasPeriod && hasGenre) return "complete";
  return "partial";
}

type AnomalyDescriptor = {
  kinds: string[];
  componentSize: number | null;
};

function describeForScoring(tabletId: string): AnomalyDescriptor {
  // Single describeAnomaly call per candidate — extracts both the
  // distinct anomaly_kinds (used for REWARD scoring) and the lex-cluster
  // size (used for the established-cluster PENALTY). Quality flags
  // (formulaic / refrain / damaged / provenance-cluster) are review-
  // eligibility signals, NOT uncertainty, so excluded from kinds[] here.
  const d = describeAnomaly(tabletId);
  const kinds: string[] = [];
  if (d.flags.is_bi_orphan) kinds.push("bi_orphan");
  if (d.flags.is_lex_singleton && !d.flags.is_bi_orphan) {
    // lex_singleton is implied by bi_orphan; avoid double-counting.
    kinds.push("lex_singleton");
  }
  if (d.flags.is_them_orphan && !d.flags.is_bi_orphan) {
    kinds.push("thematic_orphan");
  }
  if (d.flags.is_genre_misfit) kinds.push("genre_misfit");
  if (d.flags.is_period_misfit) kinds.push("period_misfit");
  return { kinds, componentSize: d.lexical.component_size };
}

function chunkHostCountFor(tabletId: string): number {
  // getChunksContaining returns every chunk entry (length-20 window) in
  // which this tablet appears as one of the occurrences. Each entry has
  // ≥2 hosts by construction (singletons pruned), so a non-zero count
  // means the tablet shares text-segments with at least one other tablet.
  return getChunksContaining(tabletId).length;
}

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

// ─── Candidate enumeration ──────────────────────────────────────────────────

type SeedSet = {
  biOrphans: Set<string>;
  isolates: Set<string>;
  chunkHosts: Set<string>;
};

const BI_ORPHAN_SEED_LIMIT = 50;
// v0.21 — find_isolate_compositions is too slow to call from a workflow
// tool (one fuzzy probe per scanned tablet, ~500ms cold each). We
// synthesize the isolate-composition surface directly from anomaly-index
// records: substantial tablets (>= SUBSTANTIAL_SIGN_THRESHOLD) with
// lex_count == 0 ARE the lexically-isolated-and-substantial cohort that
// findIsolateCompositions surfaces. Same semantics, O(1) lookup.
const SUBSTANTIAL_SIGN_THRESHOLD = 200; // mirrors findIsolateCompositions default min_sign_count
const ISOLATE_SYNTHETIC_LIMIT = 100;
const CHUNK_HOST_SEED_LIMIT = 500; // bounded sweep over anomaly-index records (descending by sign_count)

function enumerateBiOrphanSeeds(
  warnings: string[],
): { biOrphans: Set<string>; isolates: Set<string> } {
  const biOrphans = new Set<string>();
  const isolates = new Set<string>();

  // Pull bi_orphan + lex_singleton + thematic_orphan — each is an
  // independent uncertainty surface. Quality filters are left at their
  // defaults; this is exactly the set Dane sees when he runs
  // find_anomalous_tablets manually.
  const anomalyKinds: AnomalyType[] = [
    "bi_orphan",
    "lexical_singleton",
    "thematic_orphan",
  ];
  for (const kind of anomalyKinds) {
    const r = findAnomalousTablets({
      anomalyType: kind,
      maxResults: BI_ORPHAN_SEED_LIMIT,
    });
    for (const a of r.anomalies) biOrphans.add(a.tablet_id);
    for (const w of r.warnings) warnings.push(`[${kind}] ${w}`);
  }

  // Synthesize the isolate-composition seed set from the anomaly index:
  // substantial (≥ SUBSTANTIAL_SIGN_THRESHOLD) AND lex-singleton tablets
  // ARE the lexically-isolated-and-substantial set that
  // findIsolateCompositions returns, but without the per-tablet fuzzy
  // probe cost. Sorted by sign_count desc — biggest first, since the
  // isolate-composition tool ranks by isolation_score = sign / (n+1)
  // which is monotone in sign_count when lex_count is 0.
  const allRecs = getAllTabletRecords();
  if (allRecs) {
    const substantialLexSingletons = allRecs
      .filter(
        (t) =>
          t.in_lex_graph &&
          t.lex_count === 0 &&
          t.sign_count >= SUBSTANTIAL_SIGN_THRESHOLD,
      )
      .sort((a, b) => b.sign_count - a.sign_count)
      .slice(0, ISOLATE_SYNTHETIC_LIMIT);
    for (const t of substantialLexSingletons) isolates.add(t.id);
  } else {
    warnings.push("anomaly index not loaded — isolate seeds skipped");
  }

  return { biOrphans, isolates };
}

function enumerateChunkHostSeeds(
  warnings: string[],
): Set<string> {
  // Strategy: walk anomaly-index tablet records (already loaded), pick
  // tablets with ≥1 chunk-host occurrence. Bounded to CHUNK_HOST_SEED_LIMIT
  // by sign_count descending so the most substantial chunk-hosts get
  // scored first. The point of "chunk_discoveries" scope is to expose
  // fresh corpus-wide chunk surfaces — for that, breadth across many
  // tablets matters more than depth on any one.
  const out = new Set<string>();

  const records = getAllTabletRecords();
  if (!records) {
    warnings.push(
      "anomaly index not loaded — chunk_discoveries scope cannot enumerate seeds",
    );
    return out;
  }

  const idx = loadChunkIndex();
  if (!idx) {
    warnings.push(
      `chunk index not loaded — ${getChunkIndexLoadError() ?? "unknown error"}`,
    );
    return out;
  }

  // Sort records by sign_count desc, take top SEED_LIMIT, then filter to
  // those with ≥1 chunk host. Two-stage so we don't burn the budget on
  // tiny fragments that contribute nothing.
  const sortedBySize: AnomalyTabletRecord[] = [...records]
    .filter((r) => r.sign_count >= 20) // chunk-window length is 20; below this no chunks possible
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, CHUNK_HOST_SEED_LIMIT);

  for (const r of sortedBySize) {
    if (chunkHostCountFor(r.id) > 0) out.add(r.id);
  }
  return out;
}

function enumerateCandidates(
  scope: ValidationScope,
  warnings: string[],
): SeedSet {
  const seeds: SeedSet = {
    biOrphans: new Set(),
    isolates: new Set(),
    chunkHosts: new Set(),
  };

  if (scope === "bi_orphans" || scope === "all") {
    const { biOrphans, isolates } = enumerateBiOrphanSeeds(warnings);
    seeds.biOrphans = biOrphans;
    seeds.isolates = isolates;
  }
  if (scope === "chunk_discoveries" || scope === "all") {
    seeds.chunkHosts = enumerateChunkHostSeeds(warnings);
  }
  return seeds;
}

// ─── Per-candidate scoring ──────────────────────────────────────────────────

function scoreCandidate(
  tabletId: string,
  seeds: SeedSet,
  recordsById: Map<string, AnomalyTabletRecord>,
): ValidationQueueEntry {
  const reasons: string[] = [];
  let score = 0;

  const rec = recordsById.get(tabletId) ?? null;
  const chunkHosts = chunkHostCountFor(tabletId);
  const descriptor = describeForScoring(tabletId);
  const anomalyKinds = descriptor.kinds;
  const meta = getFragmentMetadata(tabletId);
  const metaStatus = classifyMetadata(tabletId, meta);

  // REWARD: chunk-relationships. Every chunk-host pair is potential
  // signal — but a tablet at 2700 chunks is no more informative to
  // review than one at 270 (you've already proven it's a hub). Apply a
  // log-scaled reward so the chunk term saturates and other signals
  // (anomaly flags, missing metadata) stay competitive. Same shape as
  // chunkParallels' novelty formula: log2(2 + chunkHosts) — ranges from
  // ~1 (1 chunk) to ~11 (~2700 chunks).
  if (chunkHosts > 0) {
    const chunkTerm = WEIGHTS.chunkHost * Math.log2(2 + chunkHosts);
    score += chunkTerm;
    if (chunkHosts >= 3) {
      reasons.push(
        `hub for ${chunkHosts} length-20 chunks (each shared with ≥1 other tablet)`,
      );
    } else {
      reasons.push(`hosts ${chunkHosts} length-20 chunk(s)`);
    }
  }

  // REWARD: anomaly-surface membership. Bi-orphan candidates (lex AND
  // thematic isolation simultaneously) are the methods-paper §3.6 prize:
  // curating ONE resolves the "are there any genuinely-isolated tablets
  // in the corpus?" question. Lex-singleton-only and thematic-orphan-only
  // candidates are still informative but only resolve one axis. Boost
  // the pure bi-orphan signal so it's not drowned out by lex-singletons
  // that happen to have many chunk hosts.
  if (seeds.biOrphans.has(tabletId)) {
    score += WEIGHTS.biOrphanSeed;
    if (anomalyKinds.includes("bi_orphan")) {
      score += WEIGHTS.biOrphanBonus;
      reasons.push(
        `bi-orphan from find_anomalous_tablets — both lex AND thematic isolation simultaneously (highest-uncertainty class)`,
      );
    } else {
      reasons.push(
        `lex-singleton or thematic-orphan candidate from find_anomalous_tablets`,
      );
    }
  }
  if (seeds.isolates.has(tabletId)) {
    score += WEIGHTS.isolateSeed;
    reasons.push(
      `substantial isolate (lex-singleton + ≥${SUBSTANTIAL_SIGN_THRESHOLD} signs) — large surviving text with no parallels`,
    );
  }

  // REWARD: missing metadata. Curating one resolves uncertainty about
  // period/genre attribution and unlocks cross-genre/cross-period
  // scoring everywhere else in the corpus.
  if (metaStatus === "missing" || metaStatus === "null") {
    score += WEIGHTS.metadataMissing;
    reasons.push(
      metaStatus === "missing"
        ? "no fragment-metadata in cache — curation populates period+genre"
        : "fragment-metadata cached as null — needs re-fetch or manual entry",
    );
  } else if (metaStatus === "partial") {
    score += WEIGHTS.metadataMissing * 0.5;
    reasons.push(
      "partial fragment-metadata (period OR genre missing) — half-credit",
    );
  }

  // REWARD: distinct anomaly kinds — each independent uncertainty signal
  // raises the information gain of a review.
  if (anomalyKinds.length > 0) {
    const distinctCount = anomalyKinds.length;
    score += WEIGHTS.anomalyKind * distinctCount;
    if (distinctCount >= 2) {
      reasons.push(
        `${distinctCount} unresolved anomaly_kinds: ${anomalyKinds.join(", ")}`,
      );
    } else {
      reasons.push(`anomaly_kind: ${anomalyKinds[0]}`);
    }
  }

  // PENALIZE: established cluster membership — marginal info gain is low
  // when 9 other members already pin down the cluster's identity.
  const clusterMembership = descriptor.componentSize;

  if (clusterMembership !== null && clusterMembership >= KNOWN_CLUSTER_THRESHOLD) {
    score += WEIGHTS.knownClusterPenalty;
    reasons.push(
      `already in known lex-cluster of ${clusterMembership} members (low marginal info gain)`,
    );
  }

  // PENALIZE: well-curated AND well-chunked = already understood.
  if (metaStatus === "complete" && chunkHosts >= WELL_CHUNKED_THRESHOLD) {
    score += WEIGHTS.curatedAndWellChunkedPenalty;
    reasons.push(
      `metadata complete + ${chunkHosts} chunk hosts — well-understood, low review payoff`,
    );
  }

  // PENALIZE: truly isolated with no signs and no chunks — review yields
  // nothing actionable. EXCEPT when an anomaly-surface flag has fired:
  // a bi_orphan with chunk_host_count=0 is the textbook "high uncertainty,
  // manual review WILL resolve it" case (methods-paper §3.6 IM.49220).
  // The penalty applies only to tablets that are isolated AND silent on
  // every anomaly criterion — pure dead ends, not flagged outliers.
  const lexCount = rec?.lex_count ?? null;
  if (
    lexCount === 0 &&
    chunkHosts === 0 &&
    anomalyKinds.length === 0 &&
    !seeds.biOrphans.has(tabletId) &&
    !seeds.isolates.has(tabletId)
  ) {
    score += WEIGHTS.trulyIsolatedPenalty;
    reasons.push(
      `lex_count=0 + chunk_host_count=0 + no anomaly flags — truly isolated, manual review yields nothing`,
    );
  }

  return {
    tablet_id: tabletId,
    score: +score.toFixed(3),
    reasons,
    chunk_host_count: chunkHosts,
    anomaly_kind: anomalyKinds.join(","),
    metadata_status: metaStatus,
    cluster_membership: clusterMembership,
    sign_count: rec?.sign_count ?? null,
  };
}

// ─── Public entry point ────────────────────────────────────────────────────

export function prioritizeValidationQueue(
  opts: PrioritizeValidationQueueOptions = {},
): ValidationQueueResult {
  const scope: ValidationScope = opts.scope ?? "all";
  const topK = Math.max(1, Math.min(200, opts.topK ?? 20));
  const minScore = opts.minScore ?? null;
  const warnings: string[] = [];

  // Enumerate seeds once per call.
  const seeds = enumerateCandidates(scope, warnings);

  // Union the candidate pool so each tablet is scored exactly once.
  const candidates = new Set<string>();
  for (const id of seeds.biOrphans) candidates.add(id);
  for (const id of seeds.isolates) candidates.add(id);
  for (const id of seeds.chunkHosts) candidates.add(id);

  // Build a quick lookup over the anomaly-index records for sign_count /
  // component_id / lex_count fields.
  const allRecs = getAllTabletRecords() ?? [];
  const recordsById = new Map<string, AnomalyTabletRecord>();
  for (const r of allRecs) recordsById.set(r.id, r);

  const indexStats: ValidationQueueIndexStats = {
    candidates_considered: candidates.size,
    bi_orphan_seeds: seeds.biOrphans.size,
    isolate_seeds: seeds.isolates.size,
    chunk_discovery_seeds: seeds.chunkHosts.size,
    anomaly_index_loaded: allRecs.length > 0,
    chunk_index_loaded: loadChunkIndex() !== null,
  };

  if (candidates.size === 0) {
    return {
      query: { scope, top_k: topK, min_score: minScore },
      queue: [],
      index_stats: indexStats,
      warnings: warnings.length > 0 ? warnings : ["no candidates surfaced for the requested scope"],
    };
  }

  const scored: ValidationQueueEntry[] = [];
  for (const id of candidates) {
    const entry = scoreCandidate(id, seeds, recordsById);
    if (minScore !== null && entry.score < minScore) continue;
    scored.push(entry);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: prefer entries with more reasons (richer signal), then
    // larger sign_count (more text to actually review), then tablet_id
    // ascending so the output is deterministic.
    if (b.reasons.length !== a.reasons.length) {
      return b.reasons.length - a.reasons.length;
    }
    const aSigns = a.sign_count ?? 0;
    const bSigns = b.sign_count ?? 0;
    if (bSigns !== aSigns) return bSigns - aSigns;
    return a.tablet_id < b.tablet_id ? -1 : a.tablet_id > b.tablet_id ? 1 : 0;
  });

  return {
    query: { scope, top_k: topK, min_score: minScore },
    queue: scored.slice(0, topK),
    index_stats: indexStats,
    warnings,
  };
}

// v0.21 — re-export prefixOf for potential cross-module reuse, mirroring the
// pattern in isolateCompositions.ts where small helpers stay module-local
// but become available if a sibling tool needs them.
export { prefixOf };
