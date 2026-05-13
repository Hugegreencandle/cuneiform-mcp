// Cache module for cuneiform-mcp v0.3 — crawls eBL fragment records
// (specifically the lineToVec field needed by find_join_candidates) and
// writes them as JSONL.
//
// Two reasons this module is its own file:
//   1. The crawl is heavy (~21K HTTP requests). Isolating it keeps the
//      main MCP server module from pulling fs/path dependencies into the
//      hot path of stdin/stdout request handling.
//   2. The cache shape is part of the v0.3 spec contract — see
//      SPEC-v0.3-find_join_candidates.md.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.3.0";

// /fragments/all-signs returns ONLY the ~36,500 transliterated fragments
// (vs /fragments/all which returns all ~311K, of which 88% are catalogued-
// only and have empty lineToVec). One 26-second request, ~35 MB of
// {_id, signs} records. We use just the _id as the worklist for the
// per-fragment lineToVec fetch. This avoids the 9.5-hour 88%-waste crawl
// implied by /fragments/all.
//
// Why not /fragments/retrieve-all? It's in the route table but returns
// the full transliterated-fragment payload in one shot (no implicit
// page size in source), so it never TTFBs within 30+ s. Frontend
// doesn't use it either. Dead in practice.
const ENDPOINT_ALL_SIGNS = `${EBL_BASE}/fragments/all-signs`;
const fragmentUrl = (museumNumber: string) =>
  `${EBL_BASE}/fragments/${encodeURIComponent(museumNumber)}`;

// Cache dir: env override first, then platform-friendly default. On macOS
// XDG isn't canonical but ~/.cache is widely accepted; we choose it over
// ~/Library/Caches/ because it makes wipe/inspect trivial for hobby use.
export function getCacheDir(): string {
  const env = process.env.CUNEIFORM_MCP_CACHE_DIR;
  if (env && env.length > 0) return env;
  return path.join(os.homedir(), ".cache", "cuneiform-mcp");
}

export const FRAGMENTS_JSONL = "fragments.jsonl";
export const WATERMARK_FILE = ".watermark";
export const TRANSLITERATED_IDS_FILE = ".transliterated-ids.json";

export type CachedFragment = {
  museumNumber: string;             // canonical "Prefix.Number.Suffix" form
  lineToVec: number[][];            // tuple-of-tuples per LineToVecEncoding
  designation?: string;
};

async function ensureCacheDir(): Promise<string> {
  const dir = getCacheDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function fmtMuseumNumber(mn: { prefix: string; number: string; suffix: string }): string {
  return `${mn.prefix}.${mn.number}${mn.suffix ? "." + mn.suffix : ""}`;
}

// /fragments/all-signs returns a JSON array of {_id, signs} for every
// transliterated fragment. We only need the _id list for the worklist;
// the signs field is incidental. Cache the extracted ID list to disk so
// a resumed crawl doesn't have to re-download 35 MB.
async function fetchTransliteratedIds(): Promise<string[]> {
  const dir = await ensureCacheDir();
  const cachedPath = path.join(dir, TRANSLITERATED_IDS_FILE);
  try {
    const stat = await fs.stat(cachedPath);
    if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) {
      const raw = await fs.readFile(cachedPath, "utf8");
      const ids = JSON.parse(raw) as unknown;
      if (Array.isArray(ids) && ids.every((x): x is string => typeof x === "string")) {
        return ids;
      }
    }
  } catch {
    // No cached list — fetch fresh.
  }
  const res = await fetch(ENDPOINT_ALL_SIGNS, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`eBL /fragments/all-signs returned HTTP ${res.status}`);
  const records = (await res.json()) as Array<{ _id: string; signs?: string }>;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("eBL /fragments/all-signs returned an unexpected payload.");
  }
  const ids = records.map((r) => r._id).filter((x): x is string => typeof x === "string");
  await fs.writeFile(cachedPath, JSON.stringify(ids), "utf8");
  return ids;
}

