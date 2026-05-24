#!/usr/bin/env node
// Round-8.1 audit — does the v0.23 sign2vec ABZ480/ABZ411 falsification
// (cosine 0.097) affect v0.21 find_incipits' top-30 in practice?
//
// v0.21's filter (src/findIncipits.ts:80): NUMERICAL_SIGNS = {"ABZ480", "ABZ411"};
// chunks with ≥70% of signs in that set are dropped as "numerical-table noise".
//
// v0.23 falsified the interchangeability assumption. This audit measures
// empirical impact: which chunks would be admitted if we drop ABZ411 from
// the filter, and are they actually meaningful incipits?
//
// Method:
// 1. Load the length-10 incipits index
// 2. Run the production find_incipits as-is (current ABZ480 + ABZ411 filter)
// 3. Manually filter the index with ABZ480-only at the same density threshold
// 4. Compare top-30 outputs: same? only-in-old? only-in-new?
// 5. For only-in-new chunks, inspect the signs — do they look like real
//    incipits, or are they genuinely numerical-table residue that ABZ411
//    was correctly removing?

import { loadIncipitsIndex } from "../dist/incipitsIndex.js";
import { findIncipits, isNumericalOnly } from "../dist/findIncipits.js";
import { getFragmentMetadata, getPrimaryGenre } from "../dist/fragmentMetadata.js";

const index = loadIncipitsIndex();
if (!index) {
  console.error("ABORT: incipits index not loaded. Run scripts/build-incipits-index.mjs first.");
  process.exit(1);
}

console.log(`Incipits index loaded: ${index.entries.length} entries, window length ${index.window_length}.`);
console.log("");

// ─── Variant A: production behavior (ABZ480 + ABZ411 numerical filter) ────

console.log("── Variant A: production filter (ABZ480 + ABZ411 ≥70%)");
const variantA = findIncipits({ minHosts: 50, topK: 30, excludeNumericalOnly: true });
console.log(`  candidates_above_threshold=${variantA.index_stats.candidates_above_threshold}  ·  after_filters=${variantA.index_stats.after_filters}  ·  numerical_only_filtered=${variantA.index_stats.numerical_only_filtered}`);
console.log("");

// ─── Variant B: drop ABZ411 from the filter, keep ABZ480-only ─────────────

// Re-implement isNumericalOnly with ABZ480 only:
const ABZ480_ONLY = new Set(["ABZ480"]);
function isAbz480Only(chunkSigns) {
  const tokens = chunkSigns.split(/\s+/).filter((t) => t && t !== "…");
  if (tokens.length === 0) return false;
  let count = 0;
  for (const tok of tokens) if (ABZ480_ONLY.has(tok)) count++;
  return count / tokens.length >= 0.7;
}

// Reproduce findIncipits' core ranking but swap the filter.
function findIncipitsVariantB({ minHosts = 50, topK = 30 } = {}) {
  const candidates = index.entries.filter((e) => e.occurrences.length >= minHosts);
  const afterFilter = candidates.filter((e) => !isAbz480Only(e.signs));
  const numericalDropped = candidates.length - afterFilter.length;

  // Compute novelty per the production scoring:
  // novelty_score = host_genres_spanned * Math.log(1 + host_count)
  const scored = afterFilter.map((e) => {
    const hostGenres = new Set();
    let hostsWithGenre = 0;
    for (const occ of e.occurrences) {
      const g = getPrimaryGenre(getFragmentMetadata(occ.tablet_id));
      if (g) { hostGenres.add(g); hostsWithGenre++; }
    }
    return {
      chunk_hash: e.hash,
      chunk_signs: e.signs,
      host_count: e.occurrences.length,
      host_genres_spanned: hostGenres.size,
      novelty_score: hostGenres.size * Math.log(1 + e.occurrences.length),
      hostsWithGenre,
    };
  });
  scored.sort((a, b) => b.novelty_score - a.novelty_score);
  return {
    incipits: scored.slice(0, topK),
    candidates_above_threshold: candidates.length,
    after_filter: afterFilter.length,
    numerical_dropped: numericalDropped,
  };
}

