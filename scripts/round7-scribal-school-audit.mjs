#!/usr/bin/env node
// Round-7 audit: build_scribal_school_graph (v0.22.0).
//
// Hypothesis: joint clustering on (provenance + scribal LLR signature)
// surfaces tablets that BOTH share orthographic-preference fingerprints AND
// were dug up at the same site — i.e., candidate scribal-school clusters
// empirically reconstructed without relying on hand-curated colophon lists.
//
// Test plan:
//   1. Sanity — tool returns ≥1 non-empty school at defaults. Top school has
//      ≥3 members and internal_cohesion ≥ 0.7 (the v0.18.9 corpus-wide
//      "probable same scribe" floor was 0.6, but the school-level expectation
//      is tighter since we're filtering by city too).
//   2. Provenance consistency — when required_shared_provenance=true (the
//      default), every member of every surfaced school shares the same
//      getCity() value. The tool enforces this at edge-construction, so a
//      violation = bug.
//   3. Multi-genre schools surface — at least one of the top-10 schools has
//      members spanning ≥2 distinct primary genres. Indicates the school
//      taught a curriculum (āšipūtu had lexical + omen + magico-medical
//      texts), not just copied one composition over and over.
//
// Tradeoff documentation embedded as audit comments in the OUTPUT (not
// pass/fail gates) — see "design tradeoffs" stanza below.

import { buildScribalSchoolGraph } from "../dist/scribalSchoolGraph.js";
import { scribalIndexStats } from "../dist/scribalFingerprint.js";
import { getFragmentMetadata, getCity } from "../dist/fragmentMetadata.js";

// Mirror the tool's getCityOrCollection fallback: when provenance.site is
// null, fall back to metadata.collection (Kuyunjik / Babylon / Sippar / etc.).
// As of v0.22.0 the eBL metadata cache has 0 entries with provenance.site
// populated and 22425 with collection — collection is the practical signal.
function provenanceOf(metadata) {
  if (!metadata) return null;
  const city = getCity(metadata);
  if (city) return city;
  if (metadata.collection && metadata.collection.length > 0) return metadata.collection;
  return null;
}

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

header("Pre-flight: scribal-index load");
const sigStats = scribalIndexStats();
console.log(JSON.stringify(sigStats, null, 2));
if (!sigStats.loaded) {
  console.error("\nABORT: scribal index not loaded. Pre-build the signs cache first.");
  process.exit(1);
}

// ─── Test 1: Sanity ───────────────────────────────────────────────────────

header("TEST 1: Sanity — defaults return ≥1 school, top has ≥3 members, internal_cohesion ≥ 0.7");

const t0 = Date.now();
const out = buildScribalSchoolGraph({});
const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
console.log(`elapsed wall-clock:                     ${elapsed}s (tool-reported ${out.index_stats.elapsed_seconds}s)`);
console.log(`schools returned:                       ${out.schools.length}`);
console.log(`components_above_size_threshold:        ${out.index_stats.components_above_size_threshold}`);
console.log(`candidates_with_signature_and_city:     ${out.index_stats.candidates_with_signature_and_city}`);
console.log(`candidates_without_city:                ${out.index_stats.candidates_without_city}`);
console.log(`candidates_without_signature:           ${out.index_stats.candidates_without_signature}`);
console.log(`tablets_scanned_for_edges:              ${out.index_stats.tablets_scanned_for_edges}`);
console.log(`edges_collected:                        ${out.index_stats.edges_collected}`);

if (out.warnings.length > 0) {
  console.log(`warnings:`);
  for (const w of out.warnings) console.log(`  · ${w}`);
}

console.log(`\nTop-5 schools preview:`);
for (const [i, school] of out.schools.slice(0, 5).entries()) {
  console.log(`  ${i + 1}. ${school.school_id} — anchor ${school.anchor_tablet}`);
  console.log(`     members=${school.members.length} · provenance=${school.shared_provenance ?? "(multi)"} · cohesion=${school.internal_cohesion} · edges=${school.edge_count}`);
  const periods = school.period_distribution.map(p => `${p.label}×${p.count}`).join(", ");
  const genres = school.genre_distribution.map(g => `${g.label}×${g.count}`).join(", ");
  console.log(`     period_dist:  ${periods}`);
  console.log(`     genre_dist:   ${genres}`);
}

let sanityPass = true;
let sanityDetail = "";
if (out.schools.length === 0) {
  sanityPass = false;
  sanityDetail = "tool returned no schools at defaults";
} else {
  const top = out.schools[0];
  if (top.members.length < 3) {
    sanityPass = false;
    sanityDetail = `top school has only ${top.members.length} members (≥3 required)`;
  } else if (top.internal_cohesion < 0.7) {
    sanityPass = false;
    sanityDetail = `top school internal_cohesion=${top.internal_cohesion} (≥0.7 required)`;
  } else {
    sanityDetail = `top: ${top.members.length} members, cohesion=${top.internal_cohesion}, provenance=${top.shared_provenance}`;
  }
}
report(
  "defaults produce a non-empty top school with ≥3 members and cohesion ≥ 0.7",
  sanityPass,
  sanityDetail,
);

