// v0.62.0 — Tests for session ring buffer + export_session.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  recordEnvelope,
  exportSession,
  readBuffer,
  bufferStats,
  _resetBuffer,
} from "../src/sessionExport.js";

const SCHEMA = "https://github.com/danebrown/cuneiform-mcp/schemas/test_tool.schema.json";

function makeEnvelope(i: number) {
  return {
    schema: SCHEMA,
    text: `envelope ${i}`,
    data: { i },
    provenance: {
      source: "local" as const,
      endpoint: "local:test",
      fetched_at: new Date().toISOString(),
      mcp_version: "0.62.0",
    },
  };
}

describe("session ring buffer", () => {
  let tmpCache: string;
  let origCacheDir: string | undefined;

  beforeEach(() => {
    _resetBuffer();
    tmpCache = mkdtempSync(join(tmpdir(), "cuneiform-mcp-test-"));
    origCacheDir = process.env.CUNEIFORM_MCP_CACHE_DIR;
    process.env.CUNEIFORM_MCP_CACHE_DIR = tmpCache;
  });

  afterEach(() => {
    if (origCacheDir === undefined) delete process.env.CUNEIFORM_MCP_CACHE_DIR;
    else process.env.CUNEIFORM_MCP_CACHE_DIR = origCacheDir;
    rmSync(tmpCache, { recursive: true, force: true });
  });

  it("records envelopes in chronological order", () => {
    for (let i = 0; i < 5; i++) recordEnvelope(makeEnvelope(i));
    const buf = readBuffer();
    expect(buf).toHaveLength(5);
    expect(buf.map((r) => r.text)).toEqual([
      "envelope 0",
      "envelope 1",
      "envelope 2",
      "envelope 3",
      "envelope 4",
    ]);
  });

  it("extracts tool_name from schema URI", () => {
    recordEnvelope(makeEnvelope(0));
    const buf = readBuffer();
    expect(buf[0].tool_name).toBe("test_tool");
  });

  it("preserves typed data + provenance + warnings", () => {
    recordEnvelope({
      ...makeEnvelope(0),
      warnings: ["this is a test warning"],
    });
    const buf = readBuffer();
    expect(buf[0].data).toEqual({ i: 0 });
    expect(buf[0].provenance.mcp_version).toBe("0.62.0");
    expect(buf[0].warnings).toEqual(["this is a test warning"]);
  });

  it("snapshot round-trips through JSON + Markdown files", () => {
    for (let i = 0; i < 3; i++) recordEnvelope(makeEnvelope(i));
    const r = exportSession();

    expect(existsSync(r.path_json)).toBe(true);
    expect(existsSync(r.path_md)).toBe(true);
    expect(r.envelope_count).toBe(3);
    expect(r.oldest_timestamp).not.toBeNull();
    expect(r.newest_timestamp).not.toBeNull();

    const json = JSON.parse(readFileSync(r.path_json, "utf-8"));
    expect(json.envelopes).toHaveLength(3);
    expect(json.envelopes[0].text).toBe("envelope 0");
    expect(json.envelopes[2].text).toBe("envelope 2");

    const md = readFileSync(r.path_md, "utf-8");
    expect(md).toContain("# cuneiform-mcp session export");
    expect(md).toContain("## test_tool —");
    expect(md).toContain("envelope 0");
    expect(md).toContain("envelope 2");
  });

  it("returns empty snapshot when buffer is empty", () => {
    const r = exportSession();
    expect(r.envelope_count).toBe(0);
    expect(r.oldest_timestamp).toBeNull();
    expect(r.newest_timestamp).toBeNull();
    const json = JSON.parse(readFileSync(r.path_json, "utf-8"));
    expect(json.envelopes).toEqual([]);
  });

  it("bufferStats reports lifetime record count", () => {
    for (let i = 0; i < 7; i++) recordEnvelope(makeEnvelope(i));
    const stats = bufferStats();
    expect(stats.record_count).toBe(7);
    expect(stats.capacity).toBeGreaterThanOrEqual(1);
  });
});
