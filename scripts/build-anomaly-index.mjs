#!/usr/bin/env node
// cuneiform-mcp v0.16.0 — build anomaly-index.json.
//
// Joins the four inputs the anomaly-surface tools need into a single
// runtime-ready file:
//   1. corpus-viz graph.json — lexical neighbors + component_ids
//   2. tablet-neighbors.json — thematic neighbors (v0.15)
//   3. tabletMetadata.json   — period/genre/city/designation
//   4. all-signs-full.json   — per-tablet sign token count (for filtering shorts)
//
// Computes per-tablet:
//   - lex_count (edges in lexical graph)
//   - lex_max_jaccard
//   - them_count (neighbors with cos ≥ 0.5 in embedding graph)
//   - them_max_cos
//   - component_id (corpus-viz connected component)
//   - sign_count (non-X token count)
//
// Computes per-component:
//   - size
//   - dominant_genre / dominant_genre_share
//   - dominant_period / dominant_period_share
//
// Output: ~/.cache/cuneiform-mcp/anomaly-index.json (~5-10 MB JSON).
//
// Rebuild whenever corpus-viz, v0.15 embeddings, or tabletMetadata change.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const REPO_DIR = join(homedir(), "Desktop", "cuneiform-mcp");
const CORPUS_VIZ_GRAPH = process.env.CORPUS_VIZ_GRAPH || join(homedir(), "Desktop", "corpus-viz", "graph.json");
const NEIGHBORS_PATH = join(CACHE_DIR, "tablet-neighbors.json");
const METADATA_PATH = join(REPO_DIR, "data", "tabletMetadata.json");
const SIGNS_CACHE = join(CACHE_DIR, "all-signs-full.json");
const EXCLUSIONS_PATH = join(REPO_DIR, "data", "corpus-exclusions.json");
const OUT_PATH = join(CACHE_DIR, "anomaly-index.json");

const MIN_THEM_COSINE = 0.5; // count thematic neighbors above this threshold

console.error("cuneiform-mcp build-anomaly-index v0.16.0");
console.error(`  corpus-viz graph: ${CORPUS_VIZ_GRAPH}`);
console.error(`  v0.15 neighbors:  ${NEIGHBORS_PATH}`);
console.error(`  metadata:         ${METADATA_PATH}`);
console.error(`  signs cache:      ${SIGNS_CACHE}`);
console.error(`  min thematic cos: ${MIN_THEM_COSINE}`);
console.error("");

// ─── Verify inputs ─────────────────────────────────────────────────────────

for (const p of [CORPUS_VIZ_GRAPH, NEIGHBORS_PATH, SIGNS_CACHE]) {
  if (!existsSync(p)) {
    console.error(`✘ required input not found: ${p}`);
    if (p === NEIGHBORS_PATH) console.error("  Run: node scripts/build-embeddings.mjs");
    if (p === CORPUS_VIZ_GRAPH) console.error("  Run: cd ~/Desktop/corpus-viz && node build-graph.mjs");
    process.exit(1);
  }
}

// ─── Load corpus-viz graph ─────────────────────────────────────────────────

