// v0.18.16 — Multi-axis alternating lineage-chain walker.
//
// Given a seed tablet, walk an ALTERNATING multi-axis BFS chain (e.g.
// fuzzy → scribal → fuzzy → scribal → ...) up to N hops, surfacing
// transitive scholarly-lineage paths.
//
// Differs from `reconstruct_cluster` (which expands the seed's
// neighborhood via ONE axis — fuzzy trigram-Jaccard) by switching the
// expansion axis on every hop. The discovered chain therefore captures
// patterns like:
//
//   A —(fuzzy-sibling)— B —(same-scribe-as)— C —(fuzzy-sibling)— D
//
// where the same composition was copied by different scribes who also
// copied OTHER compositions. This maps the multi-relationship
// transitive ego-network of any seed across the lexical (fuzzy),
// scribal (LLR-signature cosine), and thematic (Random-Indexing
// cosine) axes simultaneously.
//
// Algorithm (BFS):
//   1. Seed at depth 0.
//   2. For each depth N (1..max_depth):
//        axis = axis_sequence[(N-1) % axis_sequence.length]
//        For each tablet at depth N-1, walk one step on that axis
//        (topK + axis-specific thresholds), promote new tablets to
//        depth N, and record the {axis, parent, score} that brought
//        each tablet in.
//   3. Dedupe: a tablet appearing at multiple depths keeps the
//      SHORTEST depth as its canonical `depth`, but records ALL
//      {axis, parent, score} arrivals in `axes_arrived_via`.
//   4. Termination: max_depth reached, max_chain_size reached, or
//      frontier exhausted.
//
// Output highlights cross_axis_members — tablets that arrived via ≥2
// distinct axes (higher-confidence chain members).
//
// Pure stdlib + reuse of fuzzyParallels.ts / scribalFingerprint.ts /
// semanticEmbeddings.ts.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { findSameScribeCandidates } from "./scribalFingerprint.js";
import { findThematicParallel } from "./semanticEmbeddings.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type LineageAxis = "fuzzy" | "scribal" | "thematic";

export type LineageArrival = {
  axis: LineageAxis;
  parent: string;
  score: number;
};

export type LineageMember = {
  tablet_id: string;
  depth: number; // shortest BFS hop from seed (0 = seed)
  axes_arrived_via: LineageArrival[];
  prefix: string;
};

export type LineageChainResult = {
  query: {
    seed_tablet_id: string;
    axis_sequence: LineageAxis[];
    max_depth: number;
    top_k_per_hop: number;
    min_fuzzy_jaccard: number;
    min_scribal_cosine: number;
    min_thematic_cosine: number;
    max_chain_size: number;
  };
  chain: LineageMember[];
  axis_path_summary: Record<LineageAxis, number>;
  prefix_distribution: Record<string, number>;
  cross_axis_members: LineageMember[];
  summary: {
    total_chain_size: number;
    axis_sequence_used: LineageAxis[];
    termination_reason: "max_depth" | "max_size" | "frontier_exhausted";
    depth_distribution: Record<string, number>;
    expansion_calls: {
      fuzzy: number;
      scribal: number;
      thematic: number;
    };
  };
  warnings: string[];
};

// ─── Options ───────────────────────────────────────────────────────────────

export type FindLineageChainOptions = {
  seedTabletId: string;
  axisSequence?: LineageAxis[]; // default ["fuzzy","scribal","fuzzy","scribal"]
  maxDepth?: number; // default 4, max 6
  topKPerHop?: number; // default 5, max 15
  minFuzzyJaccard?: number; // default 0.20
  minScribalCosine?: number; // default 0.50
  minThematicCosine?: number; // default 0.60
  maxChainSize?: number; // default 30, max 100
};

const VALID_AXES: ReadonlySet<LineageAxis> = new Set<LineageAxis>([
  "fuzzy",
  "scribal",
  "thematic",
]);

const DEFAULT_AXIS_SEQUENCE: ReadonlyArray<LineageAxis> = [
  "fuzzy",
  "scribal",
  "fuzzy",
  "scribal",
];

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

