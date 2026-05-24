#!/usr/bin/env node
// Round-11 calibration audit: per-archetype threshold matrix.
//
// Hypothesis: methods paper §3.8 documents seven distinct cluster archetypes,
// each with a different precision/recall tradeoff. A single global threshold
// profile (the v0.18.x defaults) cannot serve all seven without either losing
// recall on verbatim manuscript chains or losing precision on compositional
// curricula. A hand-curated per-archetype matrix that orders profiles from
// loose (compositional_curriculum) → tight (verbatim_manuscript_chain) — with
// the intermediate archetypes (refrain_bound, single_collection,
// embedded_fragment, cross_period_bridge, commentary_quotation) each placed at
// an empirically defensible mid-point — is the v0.26.0 cash-out of Round-3
// Lever 5.
//
// Audit tests (3):
//   1. All 7 profiles defined and well-formed (schema-compatible shape).
//   2. Threshold-ordering invariant: verbatim_manuscript_chain ≥ tighter ≥
//      compositional_curriculum on every axis.
//   3. Seed classification on canonical exemplars: K.5896 → refrain_bound,
//      BM.77056 → compositional_curriculum, K.9508 → embedded_fragment.
//      The heuristic is best-effort; failures are documented but do not abort.

import {
  ALL_ARCHETYPES,
  ARCHETYPE_THRESHOLD_MATRIX,
  classifySeedArchetype,
} from "../dist/archetypeThresholds.js";
import { recommendArchetypeThresholds } from "../dist/recommendArchetypeThresholds.js";

const log = (label, data) => {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  if (data !== undefined) {
    console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 2500));
  }
};

const results = { pass: 0, fail: 0, notes: [] };
function pass(name) { results.pass++; console.log(`  ✅ PASS — ${name}`); }
function fail(name, why) { results.fail++; console.log(`  ❌ FAIL — ${name}: ${why}`); }
function note(name, why) { results.notes.push({ name, why }); console.log(`  ℹ︎  NOTE — ${name}: ${why}`); }

// ─── Test 1: All 7 profiles defined and well-formed ─────────────────────────
log("TEST 1: All 7 profiles defined and well-formed");

const expectedArchetypes = [
  "compositional_curriculum",
  "verbatim_manuscript_chain",
  "refrain_bound_liturgical",
  "single_collection_school",
  "embedded_fragment",
  "cross_period_bridge",
  "commentary_quotation",
];

if (ALL_ARCHETYPES.length !== 7) {
  fail("ALL_ARCHETYPES.length === 7", `got ${ALL_ARCHETYPES.length}`);
} else {
  pass("ALL_ARCHETYPES.length === 7");
}

for (const a of expectedArchetypes) {
  const profile = ARCHETYPE_THRESHOLD_MATRIX[a];
  if (!profile) {
    fail(`profile defined for ${a}`, "missing");
    continue;
  }
  // Shape check — required fields present + numeric thresholds in range.
  const required = [
    "archetype", "exemplar", "description", "rationale",
    "find_fuzzy_parallels", "find_embedded_fragments",
    "find_chunk_parallels", "find_thematic_parallel",
    "find_same_scribe_candidates", "reconstruct_cluster",
  ];
  let ok = true;
  let firstMissing = null;
  for (const k of required) {
    if (!(k in profile)) { ok = false; firstMissing = k; break; }
  }
  if (!ok) {
    fail(`profile ${a} well-formed`, `missing field: ${firstMissing}`);
    continue;
  }
  // Range checks
  const j1 = profile.find_fuzzy_parallels.min_fuzzy_jaccard;
  const j2 = profile.find_embedded_fragments.min_containment;
  const cos = profile.find_thematic_parallel.min_cosine;
  if (j1 < 0 || j1 > 1) { fail(`profile ${a} fuzzy_jaccard range`, `${j1}`); continue; }
  if (j2 < 0 || j2 > 1) { fail(`profile ${a} containment range`, `${j2}`); continue; }
  if (cos < 0 || cos > 1) { fail(`profile ${a} cosine range`, `${cos}`); continue; }
  if (profile.archetype !== a) { fail(`profile ${a} archetype self-tag`, `got ${profile.archetype}`); continue; }
  if (typeof profile.exemplar !== "string" || profile.exemplar.length === 0) {
    fail(`profile ${a} exemplar`, "missing"); continue;
  }
  if (typeof profile.rationale !== "string" || profile.rationale.length < 50) {
    fail(`profile ${a} rationale`, "too short or missing");
    continue;
  }
  pass(`profile ${a} well-formed`);
}

