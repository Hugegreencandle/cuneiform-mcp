#!/usr/bin/env node
// v0.47 — Seed ~/.cache/cuneiform-mcp/validation-resolutions.json with the
// 12 methods-paper hardcoded positives + 30 synthetic negatives.
//
// Synthetic negatives are pairs where:
//   - Both tablets are in the chunk-index (so the v0.29 features can fire)
//   - Periods differ (cross-period signal)
//   - Zero chunk-overlap (definitionally no sub-tablet sibling relationship)
//   - Neither tablet appears in any composition exemplar list (panel
//     refinement: avoid mislabeling two Mīs pî witnesses as negatives just
//     because eBL hasn't fully transliterated them — the registry is the
//     authoritative same-composition signal)
//   - Not already a registered positive pair
//
// Deterministic via mulberry32(20260525). Same seed as the train script
// ensures reproducibility across re-runs.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const STORE_PATH = join(CACHE_DIR, "validation-resolutions.json");
const RNG_SEED = 20260525;
const N_SYNTHETIC_NEGATIVES = 30;
const TOOL_VERSION = "0.47.0";

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

// ─── Methods-paper hardcoded positives (mirror train-joint-pair-model.mjs) ─

const POSITIVE_PAIRS = [
  { a: "K.5896", b: "K.9508", note: "Mīs pî sibling, §3.7.3", section: "§3.7.3" },
  { a: "K.5896", b: "K.6683", note: "v0.22 stemma sister, §3.11", section: "§3.11" },
  { a: "K.5896", b: "BM.45749", note: "Mīs pî sibling, §3.7.3", section: "§3.7.3" },
  { a: "K.5896", b: "K.2987.B", note: "Mīs pî sibling", section: "§3.7.3" },
  { a: "K.5896", b: "K.163", note: "Mīs pî sibling", section: "§3.7.3" },
  { a: "K.5896", b: "K.2550", note: "Mīs pî sibling", section: "§3.7.3" },
  { a: "BM.47463", b: "CBS.6060", note: "Šurpu commentary/base, §3.7.1", section: "§3.7.1" },
  { a: "K.2798", b: "Si.776", note: "canonical false-negative-rescue case, §1", section: "§1" },
  { a: "K.3306", b: "K.6685", note: "v0.19 chunk-discovery sister, §3.6 amendment", section: "§3.6" },
  { a: "BM.77056", b: "K.5896", note: "āšipūtu curriculum cluster, §3.1", section: "§3.1" },
  { a: "BM.77056", b: "BM.45749", note: "āšipūtu curriculum", section: "§3.1" },
  { a: "Sm.1055", b: "K.7246", note: "Udug-ḫul chain, §3.7.2", section: "§3.7.2" },
];

// ─── Load registry to exclude same-composition pairs from negatives ───────

function loadRegistry() {
  // Resolve registry from data/ directory relative to this script.
  const here = dirname(fileURLToPath(import.meta.url));
  const dataPath = join(here, "..", "data", "compositions-v1.json");
  if (!existsSync(dataPath)) {
    throw new Error(`composition registry not found at ${dataPath}`);
  }
  const data = JSON.parse(readFileSync(dataPath, "utf-8"));
  return data.compositions ?? [];
}

const registry = loadRegistry();
// Build: tablet_id → set of composition_ids it appears in (exemplar)
const tabletToCompositions = new Map();
for (const comp of registry) {
  for (const tablet of comp.exemplar_tablets ?? []) {
    if (!tabletToCompositions.has(tablet)) tabletToCompositions.set(tablet, new Set());
    tabletToCompositions.get(tablet).add(comp.id);
  }
}

function sharesAnyComposition(a, b) {
  const ca = tabletToCompositions.get(a);
  const cb = tabletToCompositions.get(b);
  if (!ca || !cb) return false;
  for (const c of ca) {
    if (cb.has(c)) return true;
  }
  return false;
}

// ─── Load chunk index for negative sampling ────────────────────────────────

const chunkIndexPath = join(CACHE_DIR, "chunk-index.json");
if (!existsSync(chunkIndexPath)) {
  console.error(`ABORT: chunk-index.json missing — needed for negative sampling`);
  process.exit(1);
}
const chunkIndex = JSON.parse(readFileSync(chunkIndexPath, "utf-8"));

// Build chunk-host adjacency: tablet_id → Set<co-host tablet_id>
const cohostAdj = new Map();
for (const entry of chunkIndex.entries) {
  const occs = entry.occurrences.map((o) => o.tablet_id);
  for (const a of occs) {
    if (!cohostAdj.has(a)) cohostAdj.set(a, new Set());
    const setA = cohostAdj.get(a);
    for (const b of occs) {
      if (a !== b) setA.add(b);
    }
  }
}

// All tablets in chunk index
const allChunkTablets = Array.from(cohostAdj.keys());
console.log(`Chunk index: ${allChunkTablets.length} tablets`);

// Load fragment metadata for period info
const metaPath = join(CACHE_DIR, "fragment-metadata.json");
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf-8")) : {};

function getPeriod(tabletId) {
  const m = meta[tabletId];
  if (!m) return null;
  if (typeof m.script === "string") return m.script;
  return m.script?.period ?? null;
}

