// v0.18.12 — Tablet-level composite discovery tool.
//
// Given ONE tablet, returns its complete 4-axis neighborhood in a single
// MCP call:
//   - Fuzzy parallels   (composition siblings — 1-substitution trigram-J)
//   - Thematic neighbors (random-indexing embedding cosine)
//   - Scribal candidates (LLR-signature cosine — same-scribe lineage)
//   - Join candidates    (deferred — see NOTES at bottom)
//
// Per-pair `compare_tablet_pair` (v0.18.8) zooms on TWO tablets; this tool
// gives the full neighborhood graph around ONE tablet. Replaces the manual
// workflow of running findFuzzyParallels + findThematicParallel +
// findSameScribeCandidates sequentially.
//
// Adds a cross-axis summary: tablets surfaced on MULTIPLE axes are
// higher-confidence relatives. A tablet that appears as both a fuzzy
// parallel AND a same-scribe candidate is likely a true sibling manuscript
// by the same scribe. The recommendations field maps the per-axis count
// pattern to a short Assyriological narrative.
//
// Pure stdlib + reuse of findFuzzyParallels, findThematicParallel,
// findSameScribeCandidates, describeAnomaly, getTabletSignCount.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { findThematicParallel } from "./semanticEmbeddings.js";
import { findSameScribeCandidates } from "./scribalFingerprint.js";
import { describeAnomaly, getTabletSignCount } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type FuzzyAxisHit = {
  tablet_id: string;
  fuzzy_jaccard: number;
  exact_jaccard: number;
  longest_contiguous_run: number;
  final_score: number;
};

export type ThematicAxisHit = {
  tablet_id: string;
  thematic_cosine: number;
};

export type ScribalAxisHit = {
  tablet_id: string;
  signature_cosine: number;
  signature_jaccard: number;
  signature_overlap_count: number;
};

export type JoinAxisHit = {
  tablet_id: string;
  raw_score: number;
  weighted_score: number;
};

export type CrossAxisHit = {
  tablet_id: string;
  axes: Array<"fuzzy" | "thematic" | "scribal" | "join">;
  axis_count: number;
  per_axis_scores: {
    fuzzy_jaccard?: number;
    thematic_cosine?: number;
    signature_cosine?: number;
    join_raw_score?: number;
  };
};

export type TabletNeighborhoodResult = {
  query: {
    tablet_id: string;
    top_k_per_axis: number;
    min_fuzzy_jaccard: number;
    min_thematic_cosine: number;
    min_scribal_cosine: number;
  };
  tablet: {
    tablet_id: string;
    sign_count: number | null;
    in_lex_graph: boolean;
    in_them_index: boolean;
    anomaly_flag: boolean;
  };
  axes: {
    fuzzy_parallels: FuzzyAxisHit[];
    thematic_neighbors: ThematicAxisHit[];
    scribal_candidates: ScribalAxisHit[];
    join_candidates: JoinAxisHit[];
  };
  cross_axis_summary: {
    multi_axis_hits: CrossAxisHit[];
    counts_by_axis_multiplicity: Record<string, number>;
  };
  recommendations: string[];
  warnings: string[];
};

export type TabletNeighborhoodOptions = {
  tabletId: string;
  topKPerAxis?: number;
  minFuzzyJaccard?: number;
  minThematicCosine?: number;
  minScribalCosine?: number;
};

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_TOP_K = 10;
const MAX_TOP_K = 30;
const DEFAULT_MIN_FUZZY = 0.20;
const DEFAULT_MIN_THEMATIC = 0.50;
const DEFAULT_MIN_SCRIBAL = 0.40;

// ─── Axis runners ──────────────────────────────────────────────────────────

function runFuzzyAxis(
  tabletId: string,
  topK: number,
  minFuzzyJaccard: number,
  warnings: string[],
): FuzzyAxisHit[] {
  const result = findFuzzyParallels({
    tabletId,
    topK,
    minFuzzyJaccard,
    minFuzzyIntersect: 1,
  });
  for (const w of result.warnings) {
    warnings.push(`fuzzy: ${w}`);
  }
  return result.parallels.map((p) => ({
    tablet_id: p.tablet_id,
    fuzzy_jaccard: p.fuzzy_jaccard,
    exact_jaccard: p.exact_jaccard,
    longest_contiguous_run: p.longest_contiguous_run,
    final_score: p.final_score,
  }));
}

