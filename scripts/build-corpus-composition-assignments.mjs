#!/usr/bin/env node
// v0.54 — Corpus-wide composition-assignment scan.
//
// Runs identify_composition (v0.32) on the top-N chunk-host tablets (or
// a user-specified target list) and writes a comprehensive assignment
// table to ~/.cache/cuneiform-mcp/composition-assignments.json.
//
// Output drives:
//   - docs/DISCOVERED-EXEMPLARS-v0.54.md (registry-expansion candidates)
//   - downstream tools that need fast composition-assignment lookup
//   - candidate positives for the validation-resolutions store

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { identifyComposition } from "../dist/identifyComposition.js";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const OUT_PATH = join(CACHE_DIR, "composition-assignments.json");

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

// ─── Pick target tablet list ───────────────────────────────────────────────

const TOP_N = parseInt(process.env.COMPOSITION_ASSIGN_N ?? "300", 10);

let targets;
if (process.env.COMPOSITION_ASSIGN_TARGETS) {
  targets = process.env.COMPOSITION_ASSIGN_TARGETS.split(/[,\s]+/).filter(Boolean);
  console.log(`Targets from env: ${targets.length} tablets`);
} else {
  console.log(`Selecting top-${TOP_N} chunk-host tablets...`);
  const chunkIdx = JSON.parse(readFileSync(join(CACHE_DIR, "chunk-index.json"), "utf-8"));
  const hostCount = new Map();
  for (const entry of chunkIdx.entries) {
    for (const occ of entry.occurrences) {
      hostCount.set(occ.tablet_id, (hostCount.get(occ.tablet_id) ?? 0) + 1);
    }
  }
  targets = Array.from(hostCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id]) => id);
  console.log(`Selected ${targets.length} (host count range: ${hostCount.get(targets[0])} → ${hostCount.get(targets[targets.length - 1])})`);
}

console.log(``);

// ─── Run identify_composition on each ──────────────────────────────────────

const assignments = {};
const startTime = Date.now();
let processed = 0;
let withTopResult = 0;
let highConfidence = 0;

for (const tabletId of targets) {
  processed++;
  if (processed % 25 === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stderr.write(`  ${processed}/${targets.length}  (${elapsed}s, ${(elapsed / processed * 1000).toFixed(0)}ms/tablet)\n`);
  }
  try {
    const r = identifyComposition({ tabletId, topK: 3 });
    const top = r.candidates[0];
    if (top) {
      withTopResult++;
      if (top.confidence > 0.9) highConfidence++;
      assignments[tabletId] = {
        top_composition_id: top.composition_id,
        top_composition_name: top.composition_name,
        composition_type: top.composition_type,
        confidence: top.confidence,
        is_in_exemplar_list: top.evidence?.query_in_exemplar_list ?? false,
        period: r.query.period,
        primary_genre: r.query.primary_genre,
        sign_count: r.query.sign_count,
        top_2_alternatives: r.candidates.slice(1, 3).map((c) => ({
          composition_id: c.composition_id,
          confidence: c.confidence,
        })),
      };
    }
  } catch (e) {
    // Skip
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(``);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`Corpus composition-assignment scan complete:`);
console.log(`  targets processed:  ${processed}`);
console.log(`  with assignment:    ${withTopResult}`);
console.log(`  high confidence (>0.9): ${highConfidence}`);
console.log(`  elapsed:            ${elapsed}s`);

const out = {
  version: "1.0.0",
  built_at: new Date().toISOString(),
  source: "v0.32 identify_composition over top-N chunk-host tablets",
  build_stats: {
    targets_processed: processed,
    with_assignment: withTopResult,
    high_confidence_count: highConfidence,
    elapsed_seconds: parseFloat(elapsed),
  },
  assignments,
};

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`Wrote ${Object.keys(assignments).length} assignments to ${OUT_PATH}`);