// ─── Mulberry32 ────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Canonical pair_id (matches src/validationResolutions.ts) ─────────────

function canonicalPairId(a, b) {
  const [x, y] = [a, b].sort();
  return `${x}↔${y}`;
}

// ─── Load existing store + merge ───────────────────────────────────────────

let store = {
  schema_version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  resolutions: [],
  stats: {
    n_total: 0,
    n_positive: 0,
    n_negative: 0,
    n_uncertain: 0,
    n_by_source: { validation_queue: 0, user_manual: 0, methods_paper: 0, audit_resolution: 0 },
    progress_to_v1_target: 0,
    v1_target_positives: 100,
    bootstrap_positives_from_methods_paper: 12,
  },
};

if (existsSync(STORE_PATH)) {
  const existing = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  store = existing;
  console.log(`Merging with existing store: ${store.resolutions.length} resolutions already present`);
}

const existingPairIds = new Set(store.resolutions.map((r) => r.pair_id));

// ─── B1: Seed methods-paper positives ──────────────────────────────────────

const now = new Date().toISOString();
let positivesAdded = 0;
for (const p of POSITIVE_PAIRS) {
  const pid = canonicalPairId(p.a, p.b);
  if (existingPairIds.has(pid)) continue;
  const [aSorted, bSorted] = [p.a, p.b].sort();
  store.resolutions.push({
    pair_id: pid,
    tablet_a: aSorted,
    tablet_b: bSorted,
    verdict: "positive",
    rationale: p.note,
    recorded_at: now,
    recorded_by: "scripts/seed-validation-resolutions.mjs v0.47.0",
    source: "methods_paper",
    methods_paper_section: p.section,
    tool_version: TOOL_VERSION,
  });
  existingPairIds.add(pid);
  positivesAdded++;
}
console.log(`Positives added: ${positivesAdded} (${POSITIVE_PAIRS.length} total candidates, ${POSITIVE_PAIRS.length - positivesAdded} skipped as duplicates)`);

// ─── B2: Generate synthetic negatives ──────────────────────────────────────

const rng = mulberry32(RNG_SEED);
let negativesAdded = 0;
let attempts = 0;
const MAX_ATTEMPTS = N_SYNTHETIC_NEGATIVES * 200;

while (negativesAdded < N_SYNTHETIC_NEGATIVES && attempts < MAX_ATTEMPTS) {
  attempts++;
  const i = Math.floor(rng() * allChunkTablets.length);
  const j = Math.floor(rng() * allChunkTablets.length);
  if (i === j) continue;
  const a = allChunkTablets[i];
  const b = allChunkTablets[j];

  // Filter: distinct periods
  const pa = getPeriod(a);
  const pb = getPeriod(b);
  if (!pa || !pb) continue;
  if (pa === pb) continue;

  // Filter: zero chunk-overlap (b is not in a's cohost set)
  const cohosts = cohostAdj.get(a);
  if (!cohosts || cohosts.has(b)) continue;

  // Filter: not same composition per registry
  if (sharesAnyComposition(a, b)) continue;

  // Filter: not already in store
  const pid = canonicalPairId(a, b);
  if (existingPairIds.has(pid)) continue;

  const [aSorted, bSorted] = [a, b].sort();
  store.resolutions.push({
    pair_id: pid,
    tablet_a: aSorted,
    tablet_b: bSorted,
    verdict: "negative",
    rationale: `synthetic_negative: zero chunk-overlap, distinct periods (${pa} ≠ ${pb}), not same-composition per registry v1.0.0`,
    recorded_at: now,
    recorded_by: "scripts/seed-validation-resolutions.mjs v0.47.0",
    source: "audit_resolution",
    methods_paper_section: null,
    tool_version: TOOL_VERSION,
  });
  existingPairIds.add(pid);
  negativesAdded++;
}
console.log(`Negatives added: ${negativesAdded} (${attempts} attempts)`);

// ─── Recompute stats ───────────────────────────────────────────────────────

let pos = 0, neg = 0, unc = 0;
const bySource = { validation_queue: 0, user_manual: 0, methods_paper: 0, audit_resolution: 0 };
for (const r of store.resolutions) {
  if (r.verdict === "positive") pos++;
  else if (r.verdict === "negative") neg++;
  else unc++;
  bySource[r.source] = (bySource[r.source] ?? 0) + 1;
}
store.stats = {
  n_total: store.resolutions.length,
  n_positive: pos,
  n_negative: neg,
  n_uncertain: unc,
  n_by_source: bySource,
  progress_to_v1_target: Math.min(1, (pos + 12) / 100),
  v1_target_positives: 100,
  bootstrap_positives_from_methods_paper: 12,
};
store.updated_at = now;

writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
console.log(``);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`Seeded validation-resolutions store: ${STORE_PATH}`);
console.log(`  Total resolutions:       ${store.resolutions.length}`);
console.log(`  Positives:               ${pos}`);
console.log(`  Negatives:               ${neg}`);
console.log(`  By source:               ${JSON.stringify(bySource)}`);
console.log(`  v1.0 progress:           ${(store.stats.progress_to_v1_target * 100).toFixed(1)}%`);
console.log(`══════════════════════════════════════════════════════════`);
