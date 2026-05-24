#!/usr/bin/env node
// Demo of v0.18.19 round-3 round tooling on FRESH inputs (not the calibration
// ground-truth set). Validates that the tools generalize beyond their audit
// targets.

import { findEmbeddedFragments, findFuzzyParallels } from "../dist/fuzzyParallels.js";
import { compareTabletPair } from "../dist/comparePair.js";
import { findSignatureEvolutionInLineage } from "../dist/signatureEvolution.js";
import { getAllTabletRecords } from "../dist/anomalySurface.js";

const banner = (s) => console.log(`\n${"═".repeat(72)}\n  ${s}\n${"═".repeat(72)}`);

// ─── 1. find_embedded_fragments on a NEW small-tablet target ─────────────────
banner("DEMO 1: find_embedded_fragments — discover hosts for K.15325");
console.log("K.15325 is a typology-named Mīs pî hub. What's its embedded-fragment surface?");

const k15325 = findEmbeddedFragments({ guestTabletId: "K.15325", topK: 5 });
console.log(`\n  guest_trigrams: ${k15325.index_stats.query_trigram_count}`);
console.log(`  candidates examined: ${k15325.index_stats.candidates_examined}`);
console.log(`  passing host filter (≥5× size): ${k15325.index_stats.candidates_passing_host_filter}`);
console.log(`\n  hosts at default thresholds (containment ≥0.50, run ≥20):`);
for (const m of k15325.matches) {
  console.log(`    ${m.host_tablet_id.padEnd(18)} containment=${m.containment}  run=${m.longest_contiguous_run}  host_size_ratio=${m.host_size_ratio}×`);
}
if (k15325.warnings.length > 0) console.log("  warnings:", k15325.warnings);

// ─── 2. find_embedded_fragments at exploratory recall (no run filter) ────────
banner("DEMO 2: same probe at min_run=0 — shows what the precision filter suppresses");

const k15325Loose = findEmbeddedFragments({
  guestTabletId: "K.15325", topK: 10, minContainment: 0.50, minRun: 0,
});
console.log(`  matches at min_run=0: ${k15325Loose.matches.length}`);
for (const m of k15325Loose.matches.slice(0, 10)) {
  const flag = m.longest_contiguous_run >= 20 ? "✓" : "✗ (suppressed at default)";
  console.log(`    ${m.host_tablet_id.padEnd(18)} containment=${m.containment}  run=${String(m.longest_contiguous_run).padStart(3)}  ${flag}`);
}

// ─── 3. commentary_quotes_base_text on a NEW commentary candidate ───────────
banner("DEMO 3: compare_tablet_pair — sweep for commentary patterns in K.5896's chain");
console.log("Looking for high-fuzzy pairs in K.5896's vicinity, then checking each for commentary verdict.");

// Find K.5896's strongest fuzzy parallels, then check each pair-verdict
const k5896 = findFuzzyParallels({ tabletId: "K.5896", topK: 10, minFuzzyJaccard: 0.30 });
console.log(`\n  K.5896 top-10 fuzzy parallels:`);
const verdicts = [];
for (const p of k5896.parallels) {
  const v = compareTabletPair({ tabletA: "K.5896", tabletB: p.tablet_id });
  verdicts.push({ partner: p.tablet_id, fuzzyJ: p.fuzzy_jaccard, run: p.longest_contiguous_run, verdict: v.verdict.primary_relationship, confidence: v.verdict.confidence });
}
console.table(verdicts);

// ─── 4. signature_evolution at new default (chain=8) on a fresh seed ─────────
banner("DEMO 4: find_signature_evolution_in_lineage at v0.18.19 default — K.15325");
console.log("Defaults: chain=8 (calibrated), depth=3, jump=0.40");

const sig = findSignatureEvolutionInLineage({ seedTabletId: "K.15325" });
console.log(`  chain_size:     ${sig.summary.total_members}`);
console.log(`  total_jumps:    ${sig.summary.total_jumps}`);
console.log(`  mean_to_seed:   ${sig.summary.mean_sig_cosine_to_seed_across_chain?.toFixed(4)}`);
console.log(`  coherence:      ${sig.summary.scribal_coherence_classification}`);
console.log(`\n  chain members:`);
for (const m of sig.chain_with_signatures) {
  console.log(`    d=${m.depth}  ${m.tablet_id.padEnd(18)}  cos_to_seed=${(m.sig_cosine_to_seed ?? 0).toFixed(4)}  ${m.is_jump ? "[JUMP]" : ""}`);
}

// ─── 5. End-to-end discovery — probe a brand-new candidate via 3 axes ───────
banner("DEMO 5: End-to-end — pick a random lex-singleton and probe via all new tools");
const allRecs = getAllTabletRecords();
const target = allRecs.filter((t) => t.in_lex_graph && t.lex_count === 0 && t.sign_count >= 80 && t.sign_count <= 150)[42]; // deterministic
console.log(`  Target: ${target.id} (sign_count=${target.sign_count}, lex_count=0 — symmetric-lexical-isolated)`);

console.log(`\n  → find_fuzzy_parallels (symmetric, baseline):`);
const sym = findFuzzyParallels({ tabletId: target.id, topK: 3, minFuzzyJaccard: 0.10 });
for (const p of sym.parallels) console.log(`      ${p.tablet_id}  fuzzy_J=${p.fuzzy_jaccard}  run=${p.longest_contiguous_run}`);

console.log(`\n  → find_embedded_fragments (asymmetric, NEW v0.18.19):`);
const asym = findEmbeddedFragments({ guestTabletId: target.id, topK: 3 });
for (const m of asym.matches) console.log(`      host=${m.host_tablet_id}  containment=${m.containment}  run=${m.longest_contiguous_run}  size_ratio=${m.host_size_ratio}×`);
if (asym.matches.length === 0) console.log("      (no hosts above default thresholds — genuinely isolated)");

console.log(`\n  → find_signature_evolution_in_lineage (scribal lineage walk):`);
const sigT = findSignatureEvolutionInLineage({ seedTabletId: target.id });
console.log(`      coherence=${sigT.summary.scribal_coherence_classification}  mean=${sigT.summary.mean_sig_cosine_to_seed_across_chain?.toFixed(4)}  jumps=${sigT.summary.total_jumps}`);

console.log(`\n${"═".repeat(72)}\n  ✅ v0.18.19 tooling demo complete.\n${"═".repeat(72)}\n`);