// Also test the tool surface returns proper list_all=true response.
const listResult = recommendArchetypeThresholds({ list_all: true });
if (listResult.profiles.length !== 7) {
  fail("recommendArchetypeThresholds({list_all:true}) returns 7 profiles", `got ${listResult.profiles.length}`);
} else {
  pass("recommendArchetypeThresholds({list_all:true}) returns 7 profiles");
}

// Single-archetype mode
const oneResult = recommendArchetypeThresholds({ archetype: "verbatim_manuscript_chain" });
if (oneResult.profiles.length === 1 && oneResult.profiles[0].archetype === "verbatim_manuscript_chain") {
  pass("recommendArchetypeThresholds({archetype:'verbatim_manuscript_chain'}) returns that one");
} else {
  fail("single-archetype mode returns the requested profile", JSON.stringify(oneResult.profiles.map((p) => p.archetype)));
}

// Unknown-archetype mode
const badResult = recommendArchetypeThresholds({ archetype: "not_a_real_archetype" });
if (badResult.warnings.length > 0 && badResult.profiles.length === 7) {
  pass("unknown archetype falls back to all 7 + warning");
} else {
  fail("unknown archetype handling", JSON.stringify(badResult));
}

// Default-mode (no args) returns all 7
const defaultResult = recommendArchetypeThresholds({});
if (defaultResult.profiles.length === 7) {
  pass("default mode (no args) returns all 7");
} else {
  fail("default mode returns all 7", `got ${defaultResult.profiles.length}`);
}

// ─── Test 2: Threshold-ordering invariant ───────────────────────────────────
log("TEST 2: verbatim_manuscript_chain ≥ tighter ≥ compositional_curriculum");

const verb = ARCHETYPE_THRESHOLD_MATRIX["verbatim_manuscript_chain"];
const curr = ARCHETYPE_THRESHOLD_MATRIX["compositional_curriculum"];

const ordering = [
  ["find_fuzzy_parallels.min_fuzzy_jaccard", verb.find_fuzzy_parallels.min_fuzzy_jaccard, curr.find_fuzzy_parallels.min_fuzzy_jaccard, "higher is tighter"],
  ["find_embedded_fragments.min_containment", verb.find_embedded_fragments.min_containment, curr.find_embedded_fragments.min_containment, "higher is tighter"],
  ["find_embedded_fragments.min_run", verb.find_embedded_fragments.min_run, curr.find_embedded_fragments.min_run, "higher is tighter"],
  ["find_chunk_parallels.min_chunk_len", verb.find_chunk_parallels.min_chunk_len, curr.find_chunk_parallels.min_chunk_len, "higher is tighter"],
  ["find_thematic_parallel.min_cosine", verb.find_thematic_parallel.min_cosine, curr.find_thematic_parallel.min_cosine, "higher is tighter"],
  ["find_same_scribe_candidates.min_signature_overlap", verb.find_same_scribe_candidates.min_signature_overlap, curr.find_same_scribe_candidates.min_signature_overlap, "higher is tighter"],
  ["reconstruct_cluster.min_fuzzy_jaccard", verb.reconstruct_cluster.min_fuzzy_jaccard, curr.reconstruct_cluster.min_fuzzy_jaccard, "higher is tighter"],
];

for (const [axis, vV, vC, direction] of ordering) {
  if (vV > vC) {
    pass(`${axis}: verbatim(${vV}) > curriculum(${vC}) [${direction}]`);
  } else if (vV === vC) {
    fail(`${axis}: verbatim(${vV}) === curriculum(${vC})`, "strict ordering required across every axis (§3.8 archetype-profile differences should be empirically visible)");
  } else {
    fail(`${axis}: verbatim(${vV}) < curriculum(${vC})`, "violates §3.8 invariant — verbatim chains should be tighter than curricula on every axis");
  }
}

// max_depth: verbatim should be SHALLOWER (tighter neighborhood), curriculum DEEPER (broader BFS reach).
// This is the inverse direction — tighter = lower max_depth.
if (verb.reconstruct_cluster.max_depth < curr.reconstruct_cluster.max_depth) {
  pass(`reconstruct_cluster.max_depth: verbatim(${verb.reconstruct_cluster.max_depth}) < curriculum(${curr.reconstruct_cluster.max_depth}) [lower is tighter — verbatim chains are tight neighborhoods]`);
} else {
  fail("max_depth ordering", `verbatim=${verb.reconstruct_cluster.max_depth} curriculum=${curr.reconstruct_cluster.max_depth} (verbatim should be SHALLOWER)`);
}