function runThematicAxis(
  tabletId: string,
  topK: number,
  minCosine: number,
  warnings: string[],
): ThematicAxisHit[] {
  const result = findThematicParallel(tabletId, { topK, minCosine });
  for (const w of result.warnings) {
    warnings.push(`thematic: ${w}`);
  }
  return result.neighbors.map((n) => ({
    tablet_id: n.id,
    thematic_cosine: n.score,
  }));
}

function runScribalAxis(
  tabletId: string,
  topK: number,
  minCosine: number,
  warnings: string[],
): ScribalAxisHit[] {
  // findSameScribeCandidates uses min_jaccard, not cosine. Run with a
  // permissive jaccard floor + min_overlap=1 to surface candidates, then
  // post-filter on signature_cosine to honor the public-facing threshold.
  const result = findSameScribeCandidates({
    tabletId,
    topK: Math.max(topK, MAX_TOP_K),
    minJaccard: 0,
    minOverlap: 1,
  });
  for (const w of result.warnings) {
    warnings.push(`scribal: ${w}`);
  }
  return result.candidates
    .filter((c) => c.signature_cosine >= minCosine)
    .slice(0, topK)
    .map((c) => ({
      tablet_id: c.tablet_id,
      signature_cosine: c.signature_cosine,
      signature_jaccard: c.signature_jaccard,
      signature_overlap_count: c.signature_overlap_count,
    }));
}

// Join axis is intentionally deferred — see NOTES at bottom of file. The
// eBL `/match` algorithm in `find_join_candidates` is async + cache-
// dependent + may require an HTTP fetch for the target's enrichment, which
// is the wrong cost shape for an in-memory cross-axis composite tool.
// `compare_tablet_pair` (v0.18.8) made the same pragmatic skip.
function runJoinAxis(_tabletId: string, _topK: number, warnings: string[]): JoinAxisHit[] {
  warnings.push(
    "join: axis deferred in v0.18.12 — call find_join_candidates separately. " +
      "The eBL /match algorithm is async + corpus-cache-dependent and does not fit " +
      "the synchronous in-memory cost shape of this composite tool. Same pragmatic " +
      "skip as compare_tablet_pair (v0.18.8).",
  );
  return [];
}

// ─── Cross-axis aggregation ────────────────────────────────────────────────

function summarizeCrossAxis(
  fuzzy: FuzzyAxisHit[],
  thematic: ThematicAxisHit[],
  scribal: ScribalAxisHit[],
  join: JoinAxisHit[],
): { multi_axis_hits: CrossAxisHit[]; counts_by_axis_multiplicity: Record<string, number> } {
  type AccEntry = {
    axes: Set<"fuzzy" | "thematic" | "scribal" | "join">;
    scores: CrossAxisHit["per_axis_scores"];
  };
  const acc = new Map<string, AccEntry>();

  const upsert = (
    id: string,
    axis: "fuzzy" | "thematic" | "scribal" | "join",
    score: Partial<CrossAxisHit["per_axis_scores"]>,
  ): void => {
    let entry = acc.get(id);
    if (!entry) {
      entry = { axes: new Set(), scores: {} };
      acc.set(id, entry);
    }
    entry.axes.add(axis);
    entry.scores = { ...entry.scores, ...score };
  };

  for (const h of fuzzy) upsert(h.tablet_id, "fuzzy", { fuzzy_jaccard: h.fuzzy_jaccard });
  for (const h of thematic) upsert(h.tablet_id, "thematic", { thematic_cosine: h.thematic_cosine });
  for (const h of scribal) upsert(h.tablet_id, "scribal", { signature_cosine: h.signature_cosine });
  for (const h of join) upsert(h.tablet_id, "join", { join_raw_score: h.raw_score });

  const multi: CrossAxisHit[] = [];
  const multiplicityCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
  for (const [id, entry] of acc) {
    const k = entry.axes.size;
    multiplicityCounts[String(k)] = (multiplicityCounts[String(k)] ?? 0) + 1;
    if (k >= 2) {
      multi.push({
        tablet_id: id,
        axes: [...entry.axes],
        axis_count: k,
        per_axis_scores: entry.scores,
      });
    }
  }
  multi.sort((a, b) => {
    if (b.axis_count !== a.axis_count) return b.axis_count - a.axis_count;
    // Tie-break: higher fuzzy_jaccard first; then thematic_cosine; then scribal_cosine.
    const af = a.per_axis_scores.fuzzy_jaccard ?? 0;
    const bf = b.per_axis_scores.fuzzy_jaccard ?? 0;
    if (bf !== af) return bf - af;
    const at = a.per_axis_scores.thematic_cosine ?? 0;
    const bt = b.per_axis_scores.thematic_cosine ?? 0;
    if (bt !== at) return bt - at;
    const as = a.per_axis_scores.signature_cosine ?? 0;
    const bs = b.per_axis_scores.signature_cosine ?? 0;
    return bs - as;
  });

  return { multi_axis_hits: multi, counts_by_axis_multiplicity: multiplicityCounts };
}

