#!/usr/bin/env node
// Extract a corpus-wide joins graph from the cached fragment-metadata.
// No new API calls — just analyzes the joins[] field already populated by
// the v0.20+ enrichment bursts.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE = join(homedir(), ".cache", "cuneiform-mcp");
const META_PATH = join(CACHE, "fragment-metadata.json");
const OUT_PATH = join(CACHE, "joins-graph.json");

if (!existsSync(META_PATH)) {
  console.error("ABORT: fragment-metadata.json not found at", META_PATH);
  process.exit(1);
}

const meta = JSON.parse(readFileSync(META_PATH, "utf-8"));
const entries = Object.entries(meta);
console.log(`Loaded ${entries.length} fragment-metadata entries`);

const joinsByTablet = new Map();
let entriesWithJoins = 0;
let totalJoinEdges = 0;

for (const [id, m] of entries) {
  if (!m || !m.joins_count || m.joins_count === 0) continue;
  entriesWithJoins++;
  joinsByTablet.set(id, m.joins_count);
  totalJoinEdges += m.joins_count;
}

// Aggregate stats
const distribution = new Map();
for (const [_, count] of joinsByTablet) {
  distribution.set(count, (distribution.get(count) ?? 0) + 1);
}
const distArr = [...distribution.entries()].sort((a, b) => a[0] - b[0]);

console.log(`Entries with ≥1 join: ${entriesWithJoins}`);
console.log(`Total join edges (raw): ${totalJoinEdges}`);
console.log("");
console.log("Distribution (joins_count → tablet count):");
for (const [c, n] of distArr.slice(0, 20)) console.log(`  ${c} → ${n}`);

// Top join-rich tablets
const topJoinHosts = [...joinsByTablet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log("");
console.log("Top 30 join-rich tablets:");
for (const [id, n] of topJoinHosts) console.log(`  ${id}  joins=${n}`);

const output = {
  version: "0.30.0-alpha",
  build_timestamp: new Date().toISOString(),
  total_fragments_scanned: entries.length,
  fragments_with_joins: entriesWithJoins,
  total_join_edges: totalJoinEdges,
  top_join_hosts: topJoinHosts.map(([id, count]) => ({ tablet_id: id, joins_count: count })),
  distribution: Object.fromEntries(distribution),
};

writeFileSync(OUT_PATH, JSON.stringify(output, null, 0));
console.log(`\n✓ Wrote ${OUT_PATH} (${entriesWithJoins} entries with joins data)`);