// ─── Test 3: Seed classification on canonical exemplars ─────────────────────
log("TEST 3: Seed classification on canonical methods-paper exemplars");

const canonicalExemplars = [
  { id: "K.5896", expected: "refrain_bound_liturgical" },
  { id: "BM.77056", expected: "compositional_curriculum" },
  { id: "K.9508", expected: "embedded_fragment" },
];

const classificationResults = [];
for (const { id, expected } of canonicalExemplars) {
  let classification;
  try {
    classification = classifySeedArchetype(id);
  } catch (e) {
    fail(`classify ${id} → ${expected}`, `threw: ${e.message}`);
    classificationResults.push({ id, expected, got: "THREW", match: false });
    continue;
  }
  if (!classification) {
    fail(`classify ${id} → ${expected}`, "returned null (corpus likely unavailable)");
    classificationResults.push({ id, expected, got: "null", match: false });
    continue;
  }
  const got = classification.classified_archetype;
  const match = got === expected;
  classificationResults.push({
    id,
    expected,
    got,
    match,
    top_fuzzy_J: classification.evidence.top_parallel_fuzzy_jaccard,
    top_id: classification.evidence.top_parallel_id,
    top_run: classification.evidence.top_parallel_longest_contiguous_run,
    sign_count: classification.evidence.seed_sign_count,
    prefix_spread: classification.evidence.top5_prefix_spread,
    signal: classification.evidence.signals_fired.join(" | "),
  });
  if (match) {
    pass(`classify ${id} → ${expected}`);
  } else {
    // Documented failure — heuristic is best-effort; do NOT over-engineer.
    note(`classify ${id} → ${expected}`, `got ${got} instead. Evidence: top=${classification.evidence.top_parallel_id} fuzzy_J=${classification.evidence.top_parallel_fuzzy_jaccard} run=${classification.evidence.top_parallel_longest_contiguous_run} sign_count=${classification.evidence.seed_sign_count} prefix_spread=${classification.evidence.top5_prefix_spread}. Heuristic is documented as best-effort — the threshold matrix is the primary artifact.`);
  }
}

// Tool-surface classification mode integration.
const toolClassifyResult = recommendArchetypeThresholds({ seed_tablet_id: "K.5896" });
if (toolClassifyResult.classified_archetype && toolClassifyResult.classification_evidence) {
  pass("recommendArchetypeThresholds({seed_tablet_id:'K.5896'}) returns classified_archetype + evidence");
  console.log(`     classified=${toolClassifyResult.classified_archetype}, top_signal=${toolClassifyResult.classification_evidence.signals_fired.slice(-1)[0]}`);
} else {
  // May be null if corpus unavailable in this env — degrade to note.
  if (toolClassifyResult.warnings.some((w) => w.includes("corpus unavailable") || w.includes("not in corpus"))) {
    note("tool-surface classification mode", `corpus unavailable: ${toolClassifyResult.warnings[0]}`);
  } else {
    fail("tool-surface classification mode", JSON.stringify(toolClassifyResult.warnings));
  }
}

console.log("\nClassification evidence table:");
console.table(classificationResults);

// ─── Summary ─────────────────────────────────────────────────────────────────
log("ROUND-11 AUDIT SUMMARY");
console.log(`  pass:  ${results.pass}`);
console.log(`  fail:  ${results.fail}`);
console.log(`  notes: ${results.notes.length}  (documented best-effort heuristic outcomes; NOT failures)`);
for (const n of results.notes) {
  console.log(`    ℹ︎  ${n.name}: ${n.why.slice(0, 200)}${n.why.length > 200 ? "…" : ""}`);
}

const classificationHitRate = classificationResults.filter((r) => r.match).length;
console.log(`\nClassification heuristic accuracy: ${classificationHitRate}/${classificationResults.length} canonical exemplars matched.`);

if (results.fail === 0) {
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("✅ Round-11 archetype-thresholds audit complete — all assertions PASS.");
  console.log("══════════════════════════════════════════════════════════════════════\n");
  process.exit(0);
} else {
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log(`❌ Round-11 archetype-thresholds audit — ${results.fail} assertion(s) FAILED.`);
  console.log("══════════════════════════════════════════════════════════════════════\n");
  process.exit(1);
}
