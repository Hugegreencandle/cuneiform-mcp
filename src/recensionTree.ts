// v0.22.0 — build_canonical_recension_tree: automated stemma reconstruction
// from chunk-hash overlap.
//
// THE classic Assyriological problem solved automatically: given a seed
// manuscript of a multi-witness composition (e.g. K.5896 for Mīs pî),
// reconstruct the textual family tree (stemma) of every extant witness.
// Scholars currently do this by hand over weeks per composition (cf. Walker
// & Dick 2001 on Mīs pî manuscript transmission).
//
// Pipeline:
//   1. Single-hop BFS-expand from seed via the v0.20 chunk-hash index:
//      collect every tablet that co-occurs with the seed in ≥1 chunk.
//   2. Filter by min_pairwise_chunks (default 3) and cap at max_witnesses.
//   3. Build a NxN distance matrix via 1 - shared/max(|HA|,|HB|).
//   4. Run neighbor-joining (default) or UPGMA → produce a binary tree.
//   5. Emit Newick + a flat edge list for downstream consumers.
//
// All math is pure TS (no external phylogenetics library). Algorithm
// references: Saitou & Nei 1987 (NJ); Sokal & Michener 1958 (UPGMA);
// Felsenstein 2004 §11.4 (negative-branch clamping, standard practice).
//
// See docs/v0.22-recension-tree-design.md for the methodological rationale.

