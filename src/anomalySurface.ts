// v0.16.0 — Anomaly Surface (bi-orphan detector + cluster-misfit + describe).
//
// Joins the corpus-viz lexical-graph (17,486 components) with the v0.15
// thematic-embedding index (28,665 tablets × top-30 cosine neighbors)
// + tabletMetadata + corpus-exclusions. Built offline by
// scripts/build-anomaly-index.mjs; runtime just loads + filters.
//
// Discovery thesis: ~88% of tablets are lexical singletons; ~475 are
// thematic orphans; the intersection — **bi-orphans** — are 167 tablets
// that lack neighbors in BOTH the trigram AND embedding spaces. After
// filtering to sign_count ≥ 100, ~42 candidates remain. These are the
// highest-priority manually-inspectable discoveries — candidates for
// unknown compositions, miscatalogued fragments, or rare witnesses.
//
// Pure stdlib — no new dependencies.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const INDEX_FILE = "anomaly-index.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type AnomalyType =
  | "bi_orphan"
  | "lexical_singleton"
  | "thematic_orphan"
  | "cluster_genre_misfit"
  | "cluster_period_misfit"
  | "low_lexical_high_thematic"
  | "low_thematic_high_lexical";

export type AnomalyRecord = {
  tablet_id: string;
  anomaly_type: AnomalyType;
  scores: {
    lex_count: number | null;
    lex_max_jaccard: number | null;
    them_count: number | null;
    them_max_cos: number | null;
    cluster_size?: number;
    cluster_genre_consistency?: number;
    cluster_period_consistency?: number;
  };
  metadata: {
    period?: string;
    genre?: string;
    city?: string;
    designation?: string;
    sign_count: number;
  };
  interpretation: string;
  follow_up: string;
  ebl_url: string;
};

export type FindAnomalousResult = {
  query: {
    anomaly_type: AnomalyType;
    min_sign_count: number;
    period_filter?: string;
    genre_filter?: string;
    max_results: number;
  };
  anomaly_count: number;
  anomalies: AnomalyRecord[];
  index_stats: SurfaceStats;
  warnings: string[];
};

export type DescribeAnomalyResult = {
  tablet_id: string;
  exists_in_lex_graph: boolean;
  exists_in_them_index: boolean;
  metadata: {
    period?: string;
    genre?: string;
    city?: string;
    designation?: string;
    sign_count: number;
  };
  lexical: {
    neighbor_count: number | null;
    max_jaccard: number | null;
    component_id: number | null;
    component_size: number | null;
    component_dominant_genre?: string;
    component_dominant_genre_share?: number;
    component_dominant_period?: string;
    component_dominant_period_share?: number;
  };
  thematic: {
    neighbor_count: number | null;
    max_cosine: number | null;
  };
  flags: {
    is_bi_orphan: boolean;
    is_lex_singleton: boolean;
    is_them_orphan: boolean;
    is_genre_misfit: boolean;
    is_period_misfit: boolean;
  };
  reasons: string[];
  follow_up: string[];
  ebl_url: string;
  warnings: string[];
};

export type SurfaceStats = {
  loaded: boolean;
  load_error: string | null;
  generated_at: string | null;
  totals: {
    tablets: number;
    in_lex_graph: number;
    in_them_index: number;
    in_both: number;
    lex_singletons: number;
    them_orphans: number;
    bi_orphans: number;
  };
  bi_orphans_by_length: Record<string, [number, number]>;
};

// ─── Index types ───────────────────────────────────────────────────────────

type TabletRecord = {
  id: string;
  lex_count: number | null;
  lex_max_jaccard: number | null;
  component_id: number | null;
  them_count: number | null;
  them_max_cos: number | null;
  them_total: number | null;
  sign_count: number;
  period: string | null;
  genre: string | null;
  city: string | null;
  designation: string | null;
  in_lex_graph: boolean;
  in_them_index: boolean;
};

type ComponentRecord = {
  size: number;
  dominant_genre?: string;
  dominant_genre_share?: number;
  dominant_period?: string;
  dominant_period_share?: number;
};