async function fetchOneFragment(museumNumber: string): Promise<CachedFragment | null> {
  const res = await fetch(fragmentUrl(museumNumber), {
    headers: { "User-Agent": USER_AGENT },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${museumNumber}`);
  const body = (await res.json()) as {
    museumNumber?: { prefix: string; number: string; suffix: string };
    lineToVec?: number[][];
    designation?: string;
  };
  const mn = body.museumNumber ? fmtMuseumNumber(body.museumNumber) : museumNumber;
  const lineToVec = Array.isArray(body.lineToVec) ? body.lineToVec : [];
  // Skip fragments without lineToVec — they're untransliterated and can't
  // participate in join scoring. Keeps the JSONL small and the in-memory
  // corpus focused on candidates that actually score against each other.
  if (lineToVec.length === 0) return null;
  return {
    museumNumber: mn,
    lineToVec,
    designation: body.designation,
  };
}

// Concurrent worker pool. `concurrency` workers each pull the next index
// from a shared cursor until the list is exhausted. Errors per fragment
// don't kill the pool — they're surfaced via onProgress and skipped.
async function runWorkerPool<T>(
  ids: string[],
  startIndex: number,
  concurrency: number,
  worker: (id: string, index: number) => Promise<T | null>,
  onProgress: (event: ProgressEvent<T>) => void,
): Promise<void> {
  let cursor = startIndex;
  async function loop(): Promise<void> {
    while (cursor < ids.length) {
      const i = cursor++;
      const id = ids[i];
      try {
        const result = await worker(id, i);
        if (result === null) {
          onProgress({ kind: "skipped", index: i, id, result: null });
        } else {
          onProgress({ kind: "ok", index: i, id, result });
        }
      } catch (err) {
        onProgress({
          kind: "error",
          index: i,
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => loop()));
}

type ProgressEvent<T> =
  | { kind: "ok"; index: number; id: string; result: T }
  | { kind: "skipped"; index: number; id: string; result: null }
  | { kind: "error"; index: number; id: string; error: string };

export type CrawlOptions = {
  concurrency?: number;     // default 5 — be a polite neighbour
  resume?: boolean;         // default true — read watermark, skip up to it
  maxFragments?: number;    // cap the total processed count (smoke testing)
  onLog?: (line: string) => void;
};

export type CrawlResult = {
  totalIds: number;
  startedAt: number;
  finishedAt: number;
  written: number;
  skipped: number;
  errors: number;
};

// Load the JSONL cache into memory. Used by find_join_candidates to run
// the lineToVec scorer over the full corpus per request. ~7 MB for the
// full ~35K transliterated set, comfortable in memory.
export type CorpusLoadResult = {
  fragments: CachedFragment[];
  cachePath: string;
  ageMs: number | null;          // null if file doesn't exist yet
  missing: boolean;              // true if there's no cache at all
};

export async function loadCorpus(): Promise<CorpusLoadResult> {
  const dir = await ensureCacheDir();
  const cachePath = path.join(dir, FRAGMENTS_JSONL);
  let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    stat = await fs.stat(cachePath);
  } catch {
    return { fragments: [], cachePath, ageMs: null, missing: true };
  }
  const raw = await fs.readFile(cachePath, "utf8");
  const fragments: CachedFragment[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as CachedFragment;
      if (obj && obj.museumNumber && Array.isArray(obj.lineToVec)) {
        fragments.push(obj);
      }
    } catch {
      // Skip malformed lines (partial writes during a live crawl).
    }
  }
  return {
    fragments,
    cachePath,
    ageMs: Date.now() - stat.mtimeMs,
    missing: fragments.length === 0,
  };
}

export async function crawlFragments(options: CrawlOptions = {}): Promise<CrawlResult> {
  const concurrency = options.concurrency ?? 5;
  const resume = options.resume ?? true;
  const log = options.onLog ?? ((s) => process.stderr.write(s + "\n"));

  const dir = await ensureCacheDir();
  const jsonlPath = path.join(dir, FRAGMENTS_JSONL);
  const watermarkPath = path.join(dir, WATERMARK_FILE);

  log(`[prefetch] cache dir: ${dir}`);
  log(`[prefetch] fetching /fragments/all-signs (transliterated-only, ~35 MB, ~26 s) ...`);
  let allIds = await fetchTransliteratedIds();
  log(`[prefetch] ${allIds.length} transliterated fragments to consider`);
  if (options.maxFragments && options.maxFragments < allIds.length) {
    allIds = allIds.slice(0, options.maxFragments);
    log(`[prefetch] maxFragments cap applied — processing ${allIds.length}`);
  }

  let startIndex = 0;
  if (resume) {
    try {
      const wm = await fs.readFile(watermarkPath, "utf8");
      const parsed = parseInt(wm.trim(), 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed < allIds.length) {
        startIndex = parsed;
        log(`[prefetch] resuming from index ${startIndex}`);
      }
    } catch {
      // No watermark — start fresh.
    }
  } else {
    // Truncate the JSONL when explicitly not resuming.
    try {
      await fs.unlink(jsonlPath);
    } catch {
      // Fine if it doesn't exist.
    }
  }

  const jsonlHandle = await fs.open(jsonlPath, "a");
  const startedAt = Date.now();
  let written = 0;
  let skipped = 0;
  let errors = 0;
  let lastWatermarkWrite = 0;

  try {
    await runWorkerPool(
      allIds,
      startIndex,
      concurrency,
      (id) => fetchOneFragment(id),
      async (ev) => {
        if (ev.kind === "ok") {
          await jsonlHandle.appendFile(JSON.stringify(ev.result) + "\n");
          written++;
        } else if (ev.kind === "skipped") {
          skipped++;
        } else {
          errors++;
          if (errors <= 5) log(`[prefetch] error on ${ev.id}: ${ev.error}`);
        }
        const processed = written + skipped + errors;
        // Watermark + progress every 200 fragments. The watermark is the
        // total processed count, which equals the lowest unprocessed index
        // ONLY because the worker pool advances a shared cursor — if a
        // worker dies mid-fragment, that fragment may be skipped on resume.
        // Acceptable for v0.3; if it bites we'll switch to a per-id ack file.
        if (processed - lastWatermarkWrite >= 200) {
          lastWatermarkWrite = processed;
          await fs.writeFile(watermarkPath, String(startIndex + processed));
          const elapsed = (Date.now() - startedAt) / 1000;
          const rate = processed / elapsed;
          const remaining = allIds.length - (startIndex + processed);
          const eta = remaining > 0 ? Math.round(remaining / rate) : 0;
          log(
            `[prefetch] ${startIndex + processed}/${allIds.length}  ` +
              `written=${written} skipped=${skipped} errors=${errors}  ` +
              `${rate.toFixed(1)} req/s  ETA ${eta}s`,
          );
        }
      },
    );
    // Final watermark write
    await fs.writeFile(watermarkPath, String(allIds.length));
  } finally {
    await jsonlHandle.close();
  }

  const finishedAt = Date.now();
  log(
    `[prefetch] done. ${written} written, ${skipped} skipped (no lineToVec), ` +
      `${errors} errors in ${((finishedAt - startedAt) / 1000).toFixed(1)} s.`,
  );
  return { totalIds: allIds.length, startedAt, finishedAt, written, skipped, errors };
}
