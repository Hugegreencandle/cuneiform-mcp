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
// alternates), "X" (unreadable). Trigrams containing ≥2 X are skipped — the
// X-FILTER-EXPERIMENT-2026-05-14 benchmark showed this rescues one known
// sibling into top-30, compresses median rank of known siblings from 89→26
// (3.4×), and only costs visibility on siblings already ranked ≥1700
// (effectively unreachable). Recall@15 is unchanged at 22/87.
//
// v0.18.3 calibration: the index now also stores fragmentsOrdered (ordered
// trigram lists) for the run-bonus calibration. Same pattern that lifted
// fuzzyParallels in v0.18.2 — contiguous trigram runs evidence text-section
// sibling pairs over scattered noise.

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
      const a = toks[i],
        b = toks[i + 1],
        c = toks[i + 2];
      const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (xCount >= 2) continue;
      out.add(a + " " + b + " " + c);
    }
  }
  return out;
}

// v0.18.3 — also return the ordered trigram list (positional) for the run-bonus
// calibration that lifts text-section sibling pairs over scattered noise.
export function trigramsOrderedFromSigns(signs: string): string[] {
  const out: string[] = [];
  if (!signs) return out;
  for (const line of signs.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      const a = toks[i],
        b = toks[i + 1],
        c = toks[i + 2];
      const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (xCount >= 2) continue;
      out.push(a + " " + b + " " + c);
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

// v0.60 alternative similarity metric: overlap coefficient (Szymkiewicz-
// Simpson). Normalizes by the size of the smaller set rather than the
// union. Simonjetz et al. 2024 demonstrated this handles fragment-vs-
// chapter size asymmetry better than Jaccard on cuneiform classification;
// exposed here as an opt-in scorer for direct head-to-head calibration
// against their published baseline.
//
// overlap(a, b) = |a ∩ b| / min(|a|, |b|)
//
// Returns 0 if either set is empty or they share no elements; returns
// 1 if the smaller set is fully contained in the larger.
export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let intersect = 0;
  for (const x of small) if (big.has(x)) intersect++;
  if (intersect === 0) return 0;
  return intersect / small.size;
}

// Dispatcher used by tools that want to switch metrics via a parameter.
// New code should prefer calling jaccard / overlapCoefficient directly;
// this helper exists so the MCP tool layer can accept a "metric" arg.
export function similarityScore(
  a: Set<string>,
  b: Set<string>,
  metric: "jaccard" | "overlap" = "jaccard",
): number {
  return metric === "overlap" ? overlapCoefficient(a, b) : jaccard(a, b);
}

export type SignsRecord = { _id: string; signs: string };
export type SignsIndex = {
  fragments: Map<string, Set<string>>; // museum_number -> trigram set
  fragmentsOrdered: Map<string, string[]>; // v0.18.3: ordered trigram list per tablet (for run-bonus)
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
      cached = { fragments: new Map(), fragmentsOrdered: new Map(), cachePath, ageMs: null, missing: true };
      return cached;
    }
    const raw = await fs.readFile(cachePath, "utf8");
    const records = JSON.parse(raw) as SignsRecord[];
    const fragments = new Map<string, Set<string>>();
    const fragmentsOrdered = new Map<string, string[]>();
    for (const r of records) {
      if (!r._id || typeof r.signs !== "string") continue;
      const set = trigramsFromSigns(r.signs);
      if (set.size === 0) continue;
      fragments.set(r._id, set);
      fragmentsOrdered.set(r._id, trigramsOrderedFromSigns(r.signs));
    }
    cached = {
      fragments,
      fragmentsOrdered,
      cachePath,
      ageMs: Date.now() - stat.mtimeMs,
      missing: fragments.size === 0,
    };
    return cached;
  })();
  return pendingLoad;
}
