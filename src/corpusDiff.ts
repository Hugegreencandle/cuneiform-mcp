// v0.63.0 — diff_corpus_versions: cache-snapshot delta tool (T2-A).
//
// Read-only delta computation between two content-hash manifests of
// ~/.cache/cuneiform-mcp/. Two-step workflow:
//   1. `scripts/snapshot-cache.mjs <out.json>` walks the cache dir, computes
//      sha256 per file, writes a manifest JSON.
//   2. `diff_corpus_versions({old_manifest_path, new_manifest_path})` reads
//      two manifests and returns added/removed/changed deltas.
//
// NO mutation of cache contents — the diff tool never writes anything under
// ~/.cache/cuneiform-mcp/. Manifests live wherever the caller puts them
// (typically docs/cache-snapshots/<iso-ts>.json).
//
// Use cases:
//   - "Do any methods-paper §3.x findings move if the eBL re-classifies
//      BM.77056?" → snapshot before + after the enrichment, diff, surface
//      the affected fragment IDs.
//   - "Did the v0.20-alpha fragment-metadata enrichment burst overwrite
//      anything?" → compare pre- and post-burst manifests.
//   - General reproducibility: pin the methods-paper claims to a specific
//      manifest hash.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { homedir } from "node:os";

// ─── Public types ──────────────────────────────────────────────────────────

export type ManifestFileEntry = {
  /** Path relative to the manifest's cache_dir. */
  path: string;
  content_hash_sha256: string;
  size_bytes: number;
  mtime: string;
};

export type CacheManifest = {
  cache_dir: string;
  generated_at: string;
  mcp_version: string;
  files: ManifestFileEntry[];
};

export type ChangedEntry = {
  path: string;
  old_hash: string;
  new_hash: string;
  old_size: number;
  new_size: number;
  old_mtime: string;
  new_mtime: string;
};

export type DiffSummary = {
  old_manifest_at: string;
  new_manifest_at: string;
  files_in_old: number;
  files_in_new: number;
  added_count: number;
  removed_count: number;
  changed_count: number;
  bytes_delta: number;
};

export type DiffResult = {
  files_added: ManifestFileEntry[];
  files_removed: ManifestFileEntry[];
  files_changed: ChangedEntry[];
  summary: DiffSummary;
};

// ─── Cache dir resolution ──────────────────────────────────────────────────

export function defaultCacheDir(): string {
  return (
    process.env.CUNEIFORM_MCP_CACHE_DIR ||
    join(homedir(), ".cache", "cuneiform-mcp")
  );
}

// ─── Snapshot ──────────────────────────────────────────────────────────────

/**
 * Walk the cache dir recursively, compute SHA-256 of each file, return a
 * typed manifest. Skips symlinks, sockets, devices. Errors on individual
 * files are surfaced as `warnings` on the returned object — we never
 * silently drop files.
 */
export function snapshotCache(opts?: { cacheDir?: string; mcpVersion?: string }): {
  manifest: CacheManifest;
  warnings: string[];
} {
  const dir = opts?.cacheDir ?? defaultCacheDir();
  const warnings: string[] = [];

  if (!existsSync(dir)) {
    return {
      manifest: {
        cache_dir: dir,
        generated_at: new Date().toISOString(),
        mcp_version: opts?.mcpVersion ?? "0.63.0",
        files: [],
      },
      warnings: [`cache dir does not exist: ${dir}`],
    };
  }

  const files: ManifestFileEntry[] = [];
  walkDir(dir, dir, files, warnings);

  // Deterministic order for stable hashes.
  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    manifest: {
      cache_dir: dir,
      generated_at: new Date().toISOString(),
      mcp_version: opts?.mcpVersion ?? "0.63.0",
      files,
    },
    warnings,
  };
}

