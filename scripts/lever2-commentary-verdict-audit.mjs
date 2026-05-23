#!/usr/bin/env node
// Round-3 calibration audit, Lever 2: length-aware commentary-verdict classifier.
//
// Hypothesis: compare_tablet_pair classifies BM.47463↔CBS.6060 as
// `physical_join_candidate` (fuzzy_J=0.70, longest_run=147) when eBL's
// lineToVec /match correctly rejects the join — the actual relationship is
// commentary-quotes-base (BM.47463 = Šurpu Commentary, CBS.6060 = Šurpu
// base text). The 147-sign run is commentary quotation, not physical fragment.
//
// Fix candidate: when longest_run ≥ 100 AND one side's eBL genre includes
// "Commentary", verdict downgrades to `commentary_quotes_base_text`.
//
// Negative ground truth: K.2798↔Si.776 (methods-paper §1 anchor, true sibling
// manuscripts, no Commentary genre on either side) must NOT trip the new rule.

import { compareTabletPair } from "../dist/comparePair.js";
import {
  getFragmentMetadata,
  getPrimaryGenre,
  isInCache,
  enrichFragmentMetadata,
} from "../dist/fragmentMetadata.js";

const log = (label, data) => {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 2500));
};

// ─── Ensure metadata for the test set is cached ──────────────────────────────
const testIds = ["BM.47463", "CBS.6060", "K.2798", "Si.776"];
const missing = testIds.filter((id) => !isInCache(id));
if (missing.length > 0) {
  console.log(`\nFetching missing fragment metadata: ${missing.join(", ")}`);
  await enrichFragmentMetadata({ ids: missing, concurrency: 3, maxToFetch: missing.length });
  console.log("Metadata fetch complete.\n");
}

// ─── Test 1: BM.47463 + CBS.6060 metadata ─────────────────────────────────────
log("TEST 1: Metadata for the positive case", "");
for (const id of ["BM.47463", "CBS.6060"]) {
  const m = getFragmentMetadata(id);
  console.log(`\n${id}:`);
  if (!m) {
    console.log("  (no metadata in cache)");
    continue;
  }
  console.log("  primary_genre:", getPrimaryGenre(m));
  console.log("  genres_flat:  ", JSON.stringify(m.genres_flat));
  console.log("  all genres:   ", JSON.stringify(m.genres));
}

// ─── Test 2: K.2798 + Si.776 metadata (negative case) ────────────────────────
log("TEST 2: Metadata for the negative case (K.2798 + Si.776)", "");
for (const id of ["K.2798", "Si.776"]) {
  const m = getFragmentMetadata(id);
  console.log(`\n${id}:`);
  if (!m) { console.log("  (no metadata in cache)"); continue; }
  console.log("  primary_genre:", getPrimaryGenre(m));
  console.log("  genres_flat:  ", JSON.stringify(m.genres_flat));
}

// ─── Test 3: Current compare_tablet_pair verdicts ────────────────────────────
log("TEST 3: Current verdicts (before any fix)", "");

const v1 = compareTabletPair({ tabletA: "BM.47463", tabletB: "CBS.6060" });
console.log("\nBM.47463 ↔ CBS.6060:");
console.log("  primary_relationship:", v1.verdict.primary_relationship);
console.log("  confidence:          ", v1.verdict.confidence);
console.log("  evidence:");
for (const e of v1.verdict.evidence) console.log(`    - ${e}`);
if (v1.axes.fuzzy.status === "found") {
  console.log("  fuzzy values:", JSON.stringify({
    fuzzy_jaccard: v1.axes.fuzzy.values.fuzzy_jaccard,
    longest_contiguous_run: v1.axes.fuzzy.values.longest_contiguous_run,
    exact_jaccard: v1.axes.fuzzy.values.exact_jaccard,
  }));
}

const v2 = compareTabletPair({ tabletA: "K.2798", tabletB: "Si.776" });
console.log("\nK.2798 ↔ Si.776:");
console.log("  primary_relationship:", v2.verdict.primary_relationship);
console.log("  confidence:          ", v2.verdict.confidence);
console.log("  evidence:");
for (const e of v2.verdict.evidence) console.log(`    - ${e}`);
if (v2.axes.fuzzy.status === "found") {
  console.log("  fuzzy values:", JSON.stringify({
    fuzzy_jaccard: v2.axes.fuzzy.values.fuzzy_jaccard,
    longest_contiguous_run: v2.axes.fuzzy.values.longest_contiguous_run,
    exact_jaccard: v2.axes.fuzzy.values.exact_jaccard,
  }));
}

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("✅ Lever 2 decomposition complete.");
console.log("══════════════════════════════════════════════════════════════════════\n");
