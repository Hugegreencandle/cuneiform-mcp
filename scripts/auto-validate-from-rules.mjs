#!/usr/bin/env node
// v0.64.0 — CLI for auto_validate_from_resolutions.
//
// Usage:
//   node scripts/auto-validate-from-rules.mjs            (run with topK=20)
//   node scripts/auto-validate-from-rules.mjs <topK>     (override topK)
//
// PROPOSAL-ONLY. Never mutates ~/.cache/cuneiform-mcp/validation-resolutions.json.

import { autoValidateFromResolutions } from "../dist/autoValidateFromResolutions.js";

const topKArg = process.argv[2];
const topK = topKArg ? Number.parseInt(topKArg, 10) : 20;
if (!Number.isFinite(topK) || topK < 1) {
  console.error(`Usage: node scripts/auto-validate-from-rules.mjs [topK]`);
  process.exit(2);
}

const result = autoValidateFromResolutions({ mode: "propose", topK });

console.log(`Proposal file: ${result.proposal_file_path}`);
console.log(`  Proposals:   ${result.proposals.length} (${result.proposed_positives} positive, ${result.proposed_negatives} negative)`);
console.log(`  Rules:`);
for (const r of result.rules_applied) {
  console.log(`    - ${r.rule_id}: ${r.proposals_generated} proposals  (${r.source_doc})`);
}
console.log(`  Store mtime: ${result.validation_store_mtime_before} -> ${result.validation_store_mtime_after}`);
console.log(`  Mtime unchanged: ${result.validation_store_mtime_unchanged ? "YES (safe)" : "NO (SAFETY VIOLATION)"}`);
if (result.warnings.length > 0) {
  console.log(`  Warnings:`);
  for (const w of result.warnings) console.log(`    - ${w}`);
}
if (!result.validation_store_mtime_unchanged) process.exit(1);