import {
  getChunkIndexLoadError,
  getChunksContaining,
  loadChunkIndex,
} from "./chunkIndex.js";
import {
  getCity,
  getFragmentMetadata,
  getPeriod,
  getPrimaryGenre,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type RecensionAlgorithm = "neighbor_joining" | "upgma";

export type RecensionWitness = {
  tablet_id: string;
  shared_chunks_with_seed: number;
  host_chunks_total: number;
  sign_count: number | null;
  period: string | null;
  primary_genre: string | null;
  provenance: string | null;
};

export type RecensionTreeEdge = {
  from: string;
  to: string;
  branch_length: number;
};

export type RecensionIndexStats = {
  chunk_index_loaded: boolean;
  seed_host_chunks: number;
  candidate_witnesses_examined: number;
  witnesses_after_filter: number;
  witnesses_returned: number;
  metric_max_distance: number;
  metric_min_nonzero_distance: number;
};

export type RecensionTreeResult = {
  composition_seed: string;
  algorithm: RecensionAlgorithm;
  witnesses: RecensionWitness[];
  distance_matrix: number[][];
  tree: string; // Newick
  tree_edges: RecensionTreeEdge[];
  internal_nodes: number;
  index_stats: RecensionIndexStats;
  warnings: string[];
};

export type RecensionTreeOptions = {
  seedTabletId: string;
  maxWitnesses?: number;        // default 50
  minPairwiseChunks?: number;   // default 3
  algorithm?: RecensionAlgorithm; // default "neighbor_joining"
};

// ─── Internal tree representation ──────────────────────────────────────────
//
// We hold a tree as a plain map: node_id -> { children: Array<{ id, branch_length }> }.
// Leaves have no children entry. NJ produces an unrooted tree with a root
// trifurcation; UPGMA produces a rooted binary tree. Newick serialization
// handles both via the children list.

type TreeNode = {
  children: Array<{ id: string; branch_length: number }>;
};

type Tree = {
  nodes: Map<string, TreeNode>; // internal nodes only; leaves are implicit
  root: string;                  // root node id (for NJ this is the trifurcation node)
  rooted: boolean;
};

// ─── Public entry point ────────────────────────────────────────────────────

export function buildCanonicalRecensionTree(
  opts: RecensionTreeOptions,
): RecensionTreeResult {
  const warnings: string[] = [];
  const seed = opts.seedTabletId;
  const algorithm: RecensionAlgorithm = opts.algorithm ?? "neighbor_joining";
  const maxWitnesses = Math.max(2, Math.min(200, opts.maxWitnesses ?? 50));
  const minPairwiseChunks = Math.max(1, opts.minPairwiseChunks ?? 3);

  const index = loadChunkIndex();
  if (!index) {
    return emptyResult(seed, algorithm, [
      getChunkIndexLoadError() ?? "chunk-index unavailable",
    ]);
  }

  // ─── Step 1: collect seed's chunks + co-host counts ────────────────────
  const seedChunks = getChunksContaining(seed);
  if (seedChunks.length === 0) {
    return emptyResult(seed, algorithm, [
      `seed '${seed}' has no entries in the chunk-hash index (either unknown to the corpus, or all its chunks are singletons). Try a different seed or verify the tablet ID.`,
    ]);
  }

  // For each other tablet T, count how many seed-chunks it shares.
  // For each other tablet T, also remember the set of seed-chunk hashes it
  // appears in — we'll reuse this when computing T-vs-U distances later (a
  // chunk that T and U both appear in, where neither is the seed, must
  // ALSO be a seed-chunk to count via this single-hop construction, since
  // we never look outside seed_chunks).
  // BUT: distance(T,U) is defined over the FULL chunk-host sets, not just
  // seed-chunks. We need to recover each witness's full chunk-set via
  // getChunksContaining and intersect with the seed's hash universe — no,
  // that's wrong: distance(T,U) should use the full |HT|, |HU|, and the
  // full S(T,U) over the entire index, not restricted to seed-chunks.
  //
  // So: enumerate witnesses by single-hop seed adjacency (the SET of
  // tablets to include), but compute pairwise distances using each
  // witness's complete chunk-host set.
  const sharedWithSeed = new Map<string, number>();
  const seedChunkHashes = new Set<string>();
  for (const entry of seedChunks) {
    seedChunkHashes.add(entry.hash);
    for (const occ of entry.occurrences) {
      if (occ.tablet_id === seed) continue;
      sharedWithSeed.set(
        occ.tablet_id,
        (sharedWithSeed.get(occ.tablet_id) ?? 0) + 1,
      );
    }
  }

  const candidatesExamined = sharedWithSeed.size;

  // Filter by min_pairwise_chunks (against the seed).
  let filtered: Array<{ id: string; shared: number }> = [];
  for (const [id, n] of sharedWithSeed.entries()) {
    if (n >= minPairwiseChunks) filtered.push({ id, shared: n });
  }
  // Sort by shared-with-seed desc, then by id for determinism.
  filtered.sort((a, b) => b.shared - a.shared || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const afterFilter = filtered.length;
  // Cap at max_witnesses-1 to leave a slot for the seed itself.
  if (filtered.length > maxWitnesses - 1) {
    filtered = filtered.slice(0, maxWitnesses - 1);
  }

  if (filtered.length < 2) {
    return {
      composition_seed: seed,
      algorithm,
      witnesses: [],
      distance_matrix: [],
      tree: "",
      tree_edges: [],
      internal_nodes: 0,
      index_stats: {
        chunk_index_loaded: true,
        seed_host_chunks: seedChunks.length,
        candidate_witnesses_examined: candidatesExamined,
        witnesses_after_filter: afterFilter,
        witnesses_returned: filtered.length === 1 ? 2 : 1,
        metric_max_distance: 0,
        metric_min_nonzero_distance: 0,
      },
      warnings: [
        `only ${filtered.length} witness(es) found at min_pairwise_chunks=${minPairwiseChunks}; need ≥2 (excluding seed) to build a tree. Lower the threshold or pick a seed with more parallels.`,
      ],
    };
  }

  // ─── Step 2: assemble the witness list (seed first, then filtered) ─────
  type IntermediateWitness = {
    id: string;
    sharedWithSeed: number;
    hostChunks: Set<string>; // hashes of every chunk containing this tablet
    hostCount: number;
  };
  const witnessRecords: IntermediateWitness[] = [];

  // Seed itself.
  const seedHostSet = new Set<string>(seedChunkHashes);
  witnessRecords.push({
    id: seed,
    sharedWithSeed: seedChunks.length,
    hostChunks: seedHostSet,
    hostCount: seedChunks.length,
  });

  for (const f of filtered) {
    const chunks = getChunksContaining(f.id);
    const hashes = new Set<string>();
    for (const e of chunks) hashes.add(e.hash);
    witnessRecords.push({
      id: f.id,
      sharedWithSeed: f.shared,
      hostChunks: hashes,
      hostCount: chunks.length,
    });
  }

  const N = witnessRecords.length;

  // ─── Step 3: pairwise distance matrix ─────────────────────────────────
  const D: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  let maxDist = 0;
  let minNonzero = 1;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = witnessRecords[i];
      const b = witnessRecords[j];
      const shared = intersectionSize(a.hostChunks, b.hostChunks);
      const denom = Math.max(a.hostCount, b.hostCount, 1);
      const dist = 1 - shared / denom;
      // Numerical clamp (floating-point hygiene).
      const clamped = Math.max(0, Math.min(1, dist));
      D[i][j] = clamped;
      D[j][i] = clamped;
      if (clamped > maxDist) maxDist = clamped;
      if (clamped > 0 && clamped < minNonzero) minNonzero = clamped;
    }
  }
  if (minNonzero === 1 && maxDist === 0) {
    // All zeros — degenerate. Keep minNonzero at 0 for the schema.
    minNonzero = 0;
  } else if (minNonzero === 1 && maxDist > 0) {
    // Shouldn't happen, but be safe.
    minNonzero = maxDist;
  }

  // ─── Step 4: phylogenetic inference ───────────────────────────────────
  const labels = witnessRecords.map((w) => w.id);
  let tree: Tree;
  let negativeBranchClamps = 0;
  if (algorithm === "upgma") {
    const upgma = upgmaTree(D, labels);
    tree = upgma.tree;
    negativeBranchClamps = upgma.negativeClamps;
  } else {
    const nj = neighborJoiningTree(D, labels);
    tree = nj.tree;
    negativeBranchClamps = nj.negativeClamps;
  }
  if (negativeBranchClamps > 0) {
    warnings.push(
      `${negativeBranchClamps} negative branch length(s) clamped to 0 — input distance matrix violates additivity. Standard NJ practice (Felsenstein 2004 §11.4); does not invalidate the recovered topology.`,
    );
  }

  // ─── Step 5: build outputs ────────────────────────────────────────────
  const newick = toNewick(tree, labels);
  const tree_edges: RecensionTreeEdge[] = [];
  for (const [from, node] of tree.nodes.entries()) {
    for (const child of node.children) {
      tree_edges.push({ from, to: child.id, branch_length: child.branch_length });
    }
  }

  // Witness metadata enrichment.
  const witnesses: RecensionWitness[] = witnessRecords.map((w) => {
    const meta = getFragmentMetadata(w.id);
    return {
      tablet_id: w.id,
      shared_chunks_with_seed: w.sharedWithSeed,
      host_chunks_total: w.hostCount,
      sign_count: null, // sign_count would require all-signs-full.json; metadata is the cheaper proxy
      period: meta ? getPeriod(meta) : null,
      primary_genre: meta ? getPrimaryGenre(meta) : null,
      provenance: meta ? getCity(meta) : null,
    };
  });

  const metaCovered = witnesses.filter((w) => w.period || w.primary_genre).length;
  if (metaCovered < witnesses.length) {
    warnings.push(
      `${witnesses.length - metaCovered} of ${witnesses.length} witnesses lack cached fragment metadata; run enrich_prefix_metadata on the seed's prefix to populate period/genre/provenance.`,
    );
  }

  return {
    composition_seed: seed,
    algorithm,
    witnesses,
    distance_matrix: D,
    tree: newick,
    tree_edges,
    internal_nodes: tree.nodes.size,
    index_stats: {
      chunk_index_loaded: true,
      seed_host_chunks: seedChunks.length,
      candidate_witnesses_examined: candidatesExamined,
      witnesses_after_filter: afterFilter,
      witnesses_returned: N,
      metric_max_distance: +maxDist.toFixed(4),
      metric_min_nonzero_distance: +minNonzero.toFixed(4),
    },
    warnings,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function emptyResult(
  seed: string,
  algorithm: RecensionAlgorithm,
  warnings: string[],
): RecensionTreeResult {
  return {
    composition_seed: seed,
    algorithm,
    witnesses: [],
    distance_matrix: [],
    tree: "",
    tree_edges: [],
    internal_nodes: 0,
    index_stats: {
      chunk_index_loaded: false,
      seed_host_chunks: 0,
      candidate_witnesses_examined: 0,
      witnesses_after_filter: 0,
      witnesses_returned: 0,
      metric_max_distance: 0,
      metric_min_nonzero_distance: 0,
    },
    warnings,
  };
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  // Iterate the smaller set for speed.
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const x of small) if (big.has(x)) n++;
  return n;
}

// ─── Neighbor-joining (Saitou & Nei 1987) ──────────────────────────────────
//
// Implementation notes:
//   - We hold the working distance matrix as a Map<string, Map<string, number>>
//     so we can drop/add labels without index-shifting the entire matrix.
//   - active = current taxa list (leaves + internal nodes still unjoined).
//   - rowSum[label] = sum of D(label, other) over all other ACTIVE labels.
//   - At each iteration: compute Q matrix entries on-the-fly, find argmin,
//     merge the pair into a new node, update row sums.
//   - Negative branch lengths are clamped to 0 with a counter for warnings.
//
// Output: a Tree with one trifurcation root (last node created) for N≥3,
// or a single internal node connecting two leaves for N=2.

function neighborJoiningTree(
  D0: number[][],
  labels: string[],
): { tree: Tree; negativeClamps: number } {
  const N0 = labels.length;
  if (N0 < 2) {
    throw new Error("neighbor-joining requires ≥2 taxa");
  }
  if (N0 === 2) {
    const internal = "N1";
    const half = D0[0][1] / 2;
    const tree: Tree = {
      nodes: new Map<string, TreeNode>([
        [
          internal,
          {
            children: [
              { id: labels[0], branch_length: half },
              { id: labels[1], branch_length: half },
            ],
          },
        ],
      ]),
      root: internal,
      rooted: false,
    };
    return { tree, negativeClamps: 0 };
  }

  // Live matrix: dist.get(a).get(b) === dist.get(b).get(a). Diagonal omitted.
  const dist = new Map<string, Map<string, number>>();
  for (let i = 0; i < N0; i++) {
    const row = new Map<string, number>();
    for (let j = 0; j < N0; j++) {
      if (i !== j) row.set(labels[j], D0[i][j]);
    }
    dist.set(labels[i], row);
  }

  const active = new Set<string>(labels);
  const nodes = new Map<string, TreeNode>();
  let internalCount = 0;
  let negativeClamps = 0;

  function getDist(a: string, b: string): number {
    return dist.get(a)!.get(b)!;
  }

  function setDist(a: string, b: string, v: number): void {
    dist.get(a)!.set(b, v);
    dist.get(b)!.set(a, v);
  }

  function removeLabel(x: string): void {
    active.delete(x);
    dist.delete(x);
    for (const [, row] of dist) row.delete(x);
  }

  function rowSum(x: string): number {
    let s = 0;
    const row = dist.get(x)!;
    for (const other of active) {
      if (other === x) continue;
      s += row.get(other) ?? 0;
    }
    return s;
  }

  // Iterate until only 2 active taxa remain; then finalize.
  while (active.size > 2) {
    const r = active.size;
    // Precompute row sums.
    const sums = new Map<string, number>();
    for (const x of active) sums.set(x, rowSum(x));

    // Find pair (i,j) minimizing Q(i,j) = (r-2)*D(i,j) - sum(i) - sum(j).
    let bestI = "";
    let bestJ = "";
    let bestQ = Number.POSITIVE_INFINITY;
    const acts = Array.from(active);
    for (let a = 0; a < acts.length; a++) {
      for (let b = a + 1; b < acts.length; b++) {
        const i = acts[a];
        const j = acts[b];
        const q = (r - 2) * getDist(i, j) - sums.get(i)! - sums.get(j)!;
        if (q < bestQ) {
          bestQ = q;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Branch lengths from i and j to the new node u:
    //   d(i,u) = 0.5*D(i,j) + (sum(i) - sum(j)) / (2*(r-2))
    //   d(j,u) = D(i,j) - d(i,u)
    const dij = getDist(bestI, bestJ);
    let diU = 0.5 * dij + (sums.get(bestI)! - sums.get(bestJ)!) / (2 * (r - 2));
    let djU = dij - diU;
    if (diU < 0) { negativeClamps++; diU = 0; }
    if (djU < 0) { negativeClamps++; djU = 0; }

    internalCount++;
    const u = `N${internalCount}`;
    nodes.set(u, {
      children: [
        { id: bestI, branch_length: diU },
        { id: bestJ, branch_length: djU },
      ],
    });

    // Build u's row of distances to every remaining-active label other than i, j.
    const uRow = new Map<string, number>();
    for (const k of active) {
      if (k === bestI || k === bestJ) continue;
      // d(u,k) = (D(i,k) + D(j,k) - D(i,j)) / 2
      const duk = (getDist(bestI, k) + getDist(bestJ, k) - dij) / 2;
      uRow.set(k, duk);
    }
    dist.set(u, uRow);
    for (const [k, v] of uRow) {
      dist.get(k)!.set(u, v);
    }
    active.add(u);

    // Remove i and j from active + distance matrix.
    removeLabel(bestI);
    removeLabel(bestJ);
  }

  // Finalize: two taxa remain. Connect them under a final root node with a
  // single internal branch — but per NJ convention, the unrooted-tree
  // serialization places a trifurcation at the LAST joined internal node.
  //
  // Strategy: if the last-created internal node already has 2 children, we
  // promote it by appending the OTHER remaining taxon (call it `x`) as a
  // third child with branch length = remaining distance D(u, x), where u =
  // the last internal. This yields a trifurcation at u. If both remaining
  // are leaves (i.e. internalCount === 0; only possible when N0 === 2,
  // handled above), we already returned earlier.
  const finalPair = Array.from(active);
  if (finalPair.length !== 2) {
    throw new Error(`NJ invariant violated: expected 2 active taxa, got ${finalPair.length}`);
  }
  const [a, b] = finalPair;
  // The last-created internal node is `N{internalCount}`. One of {a,b} IS
  // that node (since we just added it to active above). Identify it.
  let trifurNode: string;
  let extraLeaf: string;
  if (a.startsWith("N") && nodes.has(a)) {
    trifurNode = a;
    extraLeaf = b;
  } else if (b.startsWith("N") && nodes.has(b)) {
    trifurNode = b;
    extraLeaf = a;
  } else {
    // Both are leaves — only possible if N0 === 2, already handled.
    // Fall back to a fresh root joining them.
    internalCount++;
    trifurNode = `N${internalCount}`;
    const half = getDist(a, b) / 2;
    nodes.set(trifurNode, {
      children: [
        { id: a, branch_length: half },
        { id: b, branch_length: half },
      ],
    });
    return { tree: { nodes, root: trifurNode, rooted: false }, negativeClamps };
  }
  // Attach extraLeaf as the third child of trifurNode.
  const remaining = getDist(trifurNode, extraLeaf);
  let bl = remaining;
  if (bl < 0) { negativeClamps++; bl = 0; }
  nodes.get(trifurNode)!.children.push({ id: extraLeaf, branch_length: bl });

  return { tree: { nodes, root: trifurNode, rooted: false }, negativeClamps };
}

// ─── UPGMA (Sokal & Michener 1958) ─────────────────────────────────────────
//
// Simpler than NJ: at each step, find the closest pair (i,j); merge into a
// new cluster u; the branch length from u to i (and j) is D(i,j) / 2 — the
// ultrametric assumption. New distances: D(u,k) = (|i|*D(i,k) + |j|*D(j,k))
// / (|i| + |j|), where |i| is the cluster size of i. Output: rooted binary
// tree with N-1 internal nodes.

function upgmaTree(
  D0: number[][],
  labels: string[],
): { tree: Tree; negativeClamps: number } {
  const N0 = labels.length;
  if (N0 < 2) throw new Error("UPGMA requires ≥2 taxa");

  // Live state:
  //   dist[a][b] = current dissimilarity
  //   clusterSize[x] = number of leaves below x
  //   height[x] = the ultrametric height assigned to x (0 for leaves)
  const dist = new Map<string, Map<string, number>>();
  for (let i = 0; i < N0; i++) {
    const row = new Map<string, number>();
    for (let j = 0; j < N0; j++) {
      if (i !== j) row.set(labels[j], D0[i][j]);
    }
    dist.set(labels[i], row);
  }
  const active = new Set<string>(labels);
  const clusterSize = new Map<string, number>();
  const height = new Map<string, number>();
  for (const l of labels) {
    clusterSize.set(l, 1);
    height.set(l, 0);
  }

  const nodes = new Map<string, TreeNode>();
  let internalCount = 0;
  let negativeClamps = 0;
  let lastNode = "";

  while (active.size > 1) {
    // Find argmin D(i,j) over active pairs.
    let bestI = "";
    let bestJ = "";
    let bestD = Number.POSITIVE_INFINITY;
    const acts = Array.from(active);
    for (let a = 0; a < acts.length; a++) {
      for (let b = a + 1; b < acts.length; b++) {
        const d = dist.get(acts[a])!.get(acts[b])!;
        if (d < bestD) {
          bestD = d;
          bestI = acts[a];
          bestJ = acts[b];
        }
      }
    }

    internalCount++;
    const u = `N${internalCount}`;
    const newHeight = bestD / 2;
    height.set(u, newHeight);
    let blI = newHeight - height.get(bestI)!;
    let blJ = newHeight - height.get(bestJ)!;
    if (blI < 0) { negativeClamps++; blI = 0; }
    if (blJ < 0) { negativeClamps++; blJ = 0; }

    nodes.set(u, {
      children: [
        { id: bestI, branch_length: blI },
        { id: bestJ, branch_length: blJ },
      ],
    });

    // New distance row.
    const ni = clusterSize.get(bestI)!;
    const nj = clusterSize.get(bestJ)!;
    const uRow = new Map<string, number>();
    for (const k of active) {
      if (k === bestI || k === bestJ) continue;
      const dik = dist.get(bestI)!.get(k)!;
      const djk = dist.get(bestJ)!.get(k)!;
      const duk = (ni * dik + nj * djk) / (ni + nj);
      uRow.set(k, duk);
    }
    dist.set(u, uRow);
    for (const [k, v] of uRow) dist.get(k)!.set(u, v);

    // Retire i and j.
    active.delete(bestI);
    active.delete(bestJ);
    dist.delete(bestI);
    dist.delete(bestJ);
    for (const [, row] of dist) {
      row.delete(bestI);
      row.delete(bestJ);
    }

    active.add(u);
    clusterSize.set(u, ni + nj);
    lastNode = u;
  }

  return { tree: { nodes, root: lastNode, rooted: true }, negativeClamps };
}

// ─── Newick serialization ──────────────────────────────────────────────────
//
// Recursive: a node renders as "(child1:bl1,child2:bl2,...)label" where
// leaves are bare "leafId". Trailing ";" appended at the top level.
//
// We don't emit branch lengths for the root itself (Newick convention).
// Internal-node labels (N1, N2, …) are emitted AFTER the closing paren so
// downstream parsers can recover the ancestral mapping.

function toNewick(tree: Tree, leafIds: string[]): string {
  if (tree.nodes.size === 0) return "";
  const leafSet = new Set(leafIds);
  const seen = new Set<string>();
  function render(nodeId: string): string {
    if (leafSet.has(nodeId)) return escapeNewickLabel(nodeId);
    if (seen.has(nodeId)) {
      // Cycle guard — shouldn't happen in a tree, but be defensive.
      return escapeNewickLabel(nodeId);
    }
    seen.add(nodeId);
    const node = tree.nodes.get(nodeId);
    if (!node || node.children.length === 0) return escapeNewickLabel(nodeId);
    const parts = node.children.map((c) => {
      const child = render(c.id);
      return `${child}:${formatBranchLength(c.branch_length)}`;
    });
    return `(${parts.join(",")})${escapeNewickLabel(nodeId)}`;
  }
  return `${render(tree.root)};`;
}

function formatBranchLength(bl: number): string {
  // Compact but non-zero-rounded representation; 6 sig figs.
  if (!isFinite(bl)) return "0";
  if (bl === 0) return "0";
  const rounded = +bl.toFixed(6);
  return String(rounded);
}

function escapeNewickLabel(label: string): string {
  // Newick reserves: whitespace, parens, brackets, comma, colon, semicolon.
  // Replace forbidden chars with underscore, OR quote with single-quotes
  // (Newick convention). We choose the quote approach for tablet IDs that
  // contain dots — IDs like "K.5896" are well-formed unquoted (dots are
  // legal in Newick labels), but "Rm-II.344" contains a hyphen which is
  // also legal. So in practice no quoting needed; only quote if the label
  // contains an actual reserved char.
  if (/[\s()[\],:;']/.test(label)) {
    return "'" + label.replace(/'/g, "''") + "'";
  }
  return label;
}
