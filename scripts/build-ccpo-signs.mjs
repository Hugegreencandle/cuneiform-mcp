#!/usr/bin/env node
// cuneiform-mcp — build ~/.cache/cuneiform-mcp/ccpo-signs.json.
//
// Runs the ccpo CDL → eBL all-signs converter (src/oracc/cdl.ts:cdlToAbzSigns)
// over all 205 ccpo editions and writes an array of {_id, signs} — the SAME
// shape as all-signs-full.json — so the chunk-index builder can ingest ccpo
// tablets as first-class corpus members (STAGE B; not wired here).
//
//   _id   = the P-number (corpusjson textid)
//   signs = eBL all-signs string: space-separated ABZ codes per sign, one line
//           per newline, "X" for damage/unmapped.
//
// Map: data/ccpo-abz-map.json (built by scripts/build-ccpo-abz-map.mjs).
// Reads the RUNTIME cache path (CUNEIFORM_MCP_CACHE_DIR or ~/.cache/...).
// Requires `npm run build` first (imports the compiled dist converter).

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { cdlToAbzSigns } from "../dist/oracc/cdl.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "..");
const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const CCPO_CORPUS_DIR = join(CACHE_DIR, "oracc", "ccpo", "corpusjson");
const MAP_PATH = join(REPO_DIR, "data", "ccpo-abz-map.json");
const OUT_PATH = join(CACHE_DIR, "ccpo-signs.json");

console.error("cuneiform-mcp build-ccpo-signs");
console.error(`  ccpo corpus: ${CCPO_CORPUS_DIR}`);
console.error(`  abz map:     ${MAP_PATH}`);
console.error(`  output:      ${OUT_PATH}`);
console.error("");

if (!existsSync(CCPO_CORPUS_DIR)) {
  console.error(`✘ ccpo corpusjson not found: ${CCPO_CORPUS_DIR}`);
  console.error("  Run ensureBundle('ccp') first.");
  process.exit(1);
}
if (!existsSync(MAP_PATH)) {
  console.error(`✘ ccpo-abz-map.json not found: ${MAP_PATH}`);
  console.error("  Run scripts/build-ccpo-abz-map.mjs first.");
  process.exit(1);
}

// ── Load the OGSL-name → ABZ map ────────────────────────────────────────────
const mapDoc = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
const nameToAbz = new Map(Object.entries(mapDoc.map ?? {}));
console.error(`Loaded ${nameToAbz.size} sign-name → ABZ mappings (map v${mapDoc.version}).`);

// ── Convert every edition ───────────────────────────────────────────────────
const files = readdirSync(CCPO_CORPUS_DIR).filter((f) => f.endsWith(".json"));
const members = [];

let totalGraphemes = 0;
let totalDamage = 0;
let totalUnmapped = 0;
let emptySigns = 0;
let droppedNoId = 0;

const agg = {
  direct: 0,
  normalized: 0,
  numeral: 0,
  compoundWhole: 0,
  compoundDecomposed: 0,
};

for (const f of files) {
  const j = JSON.parse(readFileSync(join(CCPO_CORPUS_DIR, f), "utf-8"));
  const { textId, signs, stats } = cdlToAbzSigns(j, nameToAbz);
  const id = textId ?? f.replace(/\.json$/, "");
  if (!id) {
    droppedNoId++;
    continue;
  }
  members.push({ _id: id, signs });
  totalGraphemes += stats.totalGraphemes;
  totalDamage += stats.damage;
  totalUnmapped += stats.unmapped;
  agg.direct += stats.direct;
  agg.normalized += stats.normalized;
  agg.numeral += stats.numeral;
  agg.compoundWhole += stats.compoundWhole;
  agg.compoundDecomposed += stats.compoundDecomposed;
  if (signs.trim().length === 0) emptySigns++;
}

const nonDamage = totalGraphemes - totalDamage;
const resolved = nonDamage - totalUnmapped;
const coverage = nonDamage > 0 ? (100 * resolved) / nonDamage : 0;
const xRate = totalGraphemes > 0 ? (100 * totalDamage) / totalGraphemes : 0;

// ── Write ───────────────────────────────────────────────────────────────────
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(members));

console.error("");
console.error("══════════════════════════════════════════════════════════");
console.error(`ccpo-signs.json built: ${members.length} members`);
console.error(`  total graphemes:        ${totalGraphemes}`);
console.error(`  damage (X):             ${totalDamage} (${xRate.toFixed(1)}%)`);
console.error(`  non-damage:             ${nonDamage}`);
console.error(`  resolved:               ${resolved}`);
console.error(`    direct:               ${agg.direct}`);
console.error(`    @-normalized:         ${agg.normalized}`);
console.error(`    numeral:              ${agg.numeral}`);
console.error(`    compound-whole:       ${agg.compoundWhole}`);
console.error(`    compound-decomposed:  ${agg.compoundDecomposed}`);
console.error(`  unmapped→X:             ${totalUnmapped}`);
console.error(`  NON-DAMAGE COVERAGE:    ${coverage.toFixed(2)}%`);
console.error(`  editions w/ empty signs: ${emptySigns}`);
console.error(`  dropped (no _id):       ${droppedNoId}`);
console.error(`Wrote ${OUT_PATH}`);

// Sanity asserts per the converter spec.
if (members.length !== 205) {
  console.error(`⚠ expected 205 members, got ${members.length}`);
}
if (xRate < 15 || xRate > 21) {
  console.error(`⚠ X-rate ${xRate.toFixed(1)}% outside expected ~17.8% band`);
}
