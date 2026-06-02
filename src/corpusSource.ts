// ccpo-ingest (Stage B) — single shared corpus-source helper.
//
// The chunk engine is corpus-source-agnostic: it only sees {_id, signs}. To let
// ccpo P-numbers be used as SOURCE/host tablets in runtime tools that read the
// raw corpus (find_chunk_parallels via fuzzyParallels.loadCorpus), the runtime
// loader must see ccpo-signs.json too. This is the ONE helper edit the spec
// calls for — every runtime loader that wants ccpo members should route its raw
// {_id, signs} read through loadCorpusRecords() instead of reading
// all-signs-full.json directly.
//
// Both reads are existsSync-guarded so absence of either file is non-breaking.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const ALL_SIGNS_FILE = "all-signs-full.json";
export const CCPO_SIGNS_FILE = "ccpo-signs.json";

export type CorpusSignsRecord = { _id: string; signs: string };

export function corpusCacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

/**
 * Load the raw {_id, signs} corpus the chunk/fuzzy engines index: the eBL
 * all-signs dump CONCATENATED with the ccpo commentary editions when present.
 * Returns null only when the primary all-signs cache is missing (matches the
 * prior loaders' contract); ccpo is always optional/additive.
 */
export function loadCorpusRecords(cacheDirOverride?: string): CorpusSignsRecord[] | null {
  const dir = cacheDirOverride || corpusCacheDir();
  const allSignsPath = join(dir, ALL_SIGNS_FILE);
  if (!existsSync(allSignsPath)) return null;

  const records = JSON.parse(readFileSync(allSignsPath, "utf-8")) as CorpusSignsRecord[];

  const ccpoPath = join(dir, CCPO_SIGNS_FILE);
  if (existsSync(ccpoPath)) {
    try {
      const ccpo = JSON.parse(readFileSync(ccpoPath, "utf-8")) as CorpusSignsRecord[];
      for (const r of ccpo) records.push(r);
    } catch {
      // Malformed ccpo cache is non-fatal — base corpus still loads.
    }
  }
  return records;
}
