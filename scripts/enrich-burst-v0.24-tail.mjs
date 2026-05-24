#!/usr/bin/env node
// v0.24-tail enrichment burst — comprehensive cleanup.
//
// Iterates every tablet in the anomaly index, enriches whichever ones
// remain uncached after the v0.20-alpha + v0.23-alpha + v0.24-alpha
// bursts. Catches: (a) network-failure residue from prior bursts
// (~177 expected: 104 from v0.20-alpha + 73 from v0.23-alpha), (b)
// anything missed by both letter-prefix and numeric-year-prefix
// regexes, (c) any odd-format IDs (Ist-B., Tarsus., etc.) that
// were already covered but with unusual patterns.

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
console.log(`v0.24-tail enrichment burst — starting ${new Date().toISOString()}`);
console.log(`Initial coverage: ${initialCoverage.total_entries_in_cache} cached (${initialCoverage.total_with_metadata} with data, ${initialCoverage.total_null} 404)`);

const uncached = allRecs.filter((r) => !isInCache(r.id)).map((r) => r.id);
console.log(`Uncached IDs remaining: ${uncached.length}`);
console.log("");

if (uncached.length === 0) {
  console.log("Nothing to enrich — exiting cleanly.");
  process.exit(0);
}

let processed = 0;
let fetched = 0, null404 = 0, failed = 0;

while (processed < uncached.length) {
  const batch = uncached.slice(processed, processed + BATCH_SIZE);
  const result = await enrichFragmentMetadata({
    ids: batch,
    concurrency: CONCURRENCY,
    maxToFetch: BATCH_SIZE,
    prefixLabel: "tail-cleanup",
  });
  processed += batch.length;
  fetched += result.newly_fetched;
  null404 += result.newly_null_404;
  failed += result.newly_failed;
  const pct = ((processed / uncached.length) * 100).toFixed(0);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
  process.stdout.write(`\r   progress ${pct}% (${processed}/${uncached.length}) · +${fetched} ✓ +${null404} 404 +${failed} fail · ${elapsedSec}s    `);
}
console.log("");

const finalCoverage = metadataCoverage();
const elapsedMin = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
console.log("");
console.log("══════════════════════════════════════════════════════════════════════");
console.log(`Tail-cleanup burst complete — ${elapsedMin} minutes elapsed`);
console.log(`Fetched: +${fetched}  ·  404: +${null404}  ·  failed: +${failed}`);
console.log(`Coverage: ${initialCoverage.total_entries_in_cache} → ${finalCoverage.total_entries_in_cache} (+${finalCoverage.total_entries_in_cache - initialCoverage.total_entries_in_cache})`);
console.log("══════════════════════════════════════════════════════════════════════");
