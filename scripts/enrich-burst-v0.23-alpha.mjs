#!/usr/bin/env node
// v0.23.0-alpha metadata enrichment burst — second pass.
//
// v0.20-alpha covered the 8 active prefixes (K, BM, Sm, Rm, IM, VAT, CBS, ND).
// This second pass enriches everything else with ≥50 tablets per prefix:
// U / YBC / HS / NBC / N / NCBT / GCBC / Ni / Rm-II / MLC / UM / F / DT / W /
// Um / ISACM-A / Bab / SU-1952 / SU-1951 / Si / AO / Ashm-1924 / Ashm-1923 /
// Rm-IV / UET-6 + the long tail under 50. ~8.7K tablets expected, ~30 min
// wall-clock at polite 5-concurrency.
//
// Resumable: skips already-cached entries (positive or negative).

import { getAllTabletRecords } from "../dist/anomalySurface.js";
import { enrichFragmentMetadata, metadataCoverage, isInCache } from "../dist/fragmentMetadata.js";

const ALREADY_COVERED_PREFIXES = ["K.", "BM.", "Sm.", "Rm.", "IM.", "VAT.", "CBS.", "ND."];
const BATCH_SIZE = 50;
const CONCURRENCY = 5;

const allRecs = getAllTabletRecords();
if (!allRecs) {
  console.error("ABORT: anomaly index not loaded");
  process.exit(1);
}

const startedAt = Date.now();
const initialCoverage = metadataCoverage();
console.log(`v0.23-alpha second-pass enrichment — starting ${new Date().toISOString()}`);
console.log(`Initial coverage: ${initialCoverage.total_entries_in_cache} cached (${initialCoverage.total_with_metadata} with data, ${initialCoverage.total_null} 404)`);
console.log("");

// Group uncached tablets by their canonical prefix (the slug before the first '.' or ',').
const uncachedByPrefix = new Map();
for (const r of allRecs) {
  if (ALREADY_COVERED_PREFIXES.some((p) => r.id.startsWith(p))) continue;
  if (isInCache(r.id)) continue;
  const m = r.id.match(/^([A-Za-z][A-Za-z0-9._-]*?)[.,]/);
  if (!m) continue;
  const prefix = m[1] + (r.id[m[1].length] === "," ? "," : ".");
  if (!uncachedByPrefix.has(prefix)) uncachedByPrefix.set(prefix, []);
  uncachedByPrefix.get(prefix).push(r.id);
}

const prefixes = [...uncachedByPrefix.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`Prefixes to enrich: ${prefixes.length}`);
let totalTablets = 0;
for (const [_, ids] of prefixes) totalTablets += ids.length;
console.log(`Total tablets to enrich: ${totalTablets}`);
console.log("");

let grandTotal = { fetched: 0, null404: 0, failed: 0 };

for (const [prefix, ids] of prefixes) {
  console.log(`── ${prefix.padEnd(14)} · ${ids.length} uncached`);

  let processed = 0;
  let prefixFetched = 0, prefixNull = 0, prefixFailed = 0;
  const prefixStart = Date.now();

  while (processed < ids.length) {
    const batch = ids.slice(processed, processed + BATCH_SIZE);
    const result = await enrichFragmentMetadata({
      ids: batch,
      concurrency: CONCURRENCY,
      maxToFetch: BATCH_SIZE,
      prefixLabel: prefix,
    });
    processed += batch.length;
    prefixFetched += result.newly_fetched;
    prefixNull += result.newly_null_404;
    prefixFailed += result.newly_failed;

    if (ids.length >= 100) {
      const pct = ((processed / ids.length) * 100).toFixed(0);
      const elapsedSec = ((Date.now() - prefixStart) / 1000).toFixed(0);
      process.stdout.write(`\r   progress ${pct}% (${processed}/${ids.length}) · +${prefixFetched} ✓ +${prefixNull} 404 +${prefixFailed} fail · ${elapsedSec}s    `);
    }
  }
  if (ids.length >= 100) console.log("");
  else console.log(`   done — +${prefixFetched} ✓ +${prefixNull} 404 +${prefixFailed} fail`);

  grandTotal.fetched += prefixFetched;
  grandTotal.null404 += prefixNull;
  grandTotal.failed += prefixFailed;
}

const finalCoverage = metadataCoverage();
const elapsedMin = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
console.log("");
console.log("══════════════════════════════════════════════════════════════════════");
console.log(`Second-pass burst complete — ${elapsedMin} minutes elapsed`);
console.log(`Fetched: +${grandTotal.fetched} new metadata records`);
console.log(`404 (cached as null): +${grandTotal.null404}`);
console.log(`Network failures: +${grandTotal.failed}`);
console.log("");
console.log(`Coverage delta:`);
console.log(`  before: ${initialCoverage.total_entries_in_cache} cached  (${initialCoverage.total_with_metadata} with data)`);
console.log(`  after:  ${finalCoverage.total_entries_in_cache} cached  (${finalCoverage.total_with_metadata} with data)`);
console.log(`  delta:  +${finalCoverage.total_entries_in_cache - initialCoverage.total_entries_in_cache} entries`);
console.log("══════════════════════════════════════════════════════════════════════");
