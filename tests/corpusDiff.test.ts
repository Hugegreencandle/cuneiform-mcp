// v0.63.0 — Tests for diff_corpus_versions.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  snapshotCache,
  diffManifests,
  diffCorpusVersions,
  loadManifest,
  type CacheManifest,
} from "../src/corpusDiff.js";

describe("diff_corpus_versions", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "cuneiform-corpusdiff-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // ─── snapshot ─────────────────────────────────────────────────────────

  it("snapshotCache walks the cache dir + hashes every file", () => {
    const cacheDir = join(tmp, "cache");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "a.json"), '{"k": 1}');
    mkdirSync(join(cacheDir, "sub"), { recursive: true });
    writeFileSync(join(cacheDir, "sub", "b.json"), '{"k": 2}');

    const { manifest, warnings } = snapshotCache({ cacheDir });
    expect(warnings).toHaveLength(0);
    expect(manifest.cache_dir).toBe(cacheDir);
    expect(manifest.files).toHaveLength(2);
    expect(manifest.files.map((f) => f.path).sort()).toEqual(["a.json", "sub/b.json"]);
    for (const f of manifest.files) {
      expect(f.content_hash_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.size_bytes).toBeGreaterThan(0);
      expect(f.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("snapshotCache handles missing cache dir gracefully", () => {
    const cacheDir = join(tmp, "does-not-exist");
    const { manifest, warnings } = snapshotCache({ cacheDir });
    expect(manifest.files).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/cache dir does not exist/);
  });

  // ─── diff ─────────────────────────────────────────────────────────────

  it("diffManifests surfaces added + removed + changed", () => {
    const old: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-20T00:00:00Z",
      mcp_version: "0.62.0",
      files: [
        { path: "a.json", content_hash_sha256: "a".repeat(64), size_bytes: 10, mtime: "2026-05-20T00:00:00Z" },
        { path: "b.json", content_hash_sha256: "b".repeat(64), size_bytes: 20, mtime: "2026-05-20T00:00:00Z" },
      ],
    };
    const neu: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-27T00:00:00Z",
      mcp_version: "0.63.0",
      files: [
        // a.json unchanged
        { path: "a.json", content_hash_sha256: "a".repeat(64), size_bytes: 10, mtime: "2026-05-20T00:00:00Z" },
        // b.json changed (different hash + bigger)
        { path: "b.json", content_hash_sha256: "B".repeat(64), size_bytes: 30, mtime: "2026-05-27T00:00:00Z" },
        // c.json added
        { path: "c.json", content_hash_sha256: "c".repeat(64), size_bytes: 5, mtime: "2026-05-27T00:00:00Z" },
      ],
    };

    const d = diffManifests(old, neu);
    expect(d.files_added.map((f) => f.path)).toEqual(["c.json"]);
    expect(d.files_removed).toEqual([]);
    expect(d.files_changed.map((c) => c.path)).toEqual(["b.json"]);
    expect(d.files_changed[0].old_hash).toBe("b".repeat(64));
    expect(d.files_changed[0].new_hash).toBe("B".repeat(64));
    expect(d.summary.added_count).toBe(1);
    expect(d.summary.removed_count).toBe(0);
    expect(d.summary.changed_count).toBe(1);
    expect(d.summary.files_in_old).toBe(2);
    expect(d.summary.files_in_new).toBe(3);
    // bytes_delta = added(5) - removed(0) + changed(30-20) = 15
    expect(d.summary.bytes_delta).toBe(15);
  });

  it("diffManifests handles removals", () => {
    const old: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-20T00:00:00Z",
      mcp_version: "0.62.0",
      files: [
        { path: "x.json", content_hash_sha256: "x".repeat(64), size_bytes: 100, mtime: "2026-05-20T00:00:00Z" },
        { path: "y.json", content_hash_sha256: "y".repeat(64), size_bytes: 50, mtime: "2026-05-20T00:00:00Z" },
      ],
    };
    const neu: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-27T00:00:00Z",
      mcp_version: "0.63.0",
      files: [
        // x.json removed
        // y.json kept
        { path: "y.json", content_hash_sha256: "y".repeat(64), size_bytes: 50, mtime: "2026-05-20T00:00:00Z" },
      ],
    };
    const d = diffManifests(old, neu);
    expect(d.files_added).toEqual([]);
    expect(d.files_removed.map((f) => f.path)).toEqual(["x.json"]);
    expect(d.files_changed).toEqual([]);
    expect(d.summary.bytes_delta).toBe(-100);
  });

  it("diffManifests on identical manifests returns empty deltas", () => {
    const m: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-20T00:00:00Z",
      mcp_version: "0.62.0",
      files: [{ path: "a.json", content_hash_sha256: "a".repeat(64), size_bytes: 10, mtime: "2026-05-20T00:00:00Z" }],
    };
    const d = diffManifests(m, m);
    expect(d.files_added).toEqual([]);
    expect(d.files_removed).toEqual([]);
    expect(d.files_changed).toEqual([]);
    expect(d.summary.added_count).toBe(0);
    expect(d.summary.bytes_delta).toBe(0);
  });

  // ─── disk round-trip ──────────────────────────────────────────────────

  it("diffCorpusVersions reads manifests from disk", () => {
    const old: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-20T00:00:00Z",
      mcp_version: "0.62.0",
      files: [{ path: "a.json", content_hash_sha256: "a".repeat(64), size_bytes: 10, mtime: "2026-05-20T00:00:00Z" }],
    };
    const neu: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-27T00:00:00Z",
      mcp_version: "0.63.0",
      files: [
        { path: "a.json", content_hash_sha256: "a".repeat(64), size_bytes: 10, mtime: "2026-05-20T00:00:00Z" },
        { path: "b.json", content_hash_sha256: "b".repeat(64), size_bytes: 20, mtime: "2026-05-27T00:00:00Z" },
      ],
    };
    const oldPath = join(tmp, "old.json");
    const newPath = join(tmp, "new.json");
    writeFileSync(oldPath, JSON.stringify(old));
    writeFileSync(newPath, JSON.stringify(neu));

    const d = diffCorpusVersions({ oldManifestPath: oldPath, newManifestPath: newPath });
    expect(d.files_added.map((f) => f.path)).toEqual(["b.json"]);
    expect(d.summary.files_in_old).toBe(1);
    expect(d.summary.files_in_new).toBe(2);
  });

  it("loadManifest rejects invalid JSON", () => {
    const badPath = join(tmp, "bad.json");
    writeFileSync(badPath, "{ not valid json");
    expect(() => loadManifest(badPath)).toThrow(/not valid JSON/);
  });

  it("loadManifest rejects manifests missing required fields", () => {
    const badPath = join(tmp, "bad.json");
    writeFileSync(badPath, JSON.stringify({ files: [] }));
    expect(() => loadManifest(badPath)).toThrow(/missing required fields/);
  });

  it("diff is read-only — caller's manifests are not mutated", () => {
    const old: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-20T00:00:00Z",
      mcp_version: "0.62.0",
      files: [{ path: "a.json", content_hash_sha256: "a".repeat(64), size_bytes: 10, mtime: "2026-05-20T00:00:00Z" }],
    };
    const oldFrozen = JSON.stringify(old);
    const neu: CacheManifest = {
      cache_dir: "/cache",
      generated_at: "2026-05-27T00:00:00Z",
      mcp_version: "0.63.0",
      files: [{ path: "b.json", content_hash_sha256: "b".repeat(64), size_bytes: 20, mtime: "2026-05-27T00:00:00Z" }],
    };
    const neuFrozen = JSON.stringify(neu);
    diffManifests(old, neu);
    expect(JSON.stringify(old)).toBe(oldFrozen);
    expect(JSON.stringify(neu)).toBe(neuFrozen);
  });
});
