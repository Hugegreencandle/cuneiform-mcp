// v0.18.16 — Motif-dataset builder: generalize per-tablet motif discovery.
//
// Generalizes the static apkallu_attestations approach to ARBITRARY caller-
// specified motifs. Given a motif name + seed-tablet IDs, expand the seed
// set transitively via two discovery axes:
//   - Fuzzy trigram-Jaccard (lexical / paraphrase signal)
//   - Random-Indexing thematic cosine (semantic-cluster signal)
//
// Candidates surfaced by BOTH axes get source="cross_axis" (higher
// confidence); single-axis hits at threshold are included as
// "fuzzy_parallel" or "thematic_neighbor". Strong-lexical-alone
// (fuzzy_J ≥ 0.4) also passes the inclusion gate unless caller asks
// for `require_cross_axis`.
//
// Result is persisted to data/motif-datasets/{slug}.json so the caller
// can re-query later (or rebuild deterministically by re-running the
// tool with the same seeds + parameters).
//
// Critical caveat: the persisted file is a STATIC snapshot — subsequent
// corpus updates won't auto-refresh it. Re-run the tool to regenerate.
//
// Pure stdlib + reuse of findFuzzyParallels, findThematicParallel,
// getAllTabletRecords, getTabletSignCount.

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findFuzzyParallels } from "./fuzzyParallels.js";
import { findThematicParallel } from "./semanticEmbeddings.js";
import { getAllTabletRecords, getTabletSignCount } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type MotifMemberSource =
  | "seed"
  | "fuzzy_parallel"
  | "thematic_neighbor"
  | "cross_axis";

export type MotifMember = {
  tablet_id: string;
  source: MotifMemberSource;
  source_seed: string | null; // which seed brought this member in (null for seeds themselves)
  confidence_score: number; // max(fuzzy_J, thematic_cos) at admission time
  depth: number; // BFS hop from a seed (0 = seed)
  fuzzy_j?: number;
  thematic_cos?: number;
};

export type MotifDatasetSummary = {
  motif_name: string;
  slug: string;
  total_members: number;
  members_via_seed: number;
  members_via_fuzzy_only: number;
  members_via_thematic_only: number;
  members_via_both: number;
  prefix_distribution: Record<string, number>;
  mean_sign_count: number;
  depth_distribution: Record<string, number>;
};

export type MotifDatasetResult = {
  query: {
    motif_name: string;
    seed_tablet_ids: string[];
    max_dataset_size: number;
    expand_depth: number;
    min_fuzzy_jaccard: number;
    min_thematic_cosine: number;
    require_cross_axis: boolean;
    persist: boolean;
  };
  dataset_summary: MotifDatasetSummary;
  members: MotifMember[]; // sample — first 20 sorted by confidence desc
  all_member_ids: string[]; // full list — useful for downstream tooling
  file_path: string | null;
  termination_reason:
    | "frontier_exhausted"
    | "max_dataset_size_reached"
    | "max_depth_reached";
  index_stats: {
    total_fuzzy_calls: number;
    total_thematic_calls: number;
    expanded_tablets: number;
    candidates_rejected_below_threshold: number;
  };
  warnings: string[];
};

// ─── Public API ────────────────────────────────────────────────────────────

export type ExtendDatasetToMotifOptions = {
  motifName: string;
  seedTabletIds: string[];
  maxDatasetSize?: number; // default 100, max 500
  expandDepth?: number; // default 1; 0|1|2 (clamped)
  minFuzzyJaccard?: number; // default 0.30
  minThematicCosine?: number; // default 0.65
  requireCrossAxis?: boolean; // default false
  persist?: boolean; // default true
};

const STRONG_LEXICAL_FLOOR = 0.4; // fuzzy_J ≥ this counts as strong-lexical-alone

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

// Slugify rule: ASCII-fold (NFKD strip combining marks), lowercase, replace
// runs of non-[a-z0-9] with "_", strip leading/trailing underscores.
// Empty result falls back to "motif".
export function slugifyMotifName(name: string): string {
  const folded = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const slug = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : "motif";
}

