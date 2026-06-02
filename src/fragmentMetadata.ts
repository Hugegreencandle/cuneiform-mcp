// v0.18.13 — Fragment-metadata accessor + batch enrichment.
//
// Bridges the gap between the anomaly-index (36K+ tablets with sign_count
// + structural fields but period/genre/city/designation ALL NULL) and the
// on-demand eBL /fragments/{museum_number} API (which returns the rich
// metadata: period via script.period, genres array, provenance.site for
// city, designation string).
//
// The cache lives at ~/.cache/cuneiform-mcp/fragment-metadata.json with
// shape: { [museum_number]: FragmentMetadata | null } — a map keyed by
// museum number. null values are cached negative results (404s, etc.) so
// we don't keep retrying them.
//
// Existing cache as of 2026-05-22 holds ~226 entries (0.6% coverage),
// populated opportunistically by prior find_join_candidates / get_fragment
// calls. v0.18.13 ships:
//   1. This loader + accessor (lazy, in-memory cache)
//   2. The enrichFragmentMetadata batch-fetcher (rate-limited, polite)
//   3. The enrich_prefix_metadata MCP tool wrapping #2 per prefix
//   4. collectionCoverage's period/genre/city distributions ACTUALLY
//      populated (previously surfaced "(unknown)" for everything)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.18.13 (research; danebrown)";
const METADATA_FILE = "fragment-metadata.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type FragmentScript = {
  period?: string;
  periodModifier?: string;
  uncertain?: boolean;
  sortKey?: number;
};

export type FragmentMetadata = {
  museum_number: string;
  designation: string | null;
  script: FragmentScript | string | null; // can be nested object or bare string in older records
  provenance: { site?: string; region?: string } | string | null;
  collection: string | null;
  genres: string[];
  genres_flat: string[];
  joins_count: number;
};

export type MetadataCoverage = {
  total_entries_in_cache: number;
  total_with_metadata: number;
  total_null: number;
  cache_path: string;
};

export type EnrichResult = {
  prefix: string | null;
  requested_ids: number;
  already_cached_with_data: number;
  already_cached_null: number;
  newly_fetched: number;
  newly_failed: number;
  newly_null_404: number;
  elapsed_seconds: number;
  remaining_in_prefix_without_metadata: number;
  warnings: string[];
};

// ─── Internal state ────────────────────────────────────────────────────────

type MetadataCache = Record<string, FragmentMetadata | null>;

let _cache: MetadataCache | null = null;
let _loadAttempted = false;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function cachePath(): string {
  return join(cacheDir(), METADATA_FILE);
}