console.log("── Variant B: relaxed filter (ABZ480-only ≥70%)");
const variantB = findIncipitsVariantB({ minHosts: 50, topK: 30 });
console.log(`  candidates_above_threshold=${variantB.candidates_above_threshold}  ·  after_filter=${variantB.after_filter}  ·  abz480_only_dropped=${variantB.numerical_dropped}`);
console.log("");

// ─── Delta — how many chunks were rescued by relaxing the filter? ─────────

const aHashes = new Set(variantA.incipits.map((p) => p.chunk_hash));
const bHashes = new Set(variantB.incipits.map((p) => p.chunk_hash));
const sameHashes = [...aHashes].filter((h) => bHashes.has(h));
const onlyInA = variantA.incipits.filter((p) => !bHashes.has(p.chunk_hash));
const onlyInB = variantB.incipits.filter((p) => !aHashes.has(p.chunk_hash));

console.log(`── Delta in top-30`);
console.log(`  same in both:   ${sameHashes.length}/30`);
console.log(`  only in A (current):  ${onlyInA.length}`);
console.log(`  only in B (relaxed):  ${onlyInB.length}`);
console.log("");

console.log("── Only-in-B chunks (newly admitted by removing ABZ411 from the filter):");
console.log("    If these look like real incipits, the v0.21 filter was over-aggressive.");
console.log("    If they look like ABZ411-heavy numerical-table residue, the filter was right.");
console.log("");
for (const [i, c] of onlyInB.entries()) {
  const abz411Count = c.chunk_signs.split(/\s+/).filter((t) => t === "ABZ411").length;
  const totalSigns = c.chunk_signs.split(/\s+/).filter((t) => t && t !== "…").length;
  const abz411Pct = ((abz411Count / totalSigns) * 100).toFixed(0);
  console.log(`  ${i + 1}. host_count=${c.host_count}  genres=${c.host_genres_spanned}  novelty=${c.novelty_score.toFixed(2)}  ABZ411=${abz411Count}/${totalSigns} (${abz411Pct}%)`);
  console.log(`     signs: ${c.chunk_signs.slice(0, 100)}${c.chunk_signs.length > 100 ? "…" : ""}`);
}

// ─── Verdict ──────────────────────────────────────────────────────────────

console.log("");
console.log("══════════════════════════════════════════════════════════════════════");
const newAdmits = onlyInB.length;
const meaningfulNewAdmits = onlyInB.filter((c) => {
  // Heuristic: chunks where ABZ411 is dominant (≥50%) are likely numerical-residue
  // even if not pure ABZ411+ABZ480; chunks where ABZ411 is mixed with diverse signs
  // are likely real incipits that share ABZ411 incidentally.
  const tokens = c.chunk_signs.split(/\s+/).filter((t) => t && t !== "…");
  if (tokens.length === 0) return false;
  const abz411Count = tokens.filter((t) => t === "ABZ411").length;
  return abz411Count / tokens.length < 0.5;
}).length;
if (newAdmits === 0) {
  console.log("VERDICT: no top-30 chunks were rescued — the v0.21 filter and ABZ480-only");
  console.log("filter agree on the top-30 at this corpus state. The ABZ480/ABZ411");
  console.log("falsification (cosine=0.097) doesn't translate into observable v0.21");
  console.log("top-30 differences. The filter MAY still be over-aggressive at lower");
  console.log("rankings; consider a top-100 re-audit.");
} else {
  console.log(`VERDICT: ${newAdmits} chunks rescued at top-30. Of these,`);
  console.log(`${meaningfulNewAdmits} are <50% ABZ411 (likely real incipits, not numerical-table`);
  console.log(`residue). If meaningfulNewAdmits > 0, the v0.21 filter is over-aggressive`);
  console.log(`and should be relaxed to ABZ480-only. Recorded as v0.23.1 finding.`);
}
console.log("══════════════════════════════════════════════════════════════════════");