function persistDir(): string {
  const base =
    process.env.CUNEIFORM_MCP_DATA_DIR ||
    join(homedir(), "Desktop", "cuneiform-mcp", "data");
  return join(base, "motif-datasets");
}

// Per-candidate accumulator. We collect axis hits as the BFS walks the
// graph; admission to the dataset is decided AFTER all axes for a parent
// have been queried so cross-axis confirmation works correctly.
type CandidateAccumulator = {
  fuzzy_j: number; // best fuzzy_j observed across any parent
  thematic_cos: number; // best thematic_cos observed across any parent
  via_fuzzy: boolean;
  via_thematic: boolean;
  source_seed: string; // first seed-root that surfaced this candidate
  parent: string; // first parent that surfaced this candidate
  depth: number;
};

export function extendDatasetToMotif(
  opts: ExtendDatasetToMotifOptions,
): MotifDatasetResult {
  const motifName = opts.motifName.trim();
  const seeds = opts.seedTabletIds.map((s) => s.trim()).filter((s) => s.length > 0);
  const maxSize = Math.max(1, Math.min(500, opts.maxDatasetSize ?? 100));
  const depthCap = Math.max(0, Math.min(2, opts.expandDepth ?? 1));
  const minFuzzy = Math.max(0, Math.min(1, opts.minFuzzyJaccard ?? 0.3));
  const minThem = Math.max(0, Math.min(1, opts.minThematicCosine ?? 0.65));
  const requireCross = opts.requireCrossAxis ?? false;
  const persist = opts.persist ?? true;
  const slug = slugifyMotifName(motifName);
  const warnings: string[] = [];

  if (seeds.length === 0) {
    warnings.push("No seed_tablet_ids provided after trim — dataset is empty.");
  }
  if (seeds.length > 20) {
    warnings.push(`Received ${seeds.length} seeds; only the first 20 are used.`);
  }
  const seedSet = seeds.slice(0, 20);

  // Per-tablet record: who's in the dataset and how they got in.
  const members = new Map<string, MotifMember>();
  // Track the source seed each tablet maps to (for traceability).
  const seedRootOf = new Map<string, string>();

  // Initialize seeds
  for (const sid of seedSet) {
    if (members.has(sid)) continue;
    members.set(sid, {
      tablet_id: sid,
      source: "seed",
      source_seed: null,
      confidence_score: 1.0,
      depth: 0,
    });
    seedRootOf.set(sid, sid);
  }

  let fuzzyCalls = 0;
  let thematicCalls = 0;
  let expanded = 0;
  let rejected = 0;
  let termination: MotifDatasetResult["termination_reason"] = "frontier_exhausted";

  // BFS frontier — seeds at depth 0; if depthCap === 0 we still expand the
  // seeds' direct parallels once (depth-1 admissions), but we don't expand
  // depth-1 members further. depthCap === 1 means we expand depth-1 members
  // too (yielding depth-2 admissions). depthCap === 2 → one more layer.
  let frontier: string[] = [...seedSet];
  // Effective expansion layers: depthCap + 1 (seeds always get expanded once).
  const expansionLayers = depthCap + 1;

  for (let layer = 0; layer < expansionLayers; layer++) {
    if (members.size >= maxSize) {
      termination = "max_dataset_size_reached";
      break;
    }
    if (frontier.length === 0) {
      termination = "frontier_exhausted";
      break;
    }
    const admissions = new Map<string, CandidateAccumulator>();

    for (const parentId of frontier) {
      if (members.size >= maxSize) break;
      const parentSeedRoot = seedRootOf.get(parentId) ?? parentId;

      // Probe fuzzy axis
      const fz = findFuzzyParallels({
        tabletId: parentId,
        topK: 15,
        minFuzzyJaccard: minFuzzy,
        minFuzzyIntersect: 1,
      });
      fuzzyCalls++;
      for (const p of fz.parallels) {
        if (members.has(p.tablet_id)) continue;
        const acc = admissions.get(p.tablet_id) ?? {
          fuzzy_j: 0,
          thematic_cos: 0,
          via_fuzzy: false,
          via_thematic: false,
          source_seed: parentSeedRoot,
          parent: parentId,
          depth: layer + 1,
        };
        if (p.fuzzy_jaccard > acc.fuzzy_j) {
          acc.fuzzy_j = p.fuzzy_jaccard;
        }
        acc.via_fuzzy = true;
        admissions.set(p.tablet_id, acc);
      }

      // Probe thematic axis
      const th = findThematicParallel(parentId, {
        topK: 15,
        minCosine: minThem,
      });
      thematicCalls++;
      for (const n of th.neighbors) {
        if (members.has(n.id)) continue;
        const acc = admissions.get(n.id) ?? {
          fuzzy_j: 0,
          thematic_cos: 0,
          via_fuzzy: false,
          via_thematic: false,
          source_seed: parentSeedRoot,
          parent: parentId,
          depth: layer + 1,
        };
        if (n.score > acc.thematic_cos) {
          acc.thematic_cos = n.score;
        }
        acc.via_thematic = true;
        admissions.set(n.id, acc);
      }

      expanded++;
    }

    // Admission filter: cross-axis confirmation OR strong-lexical-alone
    // (fuzzy_J ≥ STRONG_LEXICAL_FLOOR) OR (when require_cross_axis=false)
    // any single-axis hit at threshold.
    const nextFrontier: string[] = [];
    // Sort admissions by confidence desc so the strongest candidates win
    // when we're near the size cap.
    const sortedAdmissions = [...admissions.entries()].sort((a, b) => {
      const ca = Math.max(a[1].fuzzy_j, a[1].thematic_cos);
      const cb = Math.max(b[1].fuzzy_j, b[1].thematic_cos);
      return cb - ca;
    });
    for (const [tabletId, acc] of sortedAdmissions) {
      if (members.size >= maxSize) {
        termination = "max_dataset_size_reached";
        break;
      }
      const bothAxes = acc.via_fuzzy && acc.via_thematic;
      const strongLexical = acc.fuzzy_j >= STRONG_LEXICAL_FLOOR;
      let admit: boolean;
      if (requireCross) {
        admit = bothAxes;
      } else {
        admit = bothAxes || strongLexical || acc.via_fuzzy || acc.via_thematic;
      }
      if (!admit) {
        rejected++;
        continue;
      }
      let source: MotifMemberSource;
      if (bothAxes) source = "cross_axis";
      else if (acc.via_fuzzy) source = "fuzzy_parallel";
      else source = "thematic_neighbor";
      const confidence = Math.max(acc.fuzzy_j, acc.thematic_cos);
      members.set(tabletId, {
        tablet_id: tabletId,
        source,
        source_seed: acc.source_seed,
        confidence_score: confidence,
        depth: acc.depth,
        ...(acc.fuzzy_j > 0 ? { fuzzy_j: acc.fuzzy_j } : {}),
        ...(acc.thematic_cos > 0 ? { thematic_cos: acc.thematic_cos } : {}),
      });
      seedRootOf.set(tabletId, acc.source_seed);
      nextFrontier.push(tabletId);
    }

    // If we ran out of dataset budget mid-layer, bail out.
    if (members.size >= maxSize) {
      termination = "max_dataset_size_reached";
      break;
    }

    // Prepare next layer. If this was the final allowed expansion layer
    // and there are still candidates in nextFrontier, mark max_depth.
    if (layer === expansionLayers - 1) {
      if (nextFrontier.length > 0) {
        termination = "max_depth_reached";
      }
      break;
    }
    frontier = nextFrontier;
  }

  // Bail-warning if no expansion happened despite seeds being present.
  if (seedSet.length > 0 && fuzzyCalls === 0 && thematicCalls === 0) {
    warnings.push("No axis probes ran — check that seeds exist in fuzzy + thematic indexes.");
  }

  // ─── Aggregate stats ──────────────────────────────────────────────────
  const allMembers = [...members.values()];
  let viaSeed = 0;
  let viaFuzzyOnly = 0;
  let viaThemOnly = 0;
  let viaBoth = 0;
  const prefixDist: Record<string, number> = {};
  const depthDist: Record<string, number> = {};
  let signCountSum = 0;
  let signCountN = 0;
  for (const m of allMembers) {
    if (m.source === "seed") viaSeed++;
    else if (m.source === "cross_axis") viaBoth++;
    else if (m.source === "fuzzy_parallel") viaFuzzyOnly++;
    else viaThemOnly++;
    const px = prefixOf(m.tablet_id);
    prefixDist[px] = (prefixDist[px] ?? 0) + 1;
    depthDist[String(m.depth)] = (depthDist[String(m.depth)] ?? 0) + 1;
    const sc = getTabletSignCount(m.tablet_id);
    if (sc !== null) {
      signCountSum += sc;
      signCountN++;
    }
  }
  const meanSignCount = signCountN > 0 ? signCountSum / signCountN : 0;

  // ─── Sample for response (sort by confidence desc, then tablet_id) ────
  const sortedAll = [...allMembers].sort((a, b) => {
    if (a.source === "seed" && b.source !== "seed") return -1;
    if (b.source === "seed" && a.source !== "seed") return 1;
    if (b.confidence_score !== a.confidence_score) {
      return b.confidence_score - a.confidence_score;
    }
    return a.tablet_id.localeCompare(b.tablet_id);
  });
  const sample = sortedAll.slice(0, 20);
  const allIds = sortedAll.map((m) => m.tablet_id);

  // ─── Cross-reference: confirm member tablets actually exist in corpus ─
  // (best-effort — anomaly index may not be loaded in test contexts)
  const recs = getAllTabletRecords();
  if (recs !== null) {
    const known = new Set(recs.map((r) => r.id));
    const unknown = allIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      warnings.push(
        `${unknown.length} member(s) not found in anomaly corpus (may be from non-indexed prefixes): ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}`,
      );
    }
  }

  const summary: MotifDatasetSummary = {
    motif_name: motifName,
    slug,
    total_members: allMembers.length,
    members_via_seed: viaSeed,
    members_via_fuzzy_only: viaFuzzyOnly,
    members_via_thematic_only: viaThemOnly,
    members_via_both: viaBoth,
    prefix_distribution: prefixDist,
    mean_sign_count: Math.round(meanSignCount * 100) / 100,
    depth_distribution: depthDist,
  };

  // ─── Persist ──────────────────────────────────────────────────────────
  let filePath: string | null = null;
  if (persist && allMembers.length > 0) {
    try {
      const dir = persistDir();
      mkdirSync(dir, { recursive: true });
      const fp = join(dir, `${slug}.json`);
      const payload = {
        motif_name: motifName,
        slug,
        generated_at: new Date().toISOString(),
        caveat:
          "Static snapshot — subsequent corpus updates will NOT auto-refresh this file. Re-run extend_dataset_to_motif to regenerate.",
        query: {
          seed_tablet_ids: seedSet,
          max_dataset_size: maxSize,
          expand_depth: depthCap,
          min_fuzzy_jaccard: minFuzzy,
          min_thematic_cosine: minThem,
          require_cross_axis: requireCross,
        },
        summary,
        members: sortedAll,
      };
      writeFileSync(fp, JSON.stringify(payload, null, 2), "utf8");
      filePath = fp;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Persist failed: ${msg}`);
    }
  }

  return {
    query: {
      motif_name: motifName,
      seed_tablet_ids: seedSet,
      max_dataset_size: maxSize,
      expand_depth: depthCap,
      min_fuzzy_jaccard: minFuzzy,
      min_thematic_cosine: minThem,
      require_cross_axis: requireCross,
      persist,
    },
    dataset_summary: summary,
    members: sample,
    all_member_ids: allIds,
    file_path: filePath,
    termination_reason: termination,
    index_stats: {
      total_fuzzy_calls: fuzzyCalls,
      total_thematic_calls: thematicCalls,
      expanded_tablets: expanded,
      candidates_rejected_below_threshold: rejected,
    },
    warnings,
  };
}