// Wall-clock perf is reported but NOT a pass/fail gate — the task spec
// explicitly says: "if the pairwise comparison is too expensive, document
// the bottleneck ... propose a v0.22.1 optimization (don't try to optimize
// during initial build)." See "Design tradeoffs" stanza below for the
// bottleneck attribution + the proposed optimization.
const elapsedSec = parseFloat(elapsed);
console.log(`\n[ℹ] wall-clock perf: ${elapsedSec}s at max_tablets_to_scan=1500 (target: <30s).`);
if (elapsedSec >= 30) {
  console.log(`    ↑ exceeds <30s soft target. Bottleneck attributed in design tradeoffs (#4) — proposed v0.22.1 optimization documented there. Set max_tablets_to_scan=800 to land under 30s with reduced school coverage.`);
}

// ─── Test 2: Provenance consistency ──────────────────────────────────────

header("TEST 2: Every member of every school shares getCity() when required_shared_provenance=true");

let violations = 0;
let totalChecked = 0;
const violationDetails = [];
for (const school of out.schools) {
  const cities = new Set();
  for (const m of school.members) {
    totalChecked++;
    const md = getFragmentMetadata(m.tablet_id);
    const city = provenanceOf(md);
    cities.add(city ?? "(null)");
  }
  if (cities.size > 1) {
    violations++;
    violationDetails.push(`${school.school_id}: cities=${JSON.stringify([...cities])}`);
  }
  // Also assert shared_provenance is non-null (since required_shared_provenance defaulted true)
  if (school.shared_provenance === null && cities.size === 1) {
    violations++;
    violationDetails.push(`${school.school_id}: members agree on ${[...cities][0]} but shared_provenance was null`);
  }
}
console.log(`schools checked:    ${out.schools.length}`);
console.log(`members checked:    ${totalChecked}`);
console.log(`violations:         ${violations}`);
if (violations > 0) {
  console.log(`details:`);
  for (const d of violationDetails) console.log(`  · ${d}`);
}
report(
  "every member of every school shares the same getCity() value (required_shared_provenance=true)",
  violations === 0,
  `${violations} violations across ${out.schools.length} schools / ${totalChecked} members`,
);

// ─── Test 3: Multi-genre schools surface ────────────────────────────────

header("TEST 3: ≥1 of the top-10 schools spans ≥2 distinct primary genres (curriculum signal)");

const top10 = out.schools.slice(0, 10);
let multiGenreCount = 0;
const multiGenreSamples = [];
for (const school of top10) {
  // Count distinct NON-null genre labels
  const distinctGenres = school.genre_distribution
    .filter(g => g.label && g.label !== "(unknown)")
    .length;
  if (distinctGenres >= 2) {
    multiGenreCount++;
    if (multiGenreSamples.length < 5) {
      multiGenreSamples.push({
        school_id: school.school_id,
        anchor: school.anchor_tablet,
        members: school.members.length,
        genres: school.genre_distribution.map(g => `${g.label}×${g.count}`).join(", "),
      });
    }
  }
}
console.log(`top-10 schools with ≥2 distinct non-null genres: ${multiGenreCount}`);
if (multiGenreSamples.length > 0) {
  console.log(`\nMulti-genre school samples:`);
  for (const s of multiGenreSamples) {
    console.log(`  · ${s.school_id} (anchor ${s.anchor}, ${s.members} members)`);
    console.log(`      genres: ${s.genres}`);
  }
}
report(
  "≥1 of the top-10 schools spans ≥2 distinct primary genres",
  multiGenreCount >= 1,
  `${multiGenreCount}/10 top schools span ≥2 genres (≥1 required). NOTE: if fragment-metadata coverage is thin for a city, many genres will be '(unknown)' and the test will fail spuriously — enrich metadata for that city to recover.`,
);

// ─── Design tradeoffs (informational, not a gate) ───────────────────────

header("Design tradeoffs (informational)");
console.log(`
1. Clustering: CONNECTED COMPONENTS on a thresholded scribal graph.
   - Pro: parameter-free given the cosine threshold; no k to pick.
   - Con: coarse — a single bridge edge merges otherwise-distinct sub-schools.
     Alternative would be spectral / k-means on signature embeddings, but
     those require choosing k (the very thing we're trying to discover).
2. Provenance requirement: STRICT by default.
   - Pro: emits high-confidence candidates only; cities act as a prior.
   - Con: many eBL tablets have null/uncertain provenance — see
     candidates_without_city in index_stats. Users can flip
     required_shared_provenance=false to widen the universe, but cluster
     interpretation becomes ambiguous (could be modern collection artifacts
     rather than ancient scribal-school co-training).
3. Inferential leap: "shared LLR fingerprint + shared find-spot" → "scribal
   school". This is a candidacy signal, not a discovery. The audit DOES NOT
   claim historical scribal-school identification — only that surfaced
   clusters are CANDIDATES for downstream philological evaluation
   (colophon-name overlap, dated rituals, archaeological context).
4. Performance: tool-reported elapsed = ${out.index_stats.elapsed_seconds}s at defaults
   (max_tablets_to_scan=1500). Dominant cost is the per-seed
   findSameScribeCandidates call, which is O(corpus size). v0.22.1
   optimization candidate: pre-cache a same-scribe candidate lookup keyed
   by tablet_id (current call recomputes for every seed). For full-corpus
   passes (~3000+ city-attested tablets), expect 2-5 minutes.
`);

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(`Round-7 audit summary: ${results.filter((r) => r.pass).length}/${results.length} passed`);
console.log(`══════════════════════════════════════════════════════════════════════\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log("");

if (results.some((r) => !r.pass)) process.exit(2);
