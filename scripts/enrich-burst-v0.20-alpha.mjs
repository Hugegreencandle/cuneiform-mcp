#!/usr/bin/env node
// v0.20.0-alpha metadata enrichment burst.
//
// Raises fragment-metadata coverage from ~12.77% to ≥30% across the 8 active
// prefixes (K, BM, Sm, Rm, IM, VAT, CBS, ND). Unblocks the Round-5 audit's
// trace_chunk_diffusion + build_citation_graph tests.
//
// Resumable: enrichFragmentMetadata skips already-cached entries (positive or
// negative). Crash mid-run → re-run with no data loss.

import { getAllTabletRecords } from "../dist/anomalySurface.js";
import { enrichFragmentMetadata, metadataCoverage, isInCache } from "../dist/fragmentMetadata.js";

const TARGET_PREFIXES = ["K.", "BM.", "Sm.", "Rm.", "IM.", "VAT.", "CBS.", "ND."];
const BATCH_SIZE = 50;
const CONCURRENCY = 5;

const allRecs = getAllTabletRecords();
if (!allRecs) {
  console.error("ABORT: anomaly index not loaded");
  process.exit(1);
}

const startedAt = Date.now();
const initialCoverage = metadataCoverage();
console.log(`v0.20-alpha enrichment burst — starting ${new Date().toISOString()}`);
console.log(`Initial coverage: ${initialCoverage.total_entries_in_cache} cached (${initialCoverage.total_with_metadata} with data, ${initialCoverage.total_null} 404)`);
console.log(`Target prefixes: ${TARGET_PREFIXES.join(", ")}`);
console.log("");

let grandTotal = { fetched: 0, null404: 0, failed: 0 };

for (const prefix of TARGET_PREFIXES) {
  const matches = allRecs.filter((r) => r.id.startsWith(prefix));
  const uncached = matches.filter((r) => !isInCache(r.id));
  console.log(`── ${prefix.padEnd(6)} · ${matches.length} in corpus, ${uncached.length} uncached`);

  if (uncached.length === 0) {
    console.log(`   skip — fully cached`);
    continue;
  }

  const prefixStart = Date.now();
  let processed = 0;
  let prefixFetched = 0, prefixNull = 0, prefixFailed = 0;

  while (processed < uncached.length) {
    const batch = uncached.slice(processed, processed + BATCH_SIZE).map((r) => r.id);
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

    const pct = ((processed / uncached.length) * 100).toFixed(0);
    const elapsedSec = ((Date.now() - prefixStart) / 1000).toFixed(0);
    process.stdout.write(`\r   progress ${pct}% (${processed}/${uncached.length}) · +${prefixFetched} ✓ +${prefixNull} 404 +${prefixFailed} fail · ${elapsedSec}s    `);
  }
  console.log(""); // newline after progress
  grandTotal.fetched += prefixFetched;
  grandTotal.null404 += prefixNull;
  grandTotal.failed += prefixFailed;
}

const finalCoverage = metadataCoverage();
const elapsedMin = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
console.log("");
console.log("══════════════════════════════════════════════════════════════════════");
console.log(`Burst complete — ${elapsedMin} minutes elapsed`);
console.log(`Fetched: +${grandTotal.fetched} new metadata records`);
console.log(`404 (cached as null): +${grandTotal.null404}`);
console.log(`Network failures: +${grandTotal.failed}`);
console.log("");
console.log(`Coverage delta:`);
console.log(`  before: ${initialCoverage.total_entries_in_cache} cached  (${initialCoverage.total_with_metadata} with data)`);
console.log(`  after:  ${finalCoverage.total_entries_in_cache} cached  (${finalCoverage.total_with_metadata} with data)`);
console.log(`  delta:  +${finalCoverage.total_entries_in_cache - initialCoverage.total_entries_in_cache} entries`);
console.log("══════════════════════════════════════════════════════════════════════");
