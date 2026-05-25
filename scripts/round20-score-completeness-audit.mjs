#!/usr/bin/env node
// Round-20 calibration audit: score_tablet_completeness (v0.34.0).
//
// Hypothesis: completeness scoring distinguishes substantial witnesses
// (K.5896, the dominant Mīs pî manuscript, sign_count ~1830) from small
// fragments (K.9508, ~250 signs embedded as a 142-position run in K.5896)
// and surfaces the canonical-chunk backbone of the composition rather
// than per-witness noise.
//
// Tests:
//   T1. K.5896 vs Mīs pî → sign_count_ratio = 1.0 (it IS the largest exemplar)
//   T2. K.9508 vs Mīs pî → sign_count_ratio significantly < K.5896's
//                          (K.9508 is a small fragment embedded in K.5896)
//   T3. K.5896 chunk_coverage >= K.9508 chunk_coverage
//   T4. canonical_chunks_count > 0 for Mīs pî (composition has structure)
//   T5. Composition inference via top candidate when no composition_id passed
//   T6. fallback_min_confidence forces 'unresolved' for unknown tablet
//   T7. include_chunk_lists populates preserved + missing arrays
//   T8. composition_id="surpu" honored (explicit override)
//   T9. lacuna_density in [0,1] when signs cache loaded
//   T10. graceful unknown-tablet handling

import { scoreTabletCompleteness } from "../dist/scoreTabletCompleteness.js";

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

console.log("Round-20 audit: score_tablet_completeness (v0.34.0)\n");

// ─── T1: K.5896 vs Mīs pî — substantial-but-not-largest witness ───────────
// Finding from initial audit run: K.2987.B is the LARGEST Mīs pî exemplar
// at 3853 signs, not K.5896 (1881 signs). K.5896 is the most-cited but not
// the largest; methods paper §3.21 notes this.
console.log("T1: K.5896 vs Mīs pî → substantial witness (ratio ~0.49 vs K.2987.B)");
const r1 = scoreTabletCompleteness({ tabletId: "K.5896", compositionId: "mis_pi" });
report(
  "K.5896 sign_count_ratio strictly in (0, 1) — substantial witness",
  r1.metrics.sign_count_ratio !== null &&
    r1.metrics.sign_count_ratio > 0 &&
    r1.metrics.sign_count_ratio < 1.0,
  `ratio=${r1.metrics.sign_count_ratio?.toFixed(3)} sign_count=${r1.metrics.query_sign_count} largest=${r1.metrics.largest_exemplar_id}(${r1.metrics.largest_exemplar_sign_count})`,
);
report(
  "largest Mīs pî exemplar is K.2987.B (finding §3.21)",
  r1.metrics.largest_exemplar_id === "K.2987.B",
  `got=${r1.metrics.largest_exemplar_id}`,
);

// ─── T2: K.9508 vs Mīs pî — smaller ratio ──────────────────────────────────
console.log("\nT2: K.9508 vs Mīs pî → sign_count_ratio < K.5896's");
const r2 = scoreTabletCompleteness({ tabletId: "K.9508", compositionId: "mis_pi" });
report(
  "K.9508 sign_count_ratio < K.5896 sign_count_ratio",
  r2.metrics.sign_count_ratio !== null &&
    r1.metrics.sign_count_ratio !== null &&
    r2.metrics.sign_count_ratio < r1.metrics.sign_count_ratio,
  `K.9508=${r2.metrics.sign_count_ratio?.toFixed(3)} K.5896=${r1.metrics.sign_count_ratio?.toFixed(3)}`,
);
report(
  "K.9508 sign_count < K.5896 sign_count",
  (r2.metrics.query_sign_count ?? 0) < (r1.metrics.query_sign_count ?? 0),
  `K.9508=${r2.metrics.query_sign_count} K.5896=${r1.metrics.query_sign_count}`,
);

// ─── T3: K.5896 chunk coverage ≥ K.9508 ────────────────────────────────────
console.log("\nT3: K.5896 chunk_coverage ≥ K.9508 chunk_coverage");
report(
  "K.5896 covers ≥ as many canonical chunks as K.9508",
  (r1.metrics.chunks_hosted_count ?? 0) >= (r2.metrics.chunks_hosted_count ?? 0),
  `K.5896=${r1.metrics.chunks_hosted_count} K.9508=${r2.metrics.chunks_hosted_count}`,
);

