#!/usr/bin/env node
// Round-3 calibration audit, Lever 1: embedded-fragment asymmetry.
//
// Hypothesis: symmetric fuzzy-Jaccard misses Archetype-5 (embedded fragment)
// relationships because the |A ∪ B| denominator is dominated by the host's
// vocabulary. Asymmetric containment `fuzzy_intersect / |guest|` is the right
// primitive — probes whether a small fragment's signal is reproduced in a
// larger host.
//
// Ground truth:
//   Positive — K.9508 (small Mīs pî fragment) should find K.5896 as #1 host.
//              Typology (2026-05-23) confirmed 102-sign run when K.5896 probes K.9508.
//   Negative — IM.49220 + K.3306 (the methods-paper v0.18.2 bi-orphans) should
//              return ZERO hosts (genuinely isolated, NOT embedded).
//   Sample — 20 random lex-singletons under 200 signs: what fraction has a
//            ≥0.50 containment host? Distribution informs whether the tool's
//            default threshold is precision-tight or noise-leaky.

import { findFuzzyParallels, findEmbeddedFragments, fuzzyIndexStats } from "../dist/fuzzyParallels.js";
import { getAllTabletRecords } from "../dist/anomalySurface.js";

const log = (label, data) => {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 2500));
};

const fuzzyStats = fuzzyIndexStats();
console.log("Fuzzy index:", fuzzyStats);
if (!fuzzyStats.loaded) {
  console.error("ABORT: fuzzy index unavailable");
  process.exit(1);
}

// ─── Test 1: K.9508 — the canonical embedded-fragment positive case ─────────
log("TEST 1: K.9508 symmetric vs asymmetric", "");

const k9508Sym = findFuzzyParallels({ tabletId: "K.9508", topK: 5, minFuzzyJaccard: 0.10 });
console.log("Symmetric fuzzyParallels(K.9508):");
console.log("  parallels found:", k9508Sym.parallels.length);
for (const p of k9508Sym.parallels) {
  console.log(`    ${p.tablet_id}  fuzzy_J=${p.fuzzy_jaccard}  run=${p.longest_contiguous_run}`);
}
console.log("  query_trigrams:", k9508Sym.index_stats.query_trigram_count);

const k9508Asym = findEmbeddedFragments({ guestTabletId: "K.9508", topK: 5, minContainment: 0.30 });
console.log("\nAsymmetric findEmbeddedFragments(K.9508):");
console.log("  matches found:", k9508Asym.matches.length);
console.log("  candidates_examined:", k9508Asym.index_stats.candidates_examined);
console.log("  candidates_passing_host_filter:", k9508Asym.index_stats.candidates_passing_host_filter);
console.log("  candidates_with_overlap:", k9508Asym.index_stats.candidates_with_overlap);
for (const m of k9508Asym.matches) {
  console.log(
    `    host=${m.host_tablet_id}  containment=${m.containment}  run=${m.longest_contiguous_run}  host_size_ratio=${m.host_size_ratio}x  exact_containment=${m.exact_containment}`,
  );
}

// ─── Test 2: Reverse direction — K.5896 should be the host, not a guest ─────
log("TEST 2: K.5896 (large host) probed by both methods", "");

const k5896Sym = findFuzzyParallels({ tabletId: "K.5896", topK: 5, minFuzzyJaccard: 0.10 });
console.log("Symmetric fuzzyParallels(K.5896) top-5:");
for (const p of k5896Sym.parallels) {
  console.log(`    ${p.tablet_id}  fuzzy_J=${p.fuzzy_jaccard}  run=${p.longest_contiguous_run}`);
}

const k5896Asym = findEmbeddedFragments({ guestTabletId: "K.5896", topK: 5, minContainment: 0.30 });
console.log("\nAsymmetric findEmbeddedFragments(K.5896):");
console.log("  matches found:", k5896Asym.matches.length, "(should be ~0 — K.5896 is a host, not a guest)");
console.log("  warnings:", k5896Asym.warnings);

// ─── Test 3: Negative cases (the methods-paper §3.6 final-2 bi-orphans) ─────
log("TEST 3: Negative cases — IM.49220 + K.3306", "");

for (const id of ["IM.49220", "K.3306"]) {
  const sym = findFuzzyParallels({ tabletId: id, topK: 3, minFuzzyJaccard: 0.10 });
  const asym = findEmbeddedFragments({ guestTabletId: id, topK: 3, minContainment: 0.30 });
  console.log(`\n${id}:`);
  console.log(`  symmetric fuzzy parallels: ${sym.parallels.length}`);
  for (const p of sym.parallels) console.log(`    ${p.tablet_id}  fuzzy_J=${p.fuzzy_jaccard}`);
  console.log(`  asymmetric embedded matches: ${asym.matches.length}`);
  for (const m of asym.matches) {
    console.log(`    host=${m.host_tablet_id}  containment=${m.containment}  run=${m.longest_contiguous_run}`);
  }
  console.log(`  query_trigrams=${asym.index_stats.query_trigram_count}  candidates_examined=${asym.index_stats.candidates_examined}  candidates_passing_host_filter=${asym.index_stats.candidates_passing_host_filter}`);
}