// One-step expansion: given a parent tablet + an axis, return the
// candidate {tablet_id, score} edges to consider for promotion into
// the chain at the next depth. Returns warnings the caller should
// surface to the user (e.g. index-load failures).
function expandOneStep(
  parent: string,
  axis: LineageAxis,
  topK: number,
  minFuzzyJ: number,
  minScribalCos: number,
  minThematicCos: number,
): { edges: Array<{ tablet_id: string; score: number }>; warnings: string[] } {
  if (axis === "fuzzy") {
    const r = findFuzzyParallels({
      tabletId: parent,
      topK,
      minFuzzyJaccard: minFuzzyJ,
      minFuzzyIntersect: 5,
    });
    return {
      edges: r.parallels.map((p) => ({
        tablet_id: p.tablet_id,
        score: p.fuzzy_jaccard,
      })),
      warnings: r.warnings,
    };
  }
  if (axis === "scribal") {
    const r = findSameScribeCandidates({
      tabletId: parent,
      topK,
      minJaccard: 0,
      minOverlap: 3,
    });
    const edges = r.candidates
      .filter((c) => c.signature_cosine >= minScribalCos)
      .map((c) => ({ tablet_id: c.tablet_id, score: c.signature_cosine }));
    return { edges, warnings: r.warnings };
  }
  // axis === "thematic"
  const r = findThematicParallel(parent, {
    topK,
    minCosine: minThematicCos,
  });
  return {
    edges: r.neighbors.map((n) => ({ tablet_id: n.id, score: n.score })),
    warnings: r.warnings,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findLineageChain(
  opts: FindLineageChainOptions,
): LineageChainResult {
  // ── Normalize + validate parameters ─────────────────────────────────────
  const warnings: string[] = [];

  const rawSeq = opts.axisSequence && opts.axisSequence.length > 0
    ? opts.axisSequence
    : [...DEFAULT_AXIS_SEQUENCE];
  const axisSeq: LineageAxis[] = [];
  for (const a of rawSeq) {
    if (VALID_AXES.has(a)) {
      axisSeq.push(a);
    } else {
      warnings.push(`axis '${a}' is not valid (must be fuzzy|scribal|thematic) — dropped`);
    }
  }
  if (axisSeq.length === 0) {
    axisSeq.push(...DEFAULT_AXIS_SEQUENCE);
    warnings.push("axis_sequence empty after validation — reverted to default fuzzy/scribal alternation");
  }

  const maxDepth = Math.max(1, Math.min(6, opts.maxDepth ?? 4));
  const topK = Math.max(1, Math.min(15, opts.topKPerHop ?? 5));
  const minFuzzyJ = opts.minFuzzyJaccard ?? 0.2;
  const minScribalCos = opts.minScribalCosine ?? 0.5;
  const minThematicCos = opts.minThematicCosine ?? 0.6;
  const maxChainSize = Math.max(2, Math.min(100, opts.maxChainSize ?? 30));

  // ── Initialize chain with seed ──────────────────────────────────────────
  const seedPrefix = prefixOf(opts.seedTabletId);
  const members = new Map<string, LineageMember>();
  members.set(opts.seedTabletId, {
    tablet_id: opts.seedTabletId,
    depth: 0,
    axes_arrived_via: [],
    prefix: seedPrefix,
  });

  // ── BFS expansion ───────────────────────────────────────────────────────
  let frontier: string[] = [opts.seedTabletId];
  let termination: LineageChainResult["summary"]["termination_reason"] = "frontier_exhausted";
  const expansionCalls = { fuzzy: 0, scribal: 0, thematic: 0 };
  const axisPathSummary: Record<LineageAxis, number> = {
    fuzzy: 0,
    scribal: 0,
    thematic: 0,
  };

  outer: for (let depth = 1; depth <= maxDepth; depth++) {
    if (frontier.length === 0) {
      termination = "frontier_exhausted";
      break;
    }
    const axis = axisSeq[(depth - 1) % axisSeq.length];
    const nextFrontierSet = new Set<string>();

    for (const parent of frontier) {
      if (members.size >= maxChainSize) {
        termination = "max_size";
        break outer;
      }
      const { edges, warnings: stepWarnings } = expandOneStep(
        parent,
        axis,
        topK,
        minFuzzyJ,
        minScribalCos,
        minThematicCos,
      );
      expansionCalls[axis]++;
      for (const w of stepWarnings) {
        // Tag warnings with the expansion that produced them so the
        // operator can tell index-availability problems apart.
        warnings.push(`[${axis} @ ${parent}] ${w}`);
      }

      for (const e of edges) {
        if (e.tablet_id === opts.seedTabletId) continue;
        if (e.tablet_id === parent) continue;

        const existing = members.get(e.tablet_id);
        if (existing) {
          // Already in chain — record this arrival as an additional
          // {axis, parent, score} entry. Shortest depth wins (we
          // arrived earlier on a prior hop), so don't lower depth.
          existing.axes_arrived_via.push({
            axis,
            parent,
            score: +e.score.toFixed(4),
          });
          axisPathSummary[axis]++;
          continue;
        }

        if (members.size >= maxChainSize) {
          termination = "max_size";
          break outer;
        }

        members.set(e.tablet_id, {
          tablet_id: e.tablet_id,
          depth,
          axes_arrived_via: [
            { axis, parent, score: +e.score.toFixed(4) },
          ],
          prefix: prefixOf(e.tablet_id),
        });
        axisPathSummary[axis]++;
        nextFrontierSet.add(e.tablet_id);
      }
    }

    if (nextFrontierSet.size === 0) {
      termination = "frontier_exhausted";
      break;
    }
    if (depth === maxDepth) {
      termination = "max_depth";
    }
    frontier = [...nextFrontierSet];
  }

  if (members.size >= maxChainSize) termination = "max_size";

  // ── Build sorted chain (depth asc, then best arrival-score desc) ───────
  const chain = [...members.values()].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    const aBest = a.axes_arrived_via.reduce(
      (m, x) => (x.score > m ? x.score : m),
      -Infinity,
    );
    const bBest = b.axes_arrived_via.reduce(
      (m, x) => (x.score > m ? x.score : m),
      -Infinity,
    );
    return bBest - aBest;
  });

  // ── Stats ───────────────────────────────────────────────────────────────
  const prefixDist: Record<string, number> = {};
  const depthDist: Record<string, number> = {};
  for (const m of chain) {
    prefixDist[m.prefix] = (prefixDist[m.prefix] ?? 0) + 1;
    const d = String(m.depth);
    depthDist[d] = (depthDist[d] ?? 0) + 1;
  }

  // Cross-axis members — non-seed tablets that arrived via ≥2 distinct axes
  const crossAxis: LineageMember[] = [];
  for (const m of chain) {
    if (m.depth === 0) continue;
    const distinctAxes = new Set<LineageAxis>();
    for (const a of m.axes_arrived_via) distinctAxes.add(a.axis);
    if (distinctAxes.size >= 2) crossAxis.push(m);
  }
  // Highest-confidence first: more distinct axes, then more arrivals total
  crossAxis.sort((a, b) => {
    const aAxes = new Set(a.axes_arrived_via.map((x) => x.axis)).size;
    const bAxes = new Set(b.axes_arrived_via.map((x) => x.axis)).size;
    if (aAxes !== bAxes) return bAxes - aAxes;
    return b.axes_arrived_via.length - a.axes_arrived_via.length;
  });

  return {
    query: {
      seed_tablet_id: opts.seedTabletId,
      axis_sequence: axisSeq,
      max_depth: maxDepth,
      top_k_per_hop: topK,
      min_fuzzy_jaccard: minFuzzyJ,
      min_scribal_cosine: minScribalCos,
      min_thematic_cosine: minThematicCos,
      max_chain_size: maxChainSize,
    },
    chain,
    axis_path_summary: axisPathSummary,
    prefix_distribution: prefixDist,
    cross_axis_members: crossAxis,
    summary: {
      total_chain_size: chain.length,
      axis_sequence_used: axisSeq,
      termination_reason: termination,
      depth_distribution: depthDist,
      expansion_calls: expansionCalls,
    },
    warnings,
  };
}