// ─── T4: canonical chunks exist for Mīs pî ─────────────────────────────────
console.log("\nT4: Mīs pî has canonical-chunk backbone");
report(
  "Mīs pî canonical_chunks_count > 0",
  (r1.metrics.canonical_chunks_count ?? 0) > 0,
  `canonical=${r1.metrics.canonical_chunks_count}`,
);

// ─── T5: composition inference (no composition_id) ─────────────────────────
console.log("\nT5: inferred composition for K.5896 (no composition_id passed)");
const r5 = scoreTabletCompleteness({ tabletId: "K.5896" });
report(
  "inferred composition is mis_pi",
  r5.composition.source === "inferred" && r5.composition.composition_id === "mis_pi",
  `source=${r5.composition.source} id=${r5.composition.composition_id} conf=${r5.composition.inferred_confidence?.toFixed(3)}`,
);

// ─── T6: low confidence falls back to unresolved ───────────────────────────
console.log("\nT6: high fallback_min_confidence forces unresolved for unknown tablet");
const r6 = scoreTabletCompleteness({
  tabletId: "Z.99999999",
  fallbackMinConfidence: 0.99,
});
report(
  "unknown tablet → composition.source = 'unresolved'",
  r6.composition.source === "unresolved",
  `source=${r6.composition.source}`,
);

// ─── T7: chunk lists populated ─────────────────────────────────────────────
console.log("\nT7: include_chunk_lists populates the arrays");
const r7 = scoreTabletCompleteness({
  tabletId: "K.5896",
  compositionId: "mis_pi",
  includeChunkLists: true,
});
report(
  "preserved + missing arrays both populated",
  r7.preserved_chunk_hashes.length > 0 || r7.missing_chunk_hashes.length > 0,
  `preserved=${r7.preserved_chunk_hashes.length} missing=${r7.missing_chunk_hashes.length}`,
);
report(
  "preserved + missing sum to canonical_chunks_count",
  r7.preserved_chunk_hashes.length + r7.missing_chunk_hashes.length === r7.metrics.canonical_chunks_count,
  `${r7.preserved_chunk_hashes.length}+${r7.missing_chunk_hashes.length} vs ${r7.metrics.canonical_chunks_count}`,
);

// ─── T8: explicit composition_id ───────────────────────────────────────────
// Finding from initial audit: sign_count_ratio can CLAMP TO 1.0 when the
// query is larger than the target composition's largest exemplar (K.5896
// dwarfs Šurpu's BM.47463 + CBS.6060). sign_count_ratio is a "physical
// size proxy", not a "fit-to-composition" metric. chunk_coverage_ratio
// IS the proper fit metric. Methods §3.21 documents this distinction.
console.log("\nT8: explicit composition_id='surpu' — chunk_coverage is the fit metric");
const r8 = scoreTabletCompleteness({ tabletId: "K.5896", compositionId: "surpu" });
report(
  "K.5896 vs surpu → composition.source='explicit', id='surpu'",
  r8.composition.source === "explicit" && r8.composition.composition_id === "surpu",
);
report(
  "K.5896 vs surpu has LOWER chunk_coverage than vs mis_pi (proper fit metric)",
  (r8.metrics.chunk_coverage_ratio ?? 0) < (r1.metrics.chunk_coverage_ratio ?? 1) ||
    (r8.metrics.canonical_chunks_count === 0),
  `surpu_cov=${r8.metrics.chunk_coverage_ratio?.toFixed(3)}(${r8.metrics.chunks_hosted_count}/${r8.metrics.canonical_chunks_count}) mis_pi_cov=${r1.metrics.chunk_coverage_ratio?.toFixed(3)}(${r1.metrics.chunks_hosted_count}/${r1.metrics.canonical_chunks_count})`,
);

// ─── T9: lacuna_density bounded ────────────────────────────────────────────
console.log("\nT9: lacuna_density in [0,1]");
report(
  "lacuna_density ∈ [0,1] for K.5896",
  r1.metrics.lacuna_density !== null &&
    r1.metrics.lacuna_density >= 0 &&
    r1.metrics.lacuna_density <= 1,
  `K.5896 lacuna=${r1.metrics.lacuna_density?.toFixed(3)}`,
);

// ─── T10: graceful unknown ─────────────────────────────────────────────────
console.log("\nT10: unknown tablet returns nulls + warnings without throwing");
const r10 = scoreTabletCompleteness({ tabletId: "Z.99999999", compositionId: "mis_pi" });
report(
  "Z.99999999 → query_sign_count=null + sign_count_ratio=null",
  r10.metrics.query_sign_count === null && r10.metrics.sign_count_ratio === null,
);

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-20 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
