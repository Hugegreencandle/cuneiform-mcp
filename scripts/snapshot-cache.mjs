#!/usr/bin/env node
// v0.63.0 — Snapshot the cuneiform-mcp cache dir to a content-hash manifest.
//
// Usage:
//   node scripts/snapshot-cache.mjs <out.json>            (snapshot default cache dir)
//   node scripts/snapshot-cache.mjs <out.json> <cacheDir> (override cache dir)
//
// Output is a JSON file matching the CacheManifest shape in src/corpusDiff.ts.
// Pair with diff_corpus_versions to compute deltas between two snapshots.

import { writeFileSync } from "node:fs";
import { snapshotCache } from "../dist/corpusDiff.js";

const outPath = process.argv[2];
if (!outPath) {
  console.error("Usage: node scripts/snapshot-cache.mjs <out.json> [cacheDir]");
  process.exit(2);
}
const cacheDirArg = process.argv[3];

const { manifest, warnings } = snapshotCache(
  cacheDirArg ? { cacheDir: cacheDirArg } : undefined,
);

writeFileSync(outPath, JSON.stringify(manifest, null, 2));

const sizeBytes = manifest.files.reduce((s, f) => s + f.size_bytes, 0);
const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);

console.log(`Manifest written: ${outPath}`);
console.log(`  cache_dir:   ${manifest.cache_dir}`);
console.log(`  generated:   ${manifest.generated_at}`);
console.log(`  files:       ${manifest.files.length}`);
console.log(`  total size:  ${sizeMb} MiB`);
if (warnings.length > 0) {
  console.log(`  warnings:    ${warnings.length}`);
  for (const w of warnings.slice(0, 5)) console.log(`    - ${w}`);
  if (warnings.length > 5) console.log(`    ... and ${warnings.length - 5} more`);
}
