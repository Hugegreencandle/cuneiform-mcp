#!/usr/bin/env node
// v0.24.0-alpha enrichment burst — third pass, accession-number tablets.
//
// The v0.20-alpha and v0.23-alpha bursts both used a regex that only
// matched IDs starting with a letter prefix (^[A-Za-z]…). That regex
// missed the BM accession-number tablets (1879,xxxx / 1880,xxxx /
// 1881,xxxx / etc.) — IDs that start with a 4-digit year. The v0.21
// find_incipits audit specifically flagged these as un-resolved hosts
// dropping into the top results with [?] genre. ~1,774 IDs total,
// dominated by year prefixes 1880 (463) / 1881 (341) / 1883 (154) /
// 1879 (135) / 1882 (130) / 1876 (102) / 2024 (102, modern accessions)
// / 1884 (81) / 2023 (77) / 1889 (64) / 1891 (50).
//
// Resumable: skips already-cached entries.

import { getAllTabletRecords } from "../dist/anomalySurface.js";
import { enrichFragmentMetadata, metadataCoverage, isInCache } from "../dist/fragmentMetadata.js";

const BATCH_SIZE = 50;
const CONCURRENCY = 5;

const allRecs = getAllTabletRecords();
if (!allRecs) {
  console.error("ABORT: anomaly index not loaded");
  process.exit(1);
}

const startedAt = Date.now();
const initialCoverage = metadataCoverage();
console.log(`v0.24-alpha accession-number enrichment — starting ${new Date().toISOString()}`);
console.log(`Initial coverage: ${initialCoverage.total_entries_in_cache} cached (${initialCoverage.total_with_metadata} with data, ${initialCoverage.total_null} 404)`);
console.log("");

// Group uncached tablets that DON'T match the v0.20/v0.23 alpha regex by their
// numeric year-prefix (or "OTHER" for non-year-prefixed IDs).
const uncachedByPrefix = new Map();
for (const r of allRecs) {
  if (isInCache(r.id)) continue;
  if (r.id.match(/^[A-Za-z]/)) continue; // letter-prefixed IDs handled by alpha-1 + alpha-2
  const m = r.id.match(/^([0-9]{4})[,.]/);
  const prefix = m ? `${m[1]},` : "OTHER";
  if (!uncachedByPrefix.has(prefix)) uncachedByPrefix.set(prefix, []);
  uncachedByPrefix.get(prefix).push(r.id);
}

const prefixes = [...uncachedByPrefix.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`Numeric-year prefixes (+ OTHER) to enrich: ${prefixes.length}`);
let totalTablets = 0;
for (const [_, ids] of prefixes) totalTablets += ids.length;
console.log(`Total tablets to enrich: ${totalTablets}`);
console.log("");

let grandTotal = { fetched: 0, null404: 0, failed: 0 };

for (const [prefix, ids] of prefixes) {
  console.log(`── ${prefix.padEnd(10)} · ${ids.length} uncached`);

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
console.log(`Third-pass burst complete — ${elapsedMin} minutes elapsed`);
console.log(`Fetched: +${grandTotal.fetched} new metadata records`);
console.log(`404 (cached as null): +${grandTotal.null404}`);
console.log(`Network failures: +${grandTotal.failed}`);
console.log("");
console.log(`Coverage delta:`);
console.log(`  before: ${initialCoverage.total_entries_in_cache} cached  (${initialCoverage.total_with_metadata} with data)`);
console.log(`  after:  ${finalCoverage.total_entries_in_cache} cached  (${finalCoverage.total_with_metadata} with data)`);
console.log(`  delta:  +${finalCoverage.total_entries_in_cache - initialCoverage.total_entries_in_cache} entries`);
console.log("══════════════════════════════════════════════════════════════════════");
