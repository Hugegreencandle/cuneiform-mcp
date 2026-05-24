// v0.33.0 — build_stemma_with_rooting.
//
// Extends v0.22's buildCanonicalRecensionTree with three rooting heuristics.
// The v0.22 neighbor-joining output is structurally UNROOTED (a trifurcation
// at the algorithmic root node). This module re-roots the resulting tree at
// a chosen leaf using one of three strategies:
//
//   - "earliest_period": pick the witness with the earliest period
//     (OB → MB → MA → NA → NB → LB ordering). The Mesopotamian-canonical
//     archetype-closer-is-earlier assumption.
//   - "most_chunk_hosts": pick the witness with the highest chunk-host count
//     in the cluster — a graph-theoretic coverage-centroid heuristic.
//   - "outgroup_witness": pick a caller-specified tablet (e.g. an OB
//     forerunner identified externally).
//
// Re-rooting algorithm: build undirected adjacency from the tree's directed
// edges, BFS from the chosen leaf, then emit a new Newick string with all
// edges oriented away from the new root.

import {
  buildCanonicalRecensionTree,
  type RecensionAlgorithm,
  type RecensionTreeResult,
  type RecensionWitness,
} from "./recensionTree.js";

export type RootingMode =
  | "earliest_period"
  | "most_chunk_hosts"
  | "outgroup_witness";

export type RootedStemmaResult = {
  composition_seed: string;
  algorithm: RecensionAlgorithm;
  rooting: {
    mode: RootingMode;
    root_witness: string | null;
    root_choice_rationale: string;
    candidates_considered: number;
  };
  witnesses: RecensionWitness[];
  unrooted_newick: string;
  rooted_newick: string;
  rooted_tree_edges: Array<{ from: string; to: string; branch_length: number }>;
  distance_matrix: number[][];
  warnings: string[];
};

export type RootedStemmaOptions = {
  seedTabletId: string;
  rootingMode: RootingMode;
  outgroupWitness?: string;
  maxWitnesses?: number;
  minPairwiseChunks?: number;
  algorithm?: RecensionAlgorithm;
};

// ─── Period ordering ──────────────────────────────────────────────────────

const PERIOD_RANK: Record<string, number> = {
  "Old Babylonian": 1,
  "OB": 1,
  "Middle Babylonian": 2,
  "MB": 2,
  "Middle Assyrian": 3,
  "MA": 3,
  "Neo-Assyrian": 4,
  "NA": 4,
  "Neo-Babylonian": 5,
  "NB": 5,
  "Late Babylonian": 6,
  "LB": 6,
  "Hellenistic": 7,
  "Achaemenid": 6,
};

function periodRank(period: string | null): number {
  if (!period) return 999;
  const exact = PERIOD_RANK[period];
  if (exact !== undefined) return exact;
  // Substring match — eBL period strings sometimes carry qualifiers
  // ("Neo-Assyrian (Ashurbanipal)").
  for (const key of Object.keys(PERIOD_RANK)) {
    if (period.includes(key)) return PERIOD_RANK[key];
  }
  return 999;
}

// ─── Newick parser (minimal, for re-rooting) ──────────────────────────────
//
// We re-parse the v0.22 Newick output into an undirected edge list rather
// than threading the in-memory Tree object through the API. This keeps
// recensionTree.ts unchanged.

type NewickEdge = { a: string; b: string; bl: number };

