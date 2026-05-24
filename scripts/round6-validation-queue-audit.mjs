#!/usr/bin/env node
// Round-6 single-tool audit: prioritize_validation_queue (v0.21).
//
// Hypothesis: an information-gain ranker over the three validation streams
// (bi-orphans / isolates / chunk-discoveries) surfaces tablets that ARE
// worth manually reviewing first and DROPS tablets that are already
// well-understood.
//
// Ground truth:
//   Test 1 (sanity) — scope="all", top_k=10 returns a non-empty queue with
//     positive scores and non-empty reasons[] on the top entries.
//   Test 2 (bi-orphan elevation) — scope="bi_orphans" surfaces IM.49220 in
//     the top-5 (methods-paper §3.6 final-1 bi-orphan after the K.3306 →
//     K.6685 narrowing).
//   Test 3 (redundancy penalty) — K.5896 (Mīs pî manuscript, 100+ cluster
//     members per §3.7.3) does NOT appear in the top-50 because it's
//     already well-curated + well-chunked.

import { prioritizeValidationQueue } from "../dist/validationQueue.js";

let passes = 0;
let fails = 0;
const failures = [];

function record(label, ok, detail) {
  if (ok) {
    passes++;
    console.log(`  ✅ PASS — ${label}`);
  } else {
    fails++;
    failures.push({ label, detail });
    console.log(`  ❌ FAIL — ${label}`);
    if (detail) console.log(`     ${detail}`);
  }
}

function banner(label) {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
}

// ─── Test 1: sanity ────────────────────────────────────────────────────────
banner("TEST 1: scope=all, top_k=10 — non-empty queue, positive top scores, non-empty reasons");

const t1 = prioritizeValidationQueue({ scope: "all", topK: 10 });

console.log(
  `index_stats: candidates=${t1.index_stats.candidates_considered}, ` +
    `bi-orphan_seeds=${t1.index_stats.bi_orphan_seeds}, ` +
    `isolate_seeds=${t1.index_stats.isolate_seeds}, ` +
    `chunk_seeds=${t1.index_stats.chunk_discovery_seeds}`,
);
console.log(`anomaly_index_loaded=${t1.index_stats.anomaly_index_loaded}, chunk_index_loaded=${t1.index_stats.chunk_index_loaded}`);
console.log(`warnings: ${t1.warnings.length === 0 ? "—" : t1.warnings.join("; ")}`);
console.log(`\nTop-10 queue:`);
for (const e of t1.queue) {
  console.log(
    `  ${e.tablet_id.padEnd(20)}  score=${String(e.score).padStart(7)}  ` +
      `chunks=${String(e.chunk_host_count).padStart(4)}  ` +
      `meta=${e.metadata_status.padEnd(8)}  ` +
      `cluster=${e.cluster_membership ?? "—"}  ` +
      `anomaly=[${e.anomaly_kind}]`,
  );
  for (const r of e.reasons.slice(0, 4)) console.log(`     · ${r}`);
}

record(
  "queue is non-empty",
  t1.queue.length > 0,
  `expected ≥1 entry, got ${t1.queue.length}`,
);
record(
  "top entry has positive score",
  t1.queue.length > 0 && t1.queue[0].score > 0,
  `top score = ${t1.queue[0]?.score ?? "n/a"}`,
);
record(
  "top-3 entries all have non-empty reasons[]",
  t1.queue.slice(0, 3).every((e) => e.reasons.length > 0),
  `reasons counts: ${t1.queue.slice(0, 3).map((e) => e.reasons.length).join(",")}`,
);

// ─── Test 2: bi-orphan elevation ───────────────────────────────────────────
banner("TEST 2: scope=bi_orphans — IM.49220 should rank in top-5");

const t2 = prioritizeValidationQueue({ scope: "bi_orphans", topK: 50 });
const im49220Idx = t2.queue.findIndex((e) => e.tablet_id === "IM.49220");
console.log(`IM.49220 rank: ${im49220Idx === -1 ? "NOT FOUND" : `#${im49220Idx + 1}`}`);
console.log(`bi-orphan queue size: ${t2.queue.length}`);
if (im49220Idx !== -1) {
  const e = t2.queue[im49220Idx];
  console.log(`  score=${e.score}  meta=${e.metadata_status}  cluster=${e.cluster_membership}  chunks=${e.chunk_host_count}`);
  console.log(`  reasons:`);
  for (const r of e.reasons) console.log(`    · ${r}`);
}
console.log(`\nTop-5 bi-orphan scope:`);
for (const e of t2.queue.slice(0, 5)) {
  console.log(`  ${e.tablet_id.padEnd(20)}  score=${String(e.score).padStart(7)}  anomaly=[${e.anomaly_kind}]`);
}

record(
  "IM.49220 surfaces in queue",
  im49220Idx !== -1,
  "IM.49220 not present in scope=bi_orphans output",
);
record(
  "IM.49220 ranks in top-5",
  im49220Idx >= 0 && im49220Idx < 5,
  `IM.49220 actual rank = ${im49220Idx === -1 ? "missing" : `#${im49220Idx + 1}`}`,
);

// ─── Test 3: redundancy penalty ────────────────────────────────────────────
banner("TEST 3: K.5896 (Mīs pî, well-clustered + well-chunked) should NOT appear in top-50");

const t3 = prioritizeValidationQueue({ scope: "all", topK: 50 });
const k5896Idx = t3.queue.findIndex((e) => e.tablet_id === "K.5896");
console.log(`K.5896 rank in top-50: ${k5896Idx === -1 ? "NOT IN TOP-50 (✅ expected)" : `#${k5896Idx + 1} (❌ unexpected)`}`);

if (k5896Idx !== -1) {
  const e = t3.queue[k5896Idx];
  console.log(`  score=${e.score}  meta=${e.metadata_status}  cluster=${e.cluster_membership}  chunks=${e.chunk_host_count}`);
  console.log(`  reasons:`);
  for (const r of e.reasons) console.log(`    · ${r}`);
}

// Diagnostic: peek at K.5896's scored entry by widening top_k.
const t3wide = prioritizeValidationQueue({ scope: "all", topK: 200 });
const k5896WideIdx = t3wide.queue.findIndex((e) => e.tablet_id === "K.5896");
console.log(
  `(diagnostic) K.5896 rank in top-200: ` +
    `${k5896WideIdx === -1 ? "still absent" : `#${k5896WideIdx + 1} with score=${t3wide.queue[k5896WideIdx].score}`}`,
);
if (k5896WideIdx !== -1) {
  console.log(`  K.5896 reasons: ${t3wide.queue[k5896WideIdx].reasons.join(" | ")}`);
}

record(
  "K.5896 not in top-50 (redundancy penalty fires)",
  k5896Idx === -1,
  k5896Idx !== -1 ? `K.5896 ranked #${k5896Idx + 1} in top-50` : "",
);

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(`Round-6 audit: ${passes} PASS · ${fails} FAIL`);
console.log(`══════════════════════════════════════════════════════════════════════`);
if (fails > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