// ─── Test 4: 20 random lex-singletons under 200 signs ────────────────────────
log("TEST 4: 20 random lex-singletons under 200 signs", "");

const allRecs = getAllTabletRecords();
if (!allRecs) {
  console.error("ABORT: anomaly index not loaded");
  process.exit(1);
}

const lexSingletons = allRecs.filter(
  (t) => t.in_lex_graph && t.lex_count === 0 && t.sign_count > 0 && t.sign_count < 200,
);
console.log(`Total lex-singletons under 200 signs in corpus: ${lexSingletons.length}`);
console.log(`Sign-count distribution of pool:`);
{
  const buckets = { "0-50": 0, "50-100": 0, "100-150": 0, "150-200": 0 };
  for (const t of lexSingletons) {
    if (t.sign_count < 50) buckets["0-50"]++;
    else if (t.sign_count < 100) buckets["50-100"]++;
    else if (t.sign_count < 150) buckets["100-150"]++;
    else buckets["150-200"]++;
  }
  console.log("  ", JSON.stringify(buckets));
}

// seeded shuffle (deterministic, mulberry32)
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260523);
const shuffled = [...lexSingletons].sort(() => rng() - 0.5);
const sample = shuffled.slice(0, 20);

let withHost = 0;
let withoutHost = 0;
const rows = [];
for (const t of sample) {
  const asym = findEmbeddedFragments({ guestTabletId: t.id, topK: 1, minContainment: 0.50 });
  const sym = findFuzzyParallels({ tabletId: t.id, topK: 1, minFuzzyJaccard: 0.10 });
  const hasHost = asym.matches.length > 0;
  if (hasHost) withHost++; else withoutHost++;
  rows.push({
    id: t.id,
    sign_count: t.sign_count,
    sym_top1: sym.parallels[0]?.tablet_id ?? "—",
    sym_J: sym.parallels[0]?.fuzzy_jaccard ?? null,
    asym_host: asym.matches[0]?.host_tablet_id ?? "—",
    asym_containment: asym.matches[0]?.containment ?? null,
    asym_run: asym.matches[0]?.longest_contiguous_run ?? null,
  });
}
console.log(`\nSample results (min_containment=0.50):`);
console.log(`  with embedded host: ${withHost}/${sample.length}`);
console.log(`  no embedded host:   ${withoutHost}/${sample.length}`);
console.table(rows);

// ─── Test 5: Containment distribution sweep (precision/recall tradeoff) ──────
log("TEST 5: K.9508 containment distribution (range of thresholds)", "");

for (const minC of [0.10, 0.20, 0.30, 0.50, 0.70]) {
  const r = findEmbeddedFragments({ guestTabletId: "K.9508", topK: 50, minContainment: minC });
  console.log(`  min_containment=${minC}  matches=${r.matches.length}  top3=[${r.matches.slice(0, 3).map((m) => `${m.host_tablet_id}@${m.containment}`).join(", ")}]`);
}

// ─── Test 6: min_run precision filter sweep on the negative cases ────────────
log("TEST 6: min_run precision filter — does it suppress noise on IM.49220 + K.3306?", "");

for (const minRun of [0, 10, 15, 20, 25, 30]) {
  console.log(`\n  min_run=${minRun}:`);
  for (const id of ["K.9508", "IM.49220", "K.3306"]) {
    const r = findEmbeddedFragments({ guestTabletId: id, topK: 5, minContainment: 0.50, minRun });
    const hits = r.matches.map((m) => `${m.host_tablet_id}(c=${m.containment},r=${m.longest_contiguous_run})`).join(", ");
    console.log(`    ${id.padEnd(10)}  hits=${r.matches.length}  ${hits || "—"}`);
  }
}

// ─── Test 7: 20-tablet sample at recommended default (min_run=20) ────────────
log("TEST 7: 20-tablet sample at recommended default min_run=20", "");

let withHostTight = 0;
const tightRows = [];
for (const t of sample) {
  const r = findEmbeddedFragments({ guestTabletId: t.id, topK: 1, minContainment: 0.50, minRun: 20 });
  if (r.matches.length > 0) withHostTight++;
  tightRows.push({
    id: t.id,
    sign_count: t.sign_count,
    host: r.matches[0]?.host_tablet_id ?? "—",
    containment: r.matches[0]?.containment ?? null,
    run: r.matches[0]?.longest_contiguous_run ?? null,
  });
}
console.log(`Tight-default results (min_containment=0.50, min_run=20):`);
console.log(`  with embedded host: ${withHostTight}/${sample.length}`);
console.log(`  no embedded host:   ${sample.length - withHostTight}/${sample.length}`);
console.table(tightRows);

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("✅ Lever 1 decomposition complete.");
console.log("══════════════════════════════════════════════════════════════════════\n");