console.error("Loading corpus-viz graph.json...");
const t0 = Date.now();
const lexGraph = JSON.parse(readFileSync(CORPUS_VIZ_GRAPH, "utf-8"));
console.error(`  ${lexGraph.nodes.length} nodes · ${lexGraph.edges.length} edges · ${lexGraph._meta.total_components} components (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// Build lookup: id → {lex_count, lex_max_jaccard, component_id}
const lexById = new Map();
for (const n of lexGraph.nodes) {
  lexById.set(n.id, { lex_count: 0, lex_max_jaccard: 0, component_id: n.component });
}
for (const e of lexGraph.edges) {
  const a = lexById.get(e.source);
  const b = lexById.get(e.target);
  if (a) {
    a.lex_count++;
    if (e.score > a.lex_max_jaccard) a.lex_max_jaccard = e.score;
  }
  if (b) {
    b.lex_count++;
    if (e.score > b.lex_max_jaccard) b.lex_max_jaccard = e.score;
  }
}

// ─── Load v0.15 thematic neighbors ─────────────────────────────────────────

console.error("Loading v0.15 tablet-neighbors.json...");
const t1 = Date.now();
const themRaw = JSON.parse(readFileSync(NEIGHBORS_PATH, "utf-8"));
console.error(`  ${Object.keys(themRaw.neighbors).length} tablets in embedding index (${((Date.now() - t1) / 1000).toFixed(1)}s)`);

const themById = new Map();
for (const [id, list] of Object.entries(themRaw.neighbors)) {
  let count = 0, maxCos = -1;
  for (const n of list) {
    if (n.score >= MIN_THEM_COSINE) count++;
    if (n.score > maxCos) maxCos = n.score;
  }
  themById.set(id, { them_count: count, them_max_cos: maxCos, them_total: list.length });
}

// ─── Load metadata ─────────────────────────────────────────────────────────

console.error("Loading tabletMetadata.json...");
const metaById = new Map();
if (existsSync(METADATA_PATH)) {
  try {
    const m = JSON.parse(readFileSync(METADATA_PATH, "utf-8"));
    for (const [id, info] of Object.entries(m.tablets ?? {})) metaById.set(id, info);
    console.error(`  ${metaById.size} tablets with period/genre metadata`);
  } catch (e) {
    console.error(`  ⚠ metadata load failed: ${e.message}`);
  }
} else {
  console.error("  (no metadata file — period/genre filters will not work)");
}

// ─── Load exclusions ──────────────────────────────────────────────────────

const excluded = new Set();
if (existsSync(EXCLUSIONS_PATH)) {
  try {
    const ex = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
    for (const r of ex.excluded_records ?? []) excluded.add(r.id);
    console.error(`  ${excluded.size} excluded prototypes (v0.14.4)`);
  } catch {}
}

// ─── Sign counts from all-signs-full.json ──────────────────────────────────

console.error("");
console.error("Computing per-tablet sign counts (filtering X)...");
const t2 = Date.now();
const records = JSON.parse(readFileSync(SIGNS_CACHE, "utf-8"));
const signCountById = new Map();
for (const r of records) {
  if (!r._id || typeof r.signs !== "string") continue;
  if (excluded.has(r._id)) continue;
  let n = 0;
  for (const line of r.signs.split(/\r?\n/)) {
    for (const t of line.trim().split(/\s+/).filter(Boolean)) {
      if (t !== "X") n++;
    }
  }
  signCountById.set(r._id, n);
}
console.error(`  ${signCountById.size} tablets sign-counted (${((Date.now() - t2) / 1000).toFixed(1)}s)`);

// ─── Build unified per-tablet records ──────────────────────────────────────

console.error("");
console.error("Joining per-tablet records...");
const allIds = new Set([
  ...lexById.keys(),
  ...themById.keys(),
  ...signCountById.keys(),
]);

const tablets = [];
for (const id of allIds) {
  if (excluded.has(id)) continue;
  const lex = lexById.get(id);
  const them = themById.get(id);
  const meta = metaById.get(id);
  const signCount = signCountById.get(id) ?? 0;
  tablets.push({
    id,
    lex_count: lex?.lex_count ?? null,
    lex_max_jaccard: lex ? +lex.lex_max_jaccard.toFixed(4) : null,
    component_id: lex?.component_id ?? null,
    them_count: them?.them_count ?? null,
    them_max_cos: them ? +them.them_max_cos.toFixed(4) : null,
    them_total: them?.them_total ?? null,
    sign_count: signCount,
    period: meta?.period ?? null,
    genre: meta?.genre ?? null,
    city: meta?.city ?? null,
    designation: meta?.designation ?? null,
    in_lex_graph: !!lex,
    in_them_index: !!them,
  });
}
console.error(`  ${tablets.length} unified records (${tablets.filter((t) => t.in_lex_graph && t.in_them_index).length} in both indices)`);

// ─── Per-component aggregates ──────────────────────────────────────────────

console.error("");
console.error("Computing per-component genre/period dominants...");
const compStats = new Map(); // comp_id → { size, genre: Map<g, count>, period: Map<p, count> }
for (const t of tablets) {
  if (t.component_id == null) continue;
  if (!compStats.has(t.component_id)) {
    compStats.set(t.component_id, { size: 0, genre: new Map(), period: new Map() });
  }
  const c = compStats.get(t.component_id);
  c.size++;
  if (t.genre) c.genre.set(t.genre, (c.genre.get(t.genre) ?? 0) + 1);
  if (t.period) c.period.set(t.period, (c.period.get(t.period) ?? 0) + 1);
}

const components = {};
for (const [cid, s] of compStats) {
  let domG = null, domGShare = 0;
  for (const [g, c] of s.genre) {
    const share = c / s.size;
    if (share > domGShare) { domG = g; domGShare = share; }
  }
  let domP = null, domPShare = 0;
  for (const [p, c] of s.period) {
    const share = c / s.size;
    if (share > domPShare) { domP = p; domPShare = share; }
  }
  components[cid] = {
    size: s.size,
    ...(domG ? { dominant_genre: domG, dominant_genre_share: +domGShare.toFixed(3) } : {}),
    ...(domP ? { dominant_period: domP, dominant_period_share: +domPShare.toFixed(3) } : {}),
  };
}
console.error(`  ${Object.keys(components).length} components annotated`);

// ─── Top-level stats ───────────────────────────────────────────────────────

const totalLex = tablets.filter((t) => t.in_lex_graph).length;
const totalThem = tablets.filter((t) => t.in_them_index).length;
const totalBoth = tablets.filter((t) => t.in_lex_graph && t.in_them_index).length;
const lexSingletons = tablets.filter((t) => t.in_lex_graph && t.lex_count === 0).length;
const themOrphans = tablets.filter((t) => t.in_them_index && (t.them_max_cos ?? 1) < 0.6).length;
const biOrphans = tablets.filter(
  (t) => t.in_lex_graph && t.in_them_index && t.lex_count === 0 && (t.them_max_cos ?? 1) < 0.6,
).length;

console.error("");
console.error("Top-level stats:");
console.error(`  total tablets considered:        ${tablets.length}`);
console.error(`  in lexical graph:                ${totalLex}`);
console.error(`  in thematic embedding index:     ${totalThem}`);
console.error(`  in BOTH (intersect):             ${totalBoth}`);
console.error(`  lexical singletons:              ${lexSingletons}`);
console.error(`  thematic orphans (max_cos<0.6):  ${themOrphans}`);
console.error(`  BI-ORPHANS (both):               ${biOrphans}`);

// Length-bucketed bi-orphans
const buckets = { "100-300": [0, 0], "300-1000": [0, 0], "1000+": [0, 0] };
for (const t of tablets) {
  if (!t.in_lex_graph || !t.in_them_index) continue;
  let bucket = null;
  if (t.sign_count >= 100 && t.sign_count < 300) bucket = "100-300";
  else if (t.sign_count >= 300 && t.sign_count < 1000) bucket = "300-1000";
  else if (t.sign_count >= 1000) bucket = "1000+";
  if (!bucket) continue;
  buckets[bucket][1]++;
  if (t.lex_count === 0 && (t.them_max_cos ?? 1) < 0.6) buckets[bucket][0]++;
}
console.error("");
console.error("Bi-orphans by length:");
for (const [k, [bi, tot]] of Object.entries(buckets)) {
  console.error(`  ${k.padEnd(10)} ${bi}/${tot}`);
}

// ─── Write output ──────────────────────────────────────────────────────────

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
const _meta = {
  version: "0.16.0",
  generated_at: new Date().toISOString(),
  config: { MIN_THEM_COSINE },
  inputs: {
    corpus_viz_graph: CORPUS_VIZ_GRAPH,
    neighbors_path: NEIGHBORS_PATH,
    metadata_path: METADATA_PATH,
    exclusions_path: EXCLUSIONS_PATH,
  },
  totals: {
    tablets: tablets.length,
    in_lex_graph: totalLex,
    in_them_index: totalThem,
    in_both: totalBoth,
    lex_singletons: lexSingletons,
    them_orphans_max_cos_lt_06: themOrphans,
    bi_orphans: biOrphans,
    length_buckets: buckets,
  },
};
writeFileSync(OUT_PATH, JSON.stringify({ _meta, tablets, components }));
console.error("");
console.error(`✓ wrote ${OUT_PATH}`);
console.error(`  file size: ${((JSON.stringify({ _meta, tablets, components }).length) / 1024 / 1024).toFixed(1)} MB`);
