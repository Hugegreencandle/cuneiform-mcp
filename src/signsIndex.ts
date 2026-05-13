// Sign-trigram index built from eBL `/fragments/all-signs`. Backs the
// `find_parallel_text` tool — a sign-sequence parallel-text matcher that
// validation 2026-05-14 measured at recall@15 = 25% vs lineToVec's 3.4%
// on the same 50-target / 87-sibling benchmark. See VALIDATION-2026-05-14.md
// and TRIGRAM-EXPERIMENT-2026-05-14.md for the methodology + raw numbers.
//
// Storage:
//   ~/.cache/cuneiform-mcp/all-signs-full.json — full {_id, signs} dump
//   (one ~26 s request to eBL, ~33 MB on disk).
//
// Trigram tokenization is within-line (no boundary crossing). Tokens are
// space-separated entries like "ABZ151", "ABZ406v2", "ABZ85/ABZ84" (uncertain
// alternates), "X" (unreadable). We keep X-trigrams — they're real evidence
// that "something stood here in a recognizable position" — but if a future
// experiment shows they hurt recall, this is the layer to filter.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const SIGNS_INDEX_FILE = "all-signs-full.json";

export function getCacheDir(): string {
  const env = process.env.CUNEIFORM_MCP_CACHE_DIR;
  if (env && env.length > 0) return env;
  return path.join(os.homedir(), ".cache", "cuneiform-mcp");
}

export function trigramsFromSigns(signs: string): Set<string> {
  const out = new Set<string>();
  if (!signs) return out;
  for (const line of signs.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      out.add(toks[i] + " " + toks[i + 1] + " " + toks[i + 2]);
    }
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let intersect = 0;
  for (const x of small) if (big.has(x)) intersect++;
  if (intersect === 0) return 0;
  return intersect / (a.size + b.size - intersect);
}

export type SignsRecord = { _id: string; signs: string };
export type SignsIndex = {
  fragments: Map<string, Set<string>>; // museum_number -> trigram set
  cachePath: string;
  ageMs: number | null;
  missing: boolean;
};

// Lazy singleton. The full index is ~90 MB of resident sets; we only build
// it on first use of find_parallel_text, so users who don't hit that tool
// don't pay for it.
let cached: SignsIndex | null = null;
let pendingLoad: Promise<SignsIndex> | null = null;

export async function loadSignsIndex(): Promise<SignsIndex> {
  if (cached) return cached;
  if (pendingLoad) return pendingLoad;
  pendingLoad = (async () => {
    const dir = getCacheDir();
    await fs.mkdir(dir, { recursive: true });
    const cachePath = path.join(dir, SIGNS_INDEX_FILE);
    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
      stat = await fs.stat(cachePath);
    } catch {
      cached = { fragments: new Map(), cachePath, ageMs: null, missing: true };
      return cached;
    }
    const raw = await fs.readFile(cachePath, "utf8");
    const records = JSON.parse(raw) as SignsRecord[];
    const fragments = new Map<string, Set<string>>();
    for (const r of records) {
      if (!r._id || typeof r.signs !== "string") continue;
      const set = trigramsFromSigns(r.signs);
      if (set.size > 0) fragments.set(r._id, set);
    }
    cached = {
      fragments,
      cachePath,
      ageMs: Date.now() - stat.mtimeMs,
      missing: fragments.size === 0,
    };
    return cached;
  })();
  return pendingLoad;
}
