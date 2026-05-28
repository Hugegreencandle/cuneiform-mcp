// v0.68.0 — Directed-graph metrics helpers for compute_quotation_network.
//
// Pure-TS, dependency-free implementations of:
//   • in-degree / out-degree (weighted + unweighted)
//   • Tarjan's strongly-connected-components algorithm
//   • Sampled-source betweenness-centrality approximation (BFS from a small
//     random set of source nodes; rank by participation rather than exact
//     score — Brandes' algorithm is overkill for ~20-100 composition-sized
//     graphs and would be wasted CPU when the directed multigraph is small
//     enough that visual inspection suffices)
//
// All functions operate on the adjacency-list representation produced by
// quotationNetwork.ts; nothing here is corpus-aware.

export type AdjList = Map<string, Map<string, number>>; // src → dst → weight

// ─── Degree helpers ────────────────────────────────────────────────────────

export function outDegree(adj: AdjList, node: string): number {
  const row = adj.get(node);
  if (!row) return 0;
  return row.size;
}

export function inDegree(adj: AdjList, node: string): number {
  let n = 0;
  for (const [src, row] of adj.entries()) {
    if (src === node) continue;
    if (row.has(node)) n++;
  }
  return n;
}

// ─── Tarjan SCC ────────────────────────────────────────────────────────────
//
// Returns an array of components; each component is the sorted list of node
// ids inside. Components are listed in reverse topological order, but callers
// here only need cardinality so the order is unimportant.

export function tarjanSCC(adj: AdjList, allNodes: string[]): string[][] {
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  // Iterative DFS to avoid blowing the JS call stack on long chains.
  function strongConnect(start: string): void {
    type Frame = { node: string; iter: IterableIterator<string>; };
    const frames: Frame[] = [];

    function pushFrame(node: string): void {
      index.set(node, counter);
      lowlink.set(node, counter);
      counter++;
      stack.push(node);
      onStack.add(node);
      const succ = adj.get(node);
      const iter = succ ? succ.keys() : [].values();
      frames.push({ node, iter });
    }

    pushFrame(start);

    while (frames.length > 0) {
      const top = frames[frames.length - 1];
      const next = top.iter.next();
      if (next.done) {
        // Pop: finalize SCC membership if root.
        const node = top.node;
        if (lowlink.get(node) === index.get(node)) {
          const comp: string[] = [];
          while (true) {
            const w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
            if (w === node) break;
          }
          comp.sort();
          components.push(comp);
        }
        frames.pop();
        if (frames.length > 0) {
          const parent = frames[frames.length - 1].node;
          const childLow = lowlink.get(node)!;
          const parentLow = lowlink.get(parent)!;
          if (childLow < parentLow) lowlink.set(parent, childLow);
        }
        continue;
      }
      const w = next.value;
      if (!index.has(w)) {
        pushFrame(w);
      } else if (onStack.has(w)) {
        const wIdx = index.get(w)!;
        const nodeLow = lowlink.get(top.node)!;
        if (wIdx < nodeLow) lowlink.set(top.node, wIdx);
      }
    }
  }

  for (const v of allNodes) {
    if (!index.has(v)) strongConnect(v);
  }
  return components;
}

// ─── Sampled-source betweenness approximation ──────────────────────────────
//
// Pick up to `sampleSize` source nodes (deterministically via seeded shuffle).
// For each source, run BFS over the directed adjacency. Increment a counter
// for every INTERMEDIATE node on a shortest path from source to any other
// reachable node (i.e. every node on the BFS tree that is neither the source
// nor a leaf). The accumulated count is the approximated betweenness score.
//
// Returns a Map<node, rank> where lower rank = higher betweenness; nodes
// with score 0 are not included.

function seededShuffle<T>(arr: T[], seed: number): T[] {
  // Mulberry32 PRNG — small + deterministic.
  let s = seed | 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sampledBetweennessRanks(
  adj: AdjList,
  allNodes: string[],
  opts?: { sampleSize?: number; seed?: number },
): Map<string, number> {
  const sampleSize = Math.min(opts?.sampleSize ?? 32, allNodes.length);
  const seed = opts?.seed ?? 137;
  const sources = seededShuffle(allNodes, seed).slice(0, sampleSize);

  const scores = new Map<string, number>();
  for (const node of allNodes) scores.set(node, 0);

  for (const src of sources) {
    // BFS from src; track predecessors to reconstruct shortest-path counts.
    const dist = new Map<string, number>();
    dist.set(src, 0);
    const queue: string[] = [src];
    const order: string[] = [];
    while (queue.length > 0) {
      const v = queue.shift()!;
      order.push(v);
      const succ = adj.get(v);
      if (!succ) continue;
      const dv = dist.get(v)!;
      for (const w of succ.keys()) {
        if (!dist.has(w)) {
          dist.set(w, dv + 1);
          queue.push(w);
        }
      }
    }
    // Count intermediates: every reached node that is not src and has at
    // least one outgoing edge participating in the BFS tree.
    for (const v of order) {
      if (v === src) continue;
      if (dist.get(v)! === 0) continue;
      // A node counts as "intermediate" if some other node was reached only
      // through it. We approximate with a simpler measure: count of
      // descendant levels below v in the BFS layering. That is too noisy in
      // a small graph; use a cleaner proxy — does v have ≥1 outgoing edge in
      // the reached subgraph?
      const succ = adj.get(v);
      if (!succ) continue;
      let hasDeeperChild = false;
      const dv = dist.get(v)!;
      for (const w of succ.keys()) {
        const dw = dist.get(w);
        if (dw !== undefined && dw === dv + 1) {
          hasDeeperChild = true;
          break;
        }
      }
      if (hasDeeperChild) scores.set(v, (scores.get(v) ?? 0) + 1);
    }
  }

  // Convert raw scores to ranks (1 = highest betweenness). Nodes with 0 score
  // get rank `null` and are dropped from the returned map; callers default
  // betweenness_rank to null in the response.
  const positive = allNodes
    .map((n) => ({ n, s: scores.get(n) ?? 0 }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n));

  const ranks = new Map<string, number>();
  for (let i = 0; i < positive.length; i++) {
    ranks.set(positive[i].n, i + 1);
  }
  return ranks;
}