function walkDir(
  root: string,
  cur: string,
  out: ManifestFileEntry[],
  warnings: string[],
): void {
  let entries: string[];
  try {
    entries = readdirSync(cur);
  } catch (e) {
    warnings.push(`readdir failed: ${cur}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  for (const name of entries) {
    const full = join(cur, name);
    let st;
    try {
      st = statSync(full);
    } catch (e) {
      warnings.push(`stat failed: ${full}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (st.isDirectory()) {
      walkDir(root, full, out, warnings);
    } else if (st.isFile()) {
      try {
        const buf = readFileSync(full);
        const hash = createHash("sha256").update(buf).digest("hex");
        out.push({
          path: relative(root, full),
          content_hash_sha256: hash,
          size_bytes: st.size,
          mtime: st.mtime.toISOString(),
        });
      } catch (e) {
        warnings.push(`hash failed: ${full}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // ignore symlinks, sockets, devices
  }
}

// ─── Manifest load ─────────────────────────────────────────────────────────

export function loadManifest(path: string): CacheManifest {
  if (!existsSync(path)) {
    throw new Error(`manifest not found: ${path}`);
  }
  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`manifest is not valid JSON: ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const m = parsed as Partial<CacheManifest>;
  if (
    typeof m.cache_dir !== "string" ||
    typeof m.generated_at !== "string" ||
    !Array.isArray(m.files)
  ) {
    throw new Error(`manifest missing required fields (cache_dir, generated_at, files): ${path}`);
  }
  return m as CacheManifest;
}

// ─── Diff ──────────────────────────────────────────────────────────────────

/**
 * Compute the delta between two manifests. Pure function — does not touch
 * the filesystem (manifests are passed in, not loaded). Files identified
 * by their relative `path` field; reclassification is added+removed
 * (a moved file is reported as one removal + one addition).
 */
export function diffManifests(
  oldM: CacheManifest,
  newM: CacheManifest,
): DiffResult {
  const oldByPath = new Map<string, ManifestFileEntry>();
  for (const f of oldM.files) oldByPath.set(f.path, f);
  const newByPath = new Map<string, ManifestFileEntry>();
  for (const f of newM.files) newByPath.set(f.path, f);

  const added: ManifestFileEntry[] = [];
  const removed: ManifestFileEntry[] = [];
  const changed: ChangedEntry[] = [];

  for (const [path, neu] of newByPath) {
    const old = oldByPath.get(path);
    if (!old) {
      added.push(neu);
    } else if (old.content_hash_sha256 !== neu.content_hash_sha256) {
      changed.push({
        path,
        old_hash: old.content_hash_sha256,
        new_hash: neu.content_hash_sha256,
        old_size: old.size_bytes,
        new_size: neu.size_bytes,
        old_mtime: old.mtime,
        new_mtime: neu.mtime,
      });
    }
  }
  for (const [path, old] of oldByPath) {
    if (!newByPath.has(path)) removed.push(old);
  }

  // Deterministic sort for reproducibility.
  added.sort((a, b) => a.path.localeCompare(b.path));
  removed.sort((a, b) => a.path.localeCompare(b.path));
  changed.sort((a, b) => a.path.localeCompare(b.path));

  const bytesDelta =
    added.reduce((s, f) => s + f.size_bytes, 0) -
    removed.reduce((s, f) => s + f.size_bytes, 0) +
    changed.reduce((s, c) => s + (c.new_size - c.old_size), 0);

  return {
    files_added: added,
    files_removed: removed,
    files_changed: changed,
    summary: {
      old_manifest_at: oldM.generated_at,
      new_manifest_at: newM.generated_at,
      files_in_old: oldM.files.length,
      files_in_new: newM.files.length,
      added_count: added.length,
      removed_count: removed.length,
      changed_count: changed.length,
      bytes_delta: bytesDelta,
    },
  };
}

/**
 * Convenience: load two manifests from disk and diff them. Read-only.
 */
export function diffCorpusVersions(opts: {
  oldManifestPath: string;
  newManifestPath: string;
}): DiffResult {
  const oldM = loadManifest(opts.oldManifestPath);
  const newM = loadManifest(opts.newManifestPath);
  return diffManifests(oldM, newM);
}