// ─── Recommendations ───────────────────────────────────────────────────────

function buildRecommendations(
  tabletId: string,
  fuzzy: FuzzyAxisHit[],
  thematic: ThematicAxisHit[],
  scribal: ScribalAxisHit[],
  join: JoinAxisHit[],
  multi: CrossAxisHit[],
  anomalyFlag: boolean,
): string[] {
  const recs: string[] = [];
  const strongFuzzy = fuzzy.filter((p) => p.fuzzy_jaccard >= 0.30).length;
  const veryStrongFuzzy = fuzzy.filter((p) => p.fuzzy_jaccard >= 0.50).length;
  const strongThematic = thematic.filter((n) => n.thematic_cosine >= 0.60).length;
  const strongScribal = scribal.filter((c) => c.signature_cosine >= 0.60).length;

  // Headline pattern recognition
  if (strongFuzzy >= 1 && strongScribal === 0) {
    recs.push(
      `${tabletId} has ${strongFuzzy} strong fuzzy parallel${strongFuzzy === 1 ? "" : "s"} (J≥0.30) but no same-scribe matches (cos≥0.60) — likely same composition copied by different scribes.`,
    );
  }
  if (strongScribal >= 1 && strongFuzzy === 0) {
    recs.push(
      `${tabletId} has ${strongScribal} same-scribe candidate${strongScribal === 1 ? "" : "s"} but no strong fuzzy parallels — likely the same scribe working on a different composition.`,
    );
  }
  if (veryStrongFuzzy >= 1 && strongScribal >= 1) {
    recs.push(
      `${tabletId} has ${veryStrongFuzzy} very-strong fuzzy parallel${veryStrongFuzzy === 1 ? "" : "s"} (J≥0.50) AND ${strongScribal} same-scribe candidate${strongScribal === 1 ? "" : "s"} — high-confidence sibling manuscript(s) by the same scribe; consider physical-join check.`,
    );
  }
  if (strongThematic >= 1 && strongFuzzy === 0 && strongScribal === 0) {
    recs.push(
      `${tabletId} has ${strongThematic} thematic neighbor${strongThematic === 1 ? "" : "s"} (cos≥0.60) but no lexical/scribal matches — paraphrase, bilingual variant, or alt-spelling candidate; lexical signal is independently weak.`,
    );
  }

  // Cross-axis confluence
  if (multi.length === 0) {
    recs.push(
      `No tablet appears on more than one axis — neighbors are axis-specific. Confidence in any individual relative is moderate; cross-axis confluence would raise it.`,
    );
  } else {
    const top = multi[0];
    if (top) {
      const axesStr = top.axes.join(" + ");
      recs.push(
        `Top cross-axis hit: ${top.tablet_id} surfaces on ${top.axis_count} axes (${axesStr}) — high-confidence relative; inspect via compare_tablet_pair for verdict classification.`,
      );
    }
    if (multi.length >= 3) {
      recs.push(
        `${multi.length} tablets appear on ≥2 axes — ${tabletId} sits in a dense neighborhood; consider reconstruct_cluster to surface the full manuscript-witness cluster.`,
      );
    }
  }

  // Isolation diagnostics
  if (fuzzy.length === 0 && thematic.length === 0 && scribal.length === 0 && join.length === 0) {
    recs.push(
      `${tabletId} is isolated on all four axes — possible bi-orphan; cross-check with describe_anomaly + find_anomalous_tablets.`,
    );
  }
  if (anomalyFlag) {
    recs.push(
      `${tabletId} is flagged in the v0.16 anomaly index — describe_anomaly will explain which anomaly-class(es) apply (bi-orphan / lex-singleton / them-orphan / genre-misfit / period-misfit).`,
    );
  }

  if (recs.length === 0) {
    recs.push(
      `${tabletId} has ${fuzzy.length} fuzzy / ${thematic.length} thematic / ${scribal.length} scribal hits at the configured thresholds. No pattern triggered a specific recommendation; thresholds may need lowering, or the tablet sits in a sparse region.`,
    );
  }
  return recs;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findTabletNeighborhood(opts: TabletNeighborhoodOptions): TabletNeighborhoodResult {
  const tabletId = opts.tabletId.trim();
  const topK = Math.max(1, Math.min(MAX_TOP_K, opts.topKPerAxis ?? DEFAULT_TOP_K));
  const minFuzzy = opts.minFuzzyJaccard ?? DEFAULT_MIN_FUZZY;
  const minThematic = opts.minThematicCosine ?? DEFAULT_MIN_THEMATIC;
  const minScribal = opts.minScribalCosine ?? DEFAULT_MIN_SCRIBAL;
  const warnings: string[] = [];

  // ─── Per-axis discovery ────────────────────────────────────────────────
  const fuzzy = runFuzzyAxis(tabletId, topK, minFuzzy, warnings);
  const thematic = runThematicAxis(tabletId, topK, minThematic, warnings);
  const scribal = runScribalAxis(tabletId, topK, minScribal, warnings);
  const join = runJoinAxis(tabletId, topK, warnings);

  // ─── Tablet metadata (from anomaly index) ──────────────────────────────
  const desc = describeAnomaly(tabletId);
  const anomalyFlag =
    desc.flags.is_bi_orphan ||
    desc.flags.is_lex_singleton ||
    desc.flags.is_them_orphan ||
    desc.flags.is_genre_misfit ||
    desc.flags.is_period_misfit;

  const signCount = getTabletSignCount(tabletId);
  for (const w of desc.warnings) warnings.push(`anomaly: ${w}`);

  // ─── Cross-axis aggregation ────────────────────────────────────────────
  const crossAxis = summarizeCrossAxis(fuzzy, thematic, scribal, join);

  // ─── Recommendations ───────────────────────────────────────────────────
  const recommendations = buildRecommendations(
    tabletId,
    fuzzy,
    thematic,
    scribal,
    join,
    crossAxis.multi_axis_hits,
    anomalyFlag,
  );

  return {
    query: {
      tablet_id: tabletId,
      top_k_per_axis: topK,
      min_fuzzy_jaccard: minFuzzy,
      min_thematic_cosine: minThematic,
      min_scribal_cosine: minScribal,
    },
    tablet: {
      tablet_id: tabletId,
      sign_count: signCount,
      in_lex_graph: desc.exists_in_lex_graph,
      in_them_index: desc.exists_in_them_index,
      anomaly_flag: anomalyFlag,
    },
    axes: {
      fuzzy_parallels: fuzzy,
      thematic_neighbors: thematic,
      scribal_candidates: scribal,
      join_candidates: join,
    },
    cross_axis_summary: crossAxis,
    recommendations,
    warnings,
  };
}

// ─── NOTES ─────────────────────────────────────────────────────────────────
// 1. Join-candidates axis is intentionally a no-op in v0.18.12. The
//    `find_join_candidates` tool in index.ts is tightly coupled to:
//      - async loadCorpus() from cache.js (JSONL-on-disk),
//      - async fetchEnrichment() (eBL HTTP),
//      - eBL museum-number normalization that diverges from the anomaly-
//        index id space used by the other three axes.
//    Wrapping it inline would make this tool async, network-bound, and
//    surface a cache-missing failure mode that no other axis has. The
//    same pragmatic skip was made for compare_tablet_pair (v0.18.8). A
//    follow-up could expose a synchronous `findJoinCandidatesForTablet`
//    that operates on the already-loaded corpus; until then, callers
//    that need join-axis evidence should invoke `find_join_candidates`
//    separately and merge with this tool's cross_axis_summary by hand.
// 2. The scribal axis uses signature_cosine ≥ minScribalCosine as the
//    public-facing threshold (matching compare_tablet_pair's verdict
//    classifier). findSameScribeCandidates' native param is min_jaccard,
//    so we query permissively then post-filter on cosine.