function parseNewick(s: string): { edges: NewickEdge[]; rootLabel: string } {
  const src = s.trim().replace(/;$/, "");
  let pos = 0;
  const edges: NewickEdge[] = [];
  let internalCounter = 0;

  function genInternalId(label: string): string {
    if (label) return label;
    internalCounter++;
    return `_INT_${internalCounter}`;
  }

  function readLabel(): string {
    let out = "";
    if (src[pos] === "'") {
      pos++;
      while (pos < src.length && src[pos] !== "'") {
        out += src[pos++];
      }
      pos++; // closing quote
    } else {
      while (pos < src.length && !"(),:;".includes(src[pos])) {
        out += src[pos++];
      }
    }
    return out;
  }

  function readBranchLength(): number {
    if (src[pos] !== ":") return 0;
    pos++;
    let num = "";
    while (pos < src.length && /[-0-9.eE+]/.test(src[pos])) num += src[pos++];
    const n = parseFloat(num);
    return isFinite(n) ? n : 0;
  }

  // Recursive descent — returns the node label produced at this position.
  function parseNode(): string {
    if (src[pos] === "(") {
      pos++;
      const children: Array<{ id: string; bl: number }> = [];
      while (true) {
        const childLabel = parseNode();
        const bl = readBranchLength();
        children.push({ id: childLabel, bl });
        if (src[pos] === ",") {
          pos++;
          continue;
        } else if (src[pos] === ")") {
          pos++;
          break;
        } else {
          break;
        }
      }
      const label = genInternalId(readLabel());
      for (const c of children) edges.push({ a: label, b: c.id, bl: c.bl });
      return label;
    } else {
      return readLabel();
    }
  }

  const rootLabel = parseNode();
  return { edges, rootLabel };
}

// ─── Re-rooting ───────────────────────────────────────────────────────────

function rerootAtLeaf(
  edges: NewickEdge[],
  newRoot: string,
): { edges: Array<{ from: string; to: string; bl: number }>; rooted: string } {
  // Build undirected adjacency.
  const adj = new Map<string, Array<{ neighbor: string; bl: number }>>();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push({ neighbor: e.b, bl: e.bl });
    adj.get(e.b)!.push({ neighbor: e.a, bl: e.bl });
  }
  if (!adj.has(newRoot)) {
    throw new Error(`reroot target "${newRoot}" not in tree`);
  }
  // BFS from newRoot.
  const visited = new Set<string>([newRoot]);
  const queue: string[] = [newRoot];
  const out: Array<{ from: string; to: string; bl: number }> = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const { neighbor, bl } of adj.get(cur) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      out.push({ from: cur, to: neighbor, bl });
      queue.push(neighbor);
    }
  }
  return { edges: out, rooted: newRoot };
}

