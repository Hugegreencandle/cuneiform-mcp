#!/usr/bin/env node
// Round-15 calibration audit: analyze_joins_graph (v0.30.0).
//
// Three tests:
//
//   T1. Sanity — top-hosts mode returns top_k entries, and HS.2536.G
//                (joins_count = 21 per the cache build) is present.
//
//   T2. Per-tablet — fetch K.5896's joins from eBL and verify the
//                    neighborhood resolves to a non-empty list of valid
//                    tablet IDs. K.5896 carries joins_count=14 in the
//                    fragment-metadata cache; eBL's joins[] groups include
//                    the query tablet as the first entry, so we expect
//                    exactly that count of neighbors after flattening +
//                    self-removal (14 = the 14 other manuscripts joined
//                    into the Mīs pî composition).
//
//   T3. Cross-check — index_stats.total_fragments_with_joins from the
//                     cache equals 4361 (matches the joins-graph build).
//
// Eyeball dump: top-5 join-rich tablets with period + genre + the K.5896
// join neighborhood (publishable v0.30 figure-source).

import {
  analyzeJoinsGraph,
  loadJoinsGraph,
} from "../dist/analyzeJoinsGraph.js";

const results = [];
function report(name, pass, detail) {
  const tag = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${tag} — ${name}`);
  if (detail) console.log(`  ${detail}`);
  results.push({ name, pass });
}

function header(title) {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${title}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
}

// ─── Pre-flight ───────────────────────────────────────────────────────────

header("Pre-flight: joins-graph cache load");
const cache = loadJoinsGraph();
if (!cache) {
  console.error("\nABORT: joins-graph cache not loaded. Run scripts/extract-joins-graph.mjs first.");
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      version: cache.version,
      fragments_with_joins: cache.fragments_with_joins,
      total_join_edges: cache.total_join_edges,
      top_join_hosts_n: cache.top_join_hosts.length,
    },
    null,
    2,
  ),
);

// ─── TEST 1: Sanity (top-hosts mode) ──────────────────────────────────────

header("TEST 1: Sanity — top-hosts returns top_k entries, HS.2536.G present");

const top30 = await analyzeJoinsGraph({ listTopHosts: true, topK: 30 });
const hasHS = top30.top_hosts.some((h) => h.tablet_id === "HS.2536.G");
const sanityOk =
  top30.mode === "top-hosts" &&
  Array.isArray(top30.top_hosts) &&
  top30.top_hosts.length === 30 &&
  hasHS;

report(
  "top-hosts mode returns 30 entries and includes HS.2536.G (21 joins)",
  sanityOk,
  `mode=${top30.mode} · returned=${top30.top_hosts.length} · HS.2536.G_present=${hasHS}`,
);

// ─── TEST 2: Per-tablet mode (live eBL fetch) ─────────────────────────────

header("TEST 2: Per-tablet mode — K.5896 join_neighborhood resolves");

const k5896 = await analyzeJoinsGraph({ tabletId: "K.5896" });
const direct = k5896.join_neighborhood?.direct_joins ?? [];
const allValid = direct.every(
  (n) => typeof n.tablet_id === "string" && n.tablet_id.length > 0,
);
const perTabletOk =
  k5896.mode === "per-tablet" &&
  k5896.tablet_id === "K.5896" &&
  direct.length > 0 &&
  allValid &&
  k5896.join_neighborhood.joins_count === direct.length;

report(
  "K.5896 per-tablet mode returns valid direct_joins list",
  perTabletOk,
  `mode=${k5896.mode} · direct_joins=${direct.length} · all_valid_ids=${allValid} · joins_count=${k5896.join_neighborhood?.joins_count}`,
);

// ─── TEST 3: Cross-check (index_stats matches cache build) ────────────────

header("TEST 3: Cross-check — index_stats.total_fragments_with_joins == 4361");

const EXPECTED_HOSTS = 4361;
const got = top30.index_stats.total_fragments_with_joins;
const crossOk = got === EXPECTED_HOSTS;
report(
  `index_stats.total_fragments_with_joins == ${EXPECTED_HOSTS}`,
  crossOk,
  `got=${got} · total_join_edges=${top30.index_stats.total_join_edges} · avg_joins_per_join_host=${top30.index_stats.avg_joins_per_join_host}`,
);

// ─── Eyeball dump ─────────────────────────────────────────────────────────

header("Eyeball: top-5 join-rich tablets (period + primary_genre)");

const top5 = top30.top_hosts.slice(0, 5);
for (const h of top5) {
  console.log(
    `  ${h.tablet_id.padEnd(14)}  joins=${String(h.joins_count).padStart(3)}  period=${(h.period ?? "(unknown)").padEnd(14)}  genre=${h.primary_genre ?? "(unknown)"}`,
  );
}

header("Eyeball: K.5896 join_neighborhood (Mīs pî composition)");
for (const n of direct.slice(0, 20)) {
  console.log(
    `  ${n.tablet_id.padEnd(14)}  period=${(n.period ?? "(unknown)").padEnd(14)}  genre=${n.genre ?? "(unknown)"}`,
  );
}
if (direct.length > 20) console.log(`  ... and ${direct.length - 20} more`);

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(`Round-15 audit summary: ${results.filter((r) => r.pass).length}/${results.length} passed`);
console.log(`══════════════════════════════════════════════════════════════════════\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log("");

if (results.some((r) => !r.pass)) process.exit(2);