function ensureCacheDir(): void {
  const dir = cacheDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadCache(): MetadataCache {
  if (_cache) return _cache;
  if (_loadAttempted && _cache === null) return {};
  _loadAttempted = true;
  const path = cachePath();
  if (!existsSync(path)) {
    _cache = {};
    return _cache;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    _cache = JSON.parse(raw) as MetadataCache;
    return _cache;
  } catch (e) {
    // Corrupt cache — start fresh; surface the error in warnings if asked
    _cache = {};
    return _cache;
  }
}

function persistCache(cache: MetadataCache): void {
  ensureCacheDir();
  writeFileSync(cachePath(), JSON.stringify(cache, null, 0), "utf-8");
  _cache = cache; // refresh in-memory mirror
}

// ─── Public accessors ──────────────────────────────────────────────────────

/**
 * Get cached fragment metadata for a tablet. Returns null if:
 *   - the tablet isn't in the cache (never queried), OR
 *   - the tablet IS in the cache but the value is null (negative result, e.g. 404)
 *
 * Use isInCache() to distinguish "never queried" from "queried, no data".
 */
/**
 * v0.48 — Return the full cache as a plain object. Used by tools that
 * iterate all tablets (find_provenance_clusters etc.). Returns an empty
 * object when the cache file is missing.
 */
export function loadAllMetadata(): Record<string, FragmentMetadata | null> {
  return loadCache();
}

export function getFragmentMetadata(tabletId: string): FragmentMetadata | null {
  const cache = loadCache();
  const v = cache[tabletId];
  return v ?? null;
}

/**
 * Returns true if the tablet has been queried at least once (even if the
 * result was null). False means the tablet has NEVER been queried.
 */
export function isInCache(tabletId: string): boolean {
  const cache = loadCache();
  return tabletId in cache;
}

/**
 * Extract a normalized period string from a FragmentMetadata.script field
 * (which may be a nested object or a bare string in older records).
 */
export function getPeriod(metadata: FragmentMetadata | null): string | null {
  if (!metadata || !metadata.script) return null;
  if (typeof metadata.script === "string") return metadata.script;
  return metadata.script.period ?? null;
}

/**
 * Extract a normalized city/site string from a FragmentMetadata.provenance
 * field (which may be a nested object or a bare string).
 */
export function getCity(metadata: FragmentMetadata | null): string | null {
  if (!metadata || !metadata.provenance) return null;
  if (typeof metadata.provenance === "string") return metadata.provenance;
  return metadata.provenance.site ?? null;
}

/**
 * Extract the first (most-specific) genre from a FragmentMetadata, or null
 * if none. Returns the joined "→ → →" hierarchy string from genres[].
 */
export function getPrimaryGenre(metadata: FragmentMetadata | null): string | null {
  if (!metadata || !metadata.genres || metadata.genres.length === 0) return null;
  return metadata.genres[0];
}

/**
 * v0.39 — Extract the ancient find-spot region from a FragmentMetadata.
 * Patel asked for ancient (dig-site) provenance distinct from modern
 * museum collection. eBL's provenance.region field carries this when
 * present (e.g. "Kuyunjik", "Sippar"). Falls back to provenance.site
 * if region is null, then to the bare-string form for older records.
 */
export function getAncientFindSpot(metadata: FragmentMetadata | null): string | null {
  if (!metadata) return null;
  // Try provenance.region → provenance.site → bare-string provenance, then
  // fall back to metadata.collection. v0.45 finding: eBL's
  // provenance.region is null for the vast majority of cached fragments,
  // but collection ("Kuyunjik", "British Museum", etc.) IS populated and
  // is a reasonable proxy for ancient find-spot since collections cluster
  // archaeologically (K.* + Sm.* prefixes both = Kuyunjik). Note this is
  // an approximation: "British Museum" as collection is not strictly an
  // ancient find-spot, but it's the best signal available pending
  // provenance.region enrichment from eBL.
  if (metadata.provenance) {
    if (typeof metadata.provenance === "string" && metadata.provenance.length > 0) {
      return metadata.provenance;
    }
    if (typeof metadata.provenance === "object") {
      const region = metadata.provenance.region;
      if (region && region.length > 0) return region;
      const site = metadata.provenance.site;
      if (site && site.length > 0) return site;
    }
  }
  // v0.45 fallback to collection.
  if (metadata.collection && metadata.collection.length > 0) {
    return metadata.collection;
  }
  return null;
}

/**
 * v0.39 — Construct the IIIF image URL for a tablet, if eBL hosts it.
 * Returns null if the tablet ID can't be mapped to an eBL canonical
 * museum-number form. The URL pattern matches eBL's photo endpoint —
 * consumers should verify the URL resolves before using it (eBL has
 * photos for ~60-70% of transliterated tablets).
 *
 * Pattern: https://www.ebl.lmu.de/fragmentarium/{MUSEUM_NUMBER}/photo
 */
export function getEblPhotoUrl(tabletId: string): string | null {
  // Reject empty or obviously malformed IDs.
  if (!tabletId || tabletId.length === 0) return null;
  // eBL uses URL-encoded museum numbers; "K.5896" stays as-is.
  const encoded = encodeURIComponent(tabletId);
  return `https://www.ebl.lmu.de/fragmentarium/${encoded}/photo`;
}

/**
 * v0.78 — Construct the FETCHABLE eBL photo API URL for a tablet.
 *
 * Distinct from getEblPhotoUrl(): that returns the SPA viewer route
 * (.../fragmentarium/{id}/photo) which 302-redirects to an HTML page and is
 * NOT directly fetchable as an image. This returns the JSON/REST API endpoint
 * (.../api/fragments/{id}/photo) which serves the raw `image/jpeg` bytes
 * (verified live 2026-06-02: K.5896 → HTTP 200, image/jpeg, ~668 KB).
 *
 * Returns null for empty/malformed IDs. As with the viewer URL, eBL only hosts
 * photos for ~60-70% of transliterated tablets; a 404/redirect at fetch time
 * means no photo is on file. The image itself is British-Museum-collection
 * material — link/fetch-to-local-cache only, never redistribute.
 *
 * Pattern: https://www.ebl.lmu.de/api/fragments/{MUSEUM_NUMBER}/photo
 */
export function getEblPhotoApiUrl(tabletId: string): string | null {
  if (!tabletId || tabletId.length === 0) return null;
  const encoded = encodeURIComponent(tabletId);
  return `https://www.ebl.lmu.de/api/fragments/${encoded}/photo`;
}

/**
 * v0.39 — Construct the eBL fragmentarium landing URL for a tablet.
 * Distinct from the photo URL — this is the human-readable entry point.
 */
export function getEblFragmentUrl(tabletId: string): string | null {
  if (!tabletId || tabletId.length === 0) return null;
  const encoded = encodeURIComponent(tabletId);
  return `https://www.ebl.lmu.de/fragmentarium/${encoded}`;
}

/**
 * Return overall coverage stats for the fragment-metadata cache.
 */
export function metadataCoverage(): MetadataCoverage {
  const cache = loadCache();
  const keys = Object.keys(cache);
  let withData = 0;
  let nullCount = 0;
  for (const k of keys) {
    if (cache[k] === null) nullCount++;
    else withData++;
  }
  return {
    total_entries_in_cache: keys.length,
    total_with_metadata: withData,
    total_null: nullCount,
    cache_path: cachePath(),
  };
}

// ─── Batch enrichment (network) ────────────────────────────────────────────

async function fetchOneMetadata(tabletId: string): Promise<FragmentMetadata | null | "FETCH_ERROR"> {
  const url = `${EBL_BASE}/fragments/${encodeURIComponent(tabletId)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (!res.ok) return "FETCH_ERROR";
    const body = (await res.json()) as Record<string, unknown>;

    const museumNumberRaw = body.museumNumber as { prefix?: string; number?: string; suffix?: string } | undefined;
    const museum_number = museumNumberRaw
      ? `${museumNumberRaw.prefix ?? ""}.${museumNumberRaw.number ?? ""}${museumNumberRaw.suffix ? "." + museumNumberRaw.suffix : ""}`
      : tabletId;

    const genres: string[] = [];
    const genres_flat: string[] = [];
    const rawGenres = body.genres as Array<{ category?: string[] }> | undefined;
    if (Array.isArray(rawGenres)) {
      for (const g of rawGenres) {
        const cat = g.category ?? [];
        for (const c of cat) {
          if (c !== "CANONICAL") genres_flat.push(c);
        }
        if (cat.length > 0) genres.push(cat.join(" → "));
      }
    }

    const joinsRaw = body.joins as Array<unknown[]> | undefined;
    const joins_count = Array.isArray(joinsRaw)
      ? joinsRaw.reduce((sum, g) => sum + (Array.isArray(g) ? g.length : 0), 0)
      : 0;

    return {
      museum_number,
      designation: (body.designation as string) ?? null,
      script: (body.script as FragmentScript) ?? null,
      provenance: (body.provenance as { site?: string } | string) ?? null,
      collection: (body.collection as string) ?? null,
      genres,
      genres_flat,
      joins_count,
    };
  } catch {
    return "FETCH_ERROR";
  }
}

export type EnrichOptions = {
  ids: string[]; // tablet IDs to enrich (typically all uncached IDs for a prefix)
  concurrency?: number; // default 5 (polite to eBL)
  maxToFetch?: number; // hard cap on actual network calls in this invocation (chunking; default 50)
  prefixLabel?: string | null; // for the result's `prefix` field (cosmetic)
  remainingCount?: number | null; // for the result's `remaining_in_prefix_without_metadata` field (cosmetic)
};

/**
 * Batch-fetch metadata for a list of tablet IDs from the eBL API.
 * Skips IDs already in the cache (positive OR negative). Persists the cache
 * to disk after the run. Rate-limited by concurrency (default 5).
 */
export async function enrichFragmentMetadata(opts: EnrichOptions): Promise<EnrichResult> {
  const warnings: string[] = [];
  const cache = loadCache();
  const concurrency = Math.max(1, Math.min(10, opts.concurrency ?? 5));
  const maxToFetch = Math.max(1, Math.min(500, opts.maxToFetch ?? 50));

  const ids = opts.ids;
  let alreadyCachedWithData = 0;
  let alreadyCachedNull = 0;
  const toFetch: string[] = [];

  for (const id of ids) {
    if (id in cache) {
      if (cache[id] === null) alreadyCachedNull++;
      else alreadyCachedWithData++;
    } else {
      toFetch.push(id);
    }
  }

  const batchToFetch = toFetch.slice(0, maxToFetch);
  let newlyFetched = 0;
  let newlyFailed = 0;
  let newlyNull404 = 0;
  const startMs = Date.now();

  // Worker-pool loop, same pattern as cache.ts/runWorkerPool
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < batchToFetch.length) {
      const i = cursor++;
      const id = batchToFetch[i];
      const result = await fetchOneMetadata(id);
      if (result === "FETCH_ERROR") {
        newlyFailed++;
        // Do NOT cache error — next invocation should retry
      } else if (result === null) {
        cache[id] = null;
        newlyNull404++;
      } else {
        cache[id] = result;
        newlyFetched++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Persist cache once at end of batch
  persistCache(cache);

  return {
    prefix: opts.prefixLabel ?? null,
    requested_ids: ids.length,
    already_cached_with_data: alreadyCachedWithData,
    already_cached_null: alreadyCachedNull,
    newly_fetched: newlyFetched,
    newly_failed: newlyFailed,
    newly_null_404: newlyNull404,
    elapsed_seconds: +(((Date.now() - startMs) / 1000)).toFixed(2),
    remaining_in_prefix_without_metadata: opts.remainingCount ?? Math.max(0, toFetch.length - maxToFetch),
    warnings,
  };
}
