#!/usr/bin/env node
// v0.27 enrichment burst #5 — re-attempt the persistent network failures.
// Most will fail again (likely malformed/non-existent IDs at eBL), but the
// cycle is cheap and catches transient outages.

import { getAllTabletRecords } from "../dist/anomalySurface.js";
import { enrichFragmentMetadata, metadataCoverage, isInCache } from "../dist/fragmentMetadata.js";

const BATCH_SIZE = 50;
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 200; // cap so we don't loop forever

const allRecs = getAllTabletRecords();
const uncached = allRecs.filter((r) => !isInCache(r.id)).map((r) => r.id).slice(0, MAX_ATTEMPTS);
console.log(`v0.27-residue burst — ${uncached.length} uncached IDs (capped at ${MAX_ATTEMPTS})`);

if (uncached.length === 0) { console.log("Nothing to enrich"); process.exit(0); }

const start = Date.now();
const initial = metadataCoverage();
let processed = 0, fetched = 0, null404 = 0, failed = 0;

while (processed < uncached.length) {
  const batch = uncached.slice(processed, processed + BATCH_SIZE);
  const result = await enrichFragmentMetadata({ ids: batch, concurrency: CONCURRENCY, maxToFetch: BATCH_SIZE, prefixLabel: "residue-burst" });
  processed += batch.length;
  fetched += result.newly_fetched;
  null404 += result.newly_null_404;
  failed += result.newly_failed;
}

const final = metadataCoverage();
const elapsed = ((Date.now() - start) / 1000).toFixed(0);
console.log(`Done in ${elapsed}s. Fetched +${fetched} · 404 +${null404} · failed +${failed}`);
console.log(`Cache: ${initial.total_entries_in_cache} → ${final.total_entries_in_cache} (Δ +${final.total_entries_in_cache - initial.total_entries_in_cache})`);