type AnomalyIndex = {
  _meta: {
    version: string;
    generated_at: string;
    totals: SurfaceStats["totals"];
    length_buckets: Record<string, [number, number]>;
  };
  tablets: TabletRecord[];
  components: Record<string, ComponentRecord>;
  byId: Map<string, TabletRecord>;
};

let CACHED: AnomalyIndex | null = null;
let LOAD_ATTEMPTED = false;
let LOAD_ERROR: string | null = null;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function loadIndex(): AnomalyIndex | null {
  if (CACHED) return CACHED;
  if (LOAD_ATTEMPTED) return null;
  LOAD_ATTEMPTED = true;

  const path = join(cacheDir(), INDEX_FILE);
  if (!existsSync(path)) {
    LOAD_ERROR = `${path} not found — run \`node scripts/build-anomaly-index.mjs\``;
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as {
      _meta: AnomalyIndex["_meta"] & { totals: SurfaceStats["totals"]; length_buckets: Record<string, [number, number]> };
      tablets: TabletRecord[];
      components: Record<string, ComponentRecord>;
    };
    const byId = new Map<string, TabletRecord>();
    for (const t of raw.tablets) byId.set(t.id, t);
    CACHED = {
      _meta: raw._meta,
      tablets: raw.tablets,
      components: raw.components,
      byId,
    };
    return CACHED;
  } catch (e) {
    LOAD_ERROR = e instanceof Error ? e.message : String(e);
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function eblUrl(id: string): string {
  // eBL museum-number URLs use the format /fragmentarium/<id> with the
  // unnormalized prefix.number.suffix display string.
  return `https://www.ebl.lmu.de/fragmentarium/${encodeURIComponent(id)}`;
}

function componentInfo(idx: AnomalyIndex, compId: number | null) {
  if (compId == null) return null;
  return idx.components[String(compId)] ?? null;
}

function isGenreMisfit(idx: AnomalyIndex, t: TabletRecord): boolean {
  if (!t.genre || t.component_id == null) return false;
  const c = componentInfo(idx, t.component_id);
  if (!c || c.size < 3 || !c.dominant_genre || (c.dominant_genre_share ?? 0) < 0.6) return false;
  return c.dominant_genre !== t.genre;
}

function isPeriodMisfit(idx: AnomalyIndex, t: TabletRecord): boolean {
  if (!t.period || t.component_id == null) return false;
  const c = componentInfo(idx, t.component_id);
  if (!c || c.size < 3 || !c.dominant_period || (c.dominant_period_share ?? 0) < 0.6) return false;
  return c.dominant_period !== t.period;
}

function interpretFor(t: TabletRecord, type: AnomalyType, c: ComponentRecord | null): string {
  switch (type) {
    case "bi_orphan":
      return `[my synthesis] Isolated in both lexical (trigram-Jaccard) and thematic (embedding-cosine) neighbor graphs. ${t.sign_count} sign tokens. Candidate for: (a) unknown composition, (b) miscatalogued fragment, (c) rare witness of a poorly-attested text.`;
    case "lexical_singleton":
      return `[my synthesis] No trigram-similar neighbors above min-jaccard=0.30. ${t.them_count ?? 0} thematic neighbors above cos=0.5 — possibly paraphrase or different-vocabulary parallels.`;
    case "thematic_orphan":
      return `[my synthesis] No embedding-similar neighbors above cos=0.6 (max cos: ${t.them_max_cos?.toFixed(3) ?? "—"}). Distinct distributional profile. ${t.lex_count ?? 0} lexical neighbors above min-jaccard=0.30.`;
    case "cluster_genre_misfit":
      return `[my synthesis] Tablet metadata genre is "${t.genre}" but its lexical-cluster (component ${t.component_id}, size ${c?.size}) is dominated by "${c?.dominant_genre}" at ${((c?.dominant_genre_share ?? 0) * 100).toFixed(0)}% share. Possibly miscatalogued or a genre-bridging tablet.`;
    case "cluster_period_misfit":
      return `[my synthesis] Tablet metadata period is "${t.period}" but its lexical-cluster (component ${t.component_id}, size ${c?.size}) is dominated by "${c?.dominant_period}" at ${((c?.dominant_period_share ?? 0) * 100).toFixed(0)}% share. Possibly misdated.`;
    case "low_lexical_high_thematic":
      return `[my synthesis] Few trigram neighbors (${t.lex_count}) but many thematic neighbors (${t.them_count}). "Different vocabulary, same topic" — candidate for paraphrase, alternate-spelling witness, or cross-language parallel (Sumerian/Akkadian bilingual?).`;
    case "low_thematic_high_lexical":
      return `[my synthesis] Many trigram neighbors (${t.lex_count}) but few thematic neighbors (${t.them_count}). "Same vocabulary, different topic" — candidate for formulaic-text outlier or under-handled colophon-template artifact.`;
  }
}

function followUpFor(t: TabletRecord, type: AnomalyType): string {
  const ebl = `Check ${eblUrl(t.id)} for catalog notes`;
  switch (type) {
    case "bi_orphan":
      return `${ebl}; search JNES + JCS + OrAnt for partial editions; check whether the tablet is a uniquely-witnessed composition or short fragment.`;
    case "lexical_singleton":
      return `${ebl}; inspect the top thematic neighbors to see what genre/topic they cluster around; consider whether the tablet's vocabulary is genuinely idiosyncratic.`;
    case "thematic_orphan":
      return `${ebl}; review the tablet's signs against the dominant signs of its lexical component to see what distributional pattern makes it diverge.`;
    case "cluster_genre_misfit":
      return `${ebl}; review the genre attribution against the dominant genre of the lexical cluster; recheck metadata source.`;
    case "cluster_period_misfit":
      return `${ebl}; cross-check the assigned period against the cluster's dominant period; this is the easiest type to validate/refute via paleography.`;
    case "low_lexical_high_thematic":
      return `${ebl}; pull the top thematic neighbors via find_thematic_parallel and compare vocabulary; check whether the tablet is in a different language register.`;
    case "low_thematic_high_lexical":
      return `${ebl}; inspect whether the high lexical-overlap is content-bearing or formulaic (colophons, ration lists, etc.).`;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findAnomalousTablets(opts: {
  anomalyType: AnomalyType;
  minSignCount?: number;
  periodFilter?: string;
  genreFilter?: string;
  maxResults?: number;
}): FindAnomalousResult {
  const minSign = opts.minSignCount ?? 100;
  const maxResults = Math.max(1, Math.min(100, opts.maxResults ?? 20));
  const warnings: string[] = [];

  const idx = loadIndex();
  if (!idx) {
    return {
      query: {
        anomaly_type: opts.anomalyType,
        min_sign_count: minSign,
        period_filter: opts.periodFilter,
        genre_filter: opts.genreFilter,
        max_results: maxResults,
      },
      anomaly_count: 0,
      anomalies: [],
      index_stats: surfaceStats(),
      warnings: [LOAD_ERROR ?? "anomaly index unavailable"],
    };
  }

  const matches: { t: TabletRecord; score: number }[] = [];
  for (const t of idx.tablets) {
    if (t.sign_count < minSign) continue;
    if (opts.periodFilter && t.period !== opts.periodFilter) continue;
    if (opts.genreFilter && t.genre !== opts.genreFilter) continue;

    let included = false;
    let score = 0; // higher = better candidate

    switch (opts.anomalyType) {
      case "bi_orphan":
        if (t.in_lex_graph && t.in_them_index && t.lex_count === 0 && (t.them_max_cos ?? 1) < 0.6) {
          included = true;
          score = t.sign_count - (t.them_max_cos ?? 0) * 100; // prefer longer + lower max_cos
        }
        break;
      case "lexical_singleton":
        if (t.in_lex_graph && t.lex_count === 0) {
          included = true;
          score = t.sign_count;
        }
        break;
      case "thematic_orphan":
        if (t.in_them_index && (t.them_max_cos ?? 1) < 0.6) {
          included = true;
          score = -(t.them_max_cos ?? 0); // lower max_cos = stronger orphan
        }
        break;
      case "cluster_genre_misfit":
        if (isGenreMisfit(idx, t)) {
          included = true;
          const c = componentInfo(idx, t.component_id)!;
          score = (c.dominant_genre_share ?? 0) * (c.size ?? 1);
        }
        break;
      case "cluster_period_misfit":
        if (isPeriodMisfit(idx, t)) {
          included = true;
          const c = componentInfo(idx, t.component_id)!;
          score = (c.dominant_period_share ?? 0) * (c.size ?? 1);
        }
        break;
      case "low_lexical_high_thematic":
        if ((t.lex_count ?? 99) <= 1 && (t.them_count ?? 0) >= 10) {
          included = true;
          score = (t.them_count ?? 0) - (t.lex_count ?? 0);
        }
        break;
      case "low_thematic_high_lexical":
        if ((t.lex_count ?? 0) >= 5 && (t.them_count ?? 99) <= 2) {
          included = true;
          score = (t.lex_count ?? 0) - (t.them_count ?? 0);
        }
        break;
    }

    if (included) matches.push({ t, score });
  }

  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, maxResults);

  const anomalies: AnomalyRecord[] = top.map(({ t }) => {
    const c = componentInfo(idx, t.component_id);
    return {
      tablet_id: t.id,
      anomaly_type: opts.anomalyType,
      scores: {
        lex_count: t.lex_count,
        lex_max_jaccard: t.lex_max_jaccard,
        them_count: t.them_count,
        them_max_cos: t.them_max_cos,
        ...(c?.size != null ? { cluster_size: c.size } : {}),
        ...(c?.dominant_genre_share != null ? { cluster_genre_consistency: c.dominant_genre_share } : {}),
        ...(c?.dominant_period_share != null ? { cluster_period_consistency: c.dominant_period_share } : {}),
      },
      metadata: {
        ...(t.period ? { period: t.period } : {}),
        ...(t.genre ? { genre: t.genre } : {}),
        ...(t.city ? { city: t.city } : {}),
        ...(t.designation ? { designation: t.designation } : {}),
        sign_count: t.sign_count,
      },
      interpretation: interpretFor(t, opts.anomalyType, c),
      follow_up: followUpFor(t, opts.anomalyType),
      ebl_url: eblUrl(t.id),
    };
  });

  return {
    query: {
      anomaly_type: opts.anomalyType,
      min_sign_count: minSign,
      period_filter: opts.periodFilter,
      genre_filter: opts.genreFilter,
      max_results: maxResults,
    },
    anomaly_count: matches.length,
    anomalies,
    index_stats: surfaceStats(),
    warnings,
  };
}

export function describeAnomaly(tabletId: string): DescribeAnomalyResult {
  const idx = loadIndex();
  if (!idx) {
    return emptyDescribe(tabletId, [LOAD_ERROR ?? "anomaly index unavailable"]);
  }

  const t = idx.byId.get(tabletId);
  if (!t) {
    return emptyDescribe(tabletId, [
      `tablet '${tabletId}' not in anomaly index`,
      `(index contains ${idx.tablets.length} tablets after v0.14.4 exclusions)`,
    ]);
  }

  const c = componentInfo(idx, t.component_id);
  const flags = {
    is_bi_orphan: t.in_lex_graph && t.in_them_index && t.lex_count === 0 && (t.them_max_cos ?? 1) < 0.6,
    is_lex_singleton: t.in_lex_graph && t.lex_count === 0,
    is_them_orphan: t.in_them_index && (t.them_max_cos ?? 1) < 0.6,
    is_genre_misfit: isGenreMisfit(idx, t),
    is_period_misfit: isPeriodMisfit(idx, t),
  };

  const reasons: string[] = [];
  if (flags.is_bi_orphan) reasons.push(`bi_orphan: no neighbors above min thresholds in EITHER lexical (jaccard≥0.30) OR thematic (cos≥0.6) graph`);
  else {
    if (flags.is_lex_singleton) reasons.push(`lex_singleton: zero trigram neighbors above min-jaccard=0.30`);
    if (flags.is_them_orphan) reasons.push(`thematic_orphan: max embedding cosine ${t.them_max_cos?.toFixed(3)} < 0.6`);
  }
  if (flags.is_genre_misfit) reasons.push(`genre_misfit: tablet genre "${t.genre}" ≠ cluster dominant "${c?.dominant_genre}" (${((c?.dominant_genre_share ?? 0) * 100).toFixed(0)}%)`);
  if (flags.is_period_misfit) reasons.push(`period_misfit: tablet period "${t.period}" ≠ cluster dominant "${c?.dominant_period}" (${((c?.dominant_period_share ?? 0) * 100).toFixed(0)}%)`);
  if (reasons.length === 0) reasons.push("not anomalous on any of the v0.16 criteria");

  const followUp: string[] = [];
  if (flags.is_bi_orphan) followUp.push(`Check ${eblUrl(t.id)} for catalog notes + partial publication history`);
  if (flags.is_genre_misfit || flags.is_period_misfit) followUp.push(`Cross-check metadata source vs. tabletMetadata.json v0.13.1`);
  if (t.sign_count < 50) followUp.push(`Tablet is short (${t.sign_count} signs) — may be below the threshold for reliable methods`);
  if (followUp.length === 0) followUp.push(`Tablet is well-connected — no anomaly-driven follow-up indicated`);

  return {
    tablet_id: tabletId,
    exists_in_lex_graph: t.in_lex_graph,
    exists_in_them_index: t.in_them_index,
    metadata: {
      ...(t.period ? { period: t.period } : {}),
      ...(t.genre ? { genre: t.genre } : {}),
      ...(t.city ? { city: t.city } : {}),
      ...(t.designation ? { designation: t.designation } : {}),
      sign_count: t.sign_count,
    },
    lexical: {
      neighbor_count: t.lex_count,
      max_jaccard: t.lex_max_jaccard,
      component_id: t.component_id,
      component_size: c?.size ?? null,
      ...(c?.dominant_genre ? { component_dominant_genre: c.dominant_genre } : {}),
      ...(c?.dominant_genre_share != null ? { component_dominant_genre_share: c.dominant_genre_share } : {}),
      ...(c?.dominant_period ? { component_dominant_period: c.dominant_period } : {}),
      ...(c?.dominant_period_share != null ? { component_dominant_period_share: c.dominant_period_share } : {}),
    },
    thematic: {
      neighbor_count: t.them_count,
      max_cosine: t.them_max_cos,
    },
    flags,
    reasons,
    follow_up: followUp,
    ebl_url: eblUrl(t.id),
    warnings: [],
  };
}

function emptyDescribe(tabletId: string, warnings: string[]): DescribeAnomalyResult {
  return {
    tablet_id: tabletId,
    exists_in_lex_graph: false,
    exists_in_them_index: false,
    metadata: { sign_count: 0 },
    lexical: { neighbor_count: null, max_jaccard: null, component_id: null, component_size: null },
    thematic: { neighbor_count: null, max_cosine: null },
    flags: {
      is_bi_orphan: false,
      is_lex_singleton: false,
      is_them_orphan: false,
      is_genre_misfit: false,
      is_period_misfit: false,
    },
    reasons: [],
    follow_up: [],
    ebl_url: eblUrl(tabletId),
    warnings,
  };
}

export function surfaceStats(): SurfaceStats {
  const idx = loadIndex();
  if (!idx) {
    return {
      loaded: false,
      load_error: LOAD_ERROR,
      generated_at: null,
      totals: {
        tablets: 0,
        in_lex_graph: 0,
        in_them_index: 0,
        in_both: 0,
        lex_singletons: 0,
        them_orphans: 0,
        bi_orphans: 0,
      },
      bi_orphans_by_length: {},
    };
  }
  return {
    loaded: true,
    load_error: null,
    generated_at: idx._meta.generated_at,
    totals: idx._meta.totals,
    bi_orphans_by_length: idx._meta.length_buckets,
  };
}
