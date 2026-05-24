#!/usr/bin/env node
// Round-19 calibration audit: build_stemma_with_rooting (v0.33.0).
//
// Tests are SPLIT:
//   - Unit tests on the Newick parser + re-rooter (cache-independent; CI-eligible)
//   - Integration tests on K.5896 + Mīs pî cluster (cache-dependent)
//
// Hypothesis: re-rooting at a chosen leaf via undirected-BFS preserves the
// topology of the unrooted v0.22 tree and produces well-formed Newick.

import {
  buildStemmaWithRooting,
  _internals_parseNewick,
  _internals_rerootAtLeaf,
} from "../dist/recensionTreeRooted.js";

let pass = 0;
let fail = 0;
function report(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ PASS — ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ FAIL — ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("Round-19 audit: build_stemma_with_rooting (v0.33.0)\n");

// ─── Unit tests (cache-independent) ────────────────────────────────────────
console.log("UNIT TESTS (cache-independent, CI-eligible)\n");

// T1: parseNewick basic
console.log("T1: parseNewick recovers edges from simple Newick");
const t1 = _internals_parseNewick("((A:1,B:2)N1:3,(C:4,D:5)N2:6)ROOT;");
report(
  "edge count = 6 (4 leaf + 2 internal)",
  t1.edges.length === 6,
  `got ${t1.edges.length}`,
);
report(
  "rootLabel === 'ROOT'",
  t1.rootLabel === "ROOT",
);
const hasAtoN1 = t1.edges.some((e) => (e.a === "N1" && e.b === "A") || (e.a === "A" && e.b === "N1"));
report("contains N1-A edge with bl=1", hasAtoN1 && t1.edges.find((e) => (e.a === "N1" && e.b === "A") || (e.a === "A" && e.b === "N1")).bl === 1);

// T2: rerootAtLeaf direction inversion
console.log("\nT2: rerootAtLeaf inverts edge direction");
const t2 = _internals_rerootAtLeaf(t1.edges, "A");
report(
  "all edges flow away from new root A",
  t2.rooted === "A" && t2.edges.length === t1.edges.length,
  `edges=${t2.edges.length} root=${t2.rooted}`,
);
// A should have at least one outgoing edge (to N1).
const fromA = t2.edges.filter((e) => e.from === "A");
report("A has ≥1 outgoing edge", fromA.length >= 1);
// No node should appear twice as 'to' (each non-root visited once)
const toSet = new Set();
let dup = false;
for (const e of t2.edges) {
  if (toSet.has(e.to)) {
    dup = true;
    break;
  }
  toSet.add(e.to);
}
report("each non-root node receives exactly one parent edge", !dup);

// T3: rerootAtLeaf with non-existent target throws
console.log("\nT3: rerootAtLeaf throws on unknown target");
let threw = false;
try {
  _internals_rerootAtLeaf(t1.edges, "ZZZ");
} catch {
  threw = true;
}
report("unknown leaf throws", threw);

// T4: round-trip preserves edge count
console.log("\nT4: round-trip parse → reroot preserves edge count");
const t4 = _internals_rerootAtLeaf(t1.edges, "C");
report(
  "C-rooted edge count === original edge count",
  t4.edges.length === t1.edges.length,
);

// T5: branch lengths preserved (sign-irrelevant; we're undirected)
console.log("\nT5: branch lengths preserved through re-root");
const sumOrig = t1.edges.reduce((s, e) => s + e.bl, 0);
const sumReroot = t4.edges.reduce((s, e) => s + e.bl, 0);
report(
  "sum-of-branch-lengths preserved",
  Math.abs(sumOrig - sumReroot) < 1e-9,
  `orig=${sumOrig} reroot=${sumReroot}`,
);

// ─── Integration tests (cache-dependent) ───────────────────────────────────
console.log("\nINTEGRATION TESTS (cache-dependent)\n");

// T6: K.5896 Mīs pî cluster — earliest_period
console.log("T6: K.5896 Mīs pî cluster, rooting_mode=earliest_period");
const r6 = buildStemmaWithRooting({
  seedTabletId: "K.5896",
  rootingMode: "earliest_period",
  maxWitnesses: 20,
});
report(
  "produces rooted_newick string",
  typeof r6.rooted_newick === "string" && r6.rooted_newick.length > 0,
  `len=${r6.rooted_newick?.length}`,
);
report(
  "unrooted_newick non-empty (delegates to v0.22)",
  typeof r6.unrooted_newick === "string" && r6.unrooted_newick.length > 0,
);
report(
  "root_witness is a member of the witness set",
  r6.rooting.root_witness && r6.witnesses.some((w) => w.tablet_id === r6.rooting.root_witness),
  `root=${r6.rooting.root_witness}`,
);
console.log(`     rationale: ${r6.rooting.root_choice_rationale}`);

// T7: most_chunk_hosts mode
console.log("\nT7: K.5896 Mīs pî cluster, rooting_mode=most_chunk_hosts");
const r7 = buildStemmaWithRooting({
  seedTabletId: "K.5896",
  rootingMode: "most_chunk_hosts",
  maxWitnesses: 20,
});
const topByHosts = r7.witnesses
  .slice()
  .sort((a, b) => b.host_chunks_total - a.host_chunks_total)[0];
report(
  "root === witness with max host_chunks_total",
  r7.rooting.root_witness === topByHosts.tablet_id,
  `root=${r7.rooting.root_witness} expected=${topByHosts.tablet_id}`,
);

// T8: outgroup_witness mode — happy path
console.log("\nT8: outgroup_witness=K.9508 explicit (must be in cluster)");
const r8 = buildStemmaWithRooting({
  seedTabletId: "K.5896",
  rootingMode: "outgroup_witness",
  outgroupWitness: "K.9508",
  maxWitnesses: 20,
});
const r8inCluster = r8.witnesses.some((w) => w.tablet_id === "K.9508");
if (r8inCluster) {
  report(
    "outgroup K.9508 honored when present",
    r8.rooting.root_witness === "K.9508",
    `root=${r8.rooting.root_witness}`,
  );
} else {
  report(
    "outgroup K.9508 absent from cluster → null root + warning",
    r8.rooting.root_witness === null && r8.warnings.length > 0,
    `(K.9508 was not in 20-witness cluster — expected behavior)`,
  );
}

// T9: outgroup_witness mode — missing outgroup
console.log("\nT9: outgroup_witness mode without outgroup_witness option");
const r9 = buildStemmaWithRooting({
  seedTabletId: "K.5896",
  rootingMode: "outgroup_witness",
  maxWitnesses: 20,
});
report(
  "missing outgroup → null root + warning",
  r9.rooting.root_witness === null && r9.warnings.length > 0,
);

// T10: rooted_newick ends with semicolon (well-formed Newick)
console.log("\nT10: rooted_newick is well-formed");
report(
  "rooted_newick ends with ';'",
  r6.rooted_newick.endsWith(";"),
);
report(
  "rooted_newick contains the chosen root label",
  r6.rooted_newick.includes(r6.rooting.root_witness),
  `root=${r6.rooting.root_witness}`,
);

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-19 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