function escapeNewickLabel(label: string): string {
  if (/[\s()[\],:;']/.test(label)) {
    return "'" + label.replace(/'/g, "''") + "'";
  }
  return label;
}

function formatBranchLength(bl: number): string {
  if (!isFinite(bl)) return "0";
  if (bl === 0) return "0";
  return String(+bl.toFixed(6));
}

function renderRootedNewick(
  rootId: string,
  edges: Array<{ from: string; to: string; bl: number }>,
): string {
  // Group edges by source.
  const children = new Map<string, Array<{ id: string; bl: number }>>();
  for (const e of edges) {
    if (!children.has(e.from)) children.set(e.from, []);
    children.get(e.from)!.push({ id: e.to, bl: e.bl });
  }

  function render(id: string): string {
    const kids = children.get(id);
    if (!kids || kids.length === 0) return escapeNewickLabel(id);
    const parts = kids.map((c) => `${render(c.id)}:${formatBranchLength(c.bl)}`);
    return `(${parts.join(",")})${escapeNewickLabel(id)}`;
  }

  return `${render(rootId)};`;
}

// ─── Root-choice strategies ────────────────────────────────────────────────

function chooseRootByEarliestPeriod(witnesses: RecensionWitness[]): {
  root: string | null;
  rationale: string;
  considered: number;
} {
  if (witnesses.length === 0) {
    return { root: null, rationale: "no witnesses available", considered: 0 };
  }
  const ranked = witnesses
    .map((w) => ({ w, rank: periodRank(w.period) }))
    .sort((a, b) => a.rank - b.rank || a.w.tablet_id.localeCompare(b.w.tablet_id));
  const top = ranked[0];
  if (top.rank === 999) {
    // No witness has a known period — fall back to the seed.
    const seedW = witnesses[0];
    return {
      root: seedW.tablet_id,
      rationale: `no witness had a recognized period in PERIOD_RANK; defaulted to first witness (seed) ${seedW.tablet_id}`,
      considered: witnesses.length,
    };
  }
  return {
    root: top.w.tablet_id,
    rationale: `${top.w.tablet_id} has the earliest recognized period ("${top.w.period}"), rank=${top.rank} of {OB:1, MB:2, MA:3, NA:4, NB:5, LB:6}`,
    considered: witnesses.length,
  };
}

function chooseRootByMostChunkHosts(witnesses: RecensionWitness[]): {
  root: string | null;
  rationale: string;
  considered: number;
} {
  if (witnesses.length === 0) {
    return { root: null, rationale: "no witnesses available", considered: 0 };
  }
  const ranked = witnesses
    .slice()
    .sort(
      (a, b) =>
        b.host_chunks_total - a.host_chunks_total ||
        a.tablet_id.localeCompare(b.tablet_id),
    );
  const top = ranked[0];
  return {
    root: top.tablet_id,
    rationale: `${top.tablet_id} has the highest host_chunks_total (${top.host_chunks_total}) — graph-theoretic coverage centroid in the cluster`,
    considered: witnesses.length,
  };
}

function chooseRootByOutgroup(
  witnesses: RecensionWitness[],
  outgroup: string | undefined,
): { root: string | null; rationale: string; considered: number } {
  if (!outgroup) {
    return {
      root: null,
      rationale: "outgroup_witness mode requires outgroupWitness option",
      considered: 0,
    };
  }
  const hit = witnesses.find((w) => w.tablet_id === outgroup);
  if (!hit) {
    return {
      root: null,
      rationale: `outgroup_witness "${outgroup}" not in cluster (try a larger maxWitnesses or pick a different outgroup)`,
      considered: witnesses.length,
    };
  }
  return {
    root: outgroup,
    rationale: `caller-specified outgroup ${outgroup} (period=${hit.period ?? "n/a"}, host_chunks=${hit.host_chunks_total})`,
    considered: witnesses.length,
  };
}

// ─── Public entry point ────────────────────────────────────────────────────

export function buildStemmaWithRooting(opts: RootedStemmaOptions): RootedStemmaResult {
  const base = buildCanonicalRecensionTree({
    seedTabletId: opts.seedTabletId,
    maxWitnesses: opts.maxWitnesses,
    minPairwiseChunks: opts.minPairwiseChunks,
    algorithm: opts.algorithm ?? "neighbor_joining",
  });

  const warnings = base.warnings.slice();

  let rooted: { root: string | null; rationale: string; considered: number };
  switch (opts.rootingMode) {
    case "earliest_period":
      rooted = chooseRootByEarliestPeriod(base.witnesses);
      break;
    case "most_chunk_hosts":
      rooted = chooseRootByMostChunkHosts(base.witnesses);
      break;
    case "outgroup_witness":
      rooted = chooseRootByOutgroup(base.witnesses, opts.outgroupWitness);
      break;
  }

  let rootedNewick = "";
  let rootedEdges: Array<{ from: string; to: string; branch_length: number }> = [];

  if (rooted.root && base.tree) {
    try {
      const { edges } = parseNewick(base.tree);
      const { edges: rEdges, rooted: rRoot } = rerootAtLeaf(edges, rooted.root);
      rootedNewick = renderRootedNewick(rRoot, rEdges);
      rootedEdges = rEdges.map((e) => ({ from: e.from, to: e.to, branch_length: e.bl }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`reroot failed: ${msg}`);
      rooted.root = null;
    }
  } else if (!rooted.root) {
    warnings.push(`rooting mode "${opts.rootingMode}" produced no root: ${rooted.rationale}`);
  }

  return {
    composition_seed: opts.seedTabletId,
    algorithm: base.algorithm,
    rooting: {
      mode: opts.rootingMode,
      root_witness: rooted.root,
      root_choice_rationale: rooted.rationale,
      candidates_considered: rooted.considered,
    },
    witnesses: base.witnesses,
    unrooted_newick: base.tree,
    rooted_newick: rootedNewick,
    rooted_tree_edges: rootedEdges,
    distance_matrix: base.distance_matrix,
    warnings,
  };
}

export function _internals_parseNewick(s: string) {
  return parseNewick(s);
}

export function _internals_rerootAtLeaf(
  edges: NewickEdge[],
  newRoot: string,
) {
  return rerootAtLeaf(edges, newRoot);
}
