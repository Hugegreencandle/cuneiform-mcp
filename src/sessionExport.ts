// v0.62.0 — export_session: session ring buffer + snapshot tool.
//
// T1-C from the post-JOHD upgrade plan. Solves the "bundle the session"
// affordance gap — every tool emits one envelope per call, but until now
// nothing in the MCP could roll up the last N envelopes into a reproducible
// artifact for review, paper drafting, or collaborator sharing.
//
// Mechanism: a fixed-capacity ring buffer that structuredResult() pushes
// every envelope into as a side effect. Capacity defaults to 200; override
// with CUNEIFORM_MCP_SESSION_BUFFER. The buffer is process-local — each
// MCP session has its own. Snapshot writes both JSON (machine-readable,
// full envelope preserved) and Markdown (human-readable, rendered text
// per envelope) under ~/.cache/cuneiform-mcp/sessions/.
//
// Zero new runtime deps. The hook in structuredResult() is one line.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Public types ──────────────────────────────────────────────────────────

export type SessionEnvelopeRecord = {
  timestamp: string;
  tool_name: string;
  schema: string;
  text: string;
  data: Record<string, unknown>;
  provenance: Record<string, unknown>;
  warnings?: string[];
};

export type ExportSessionResult = {
  path_json: string;
  path_md: string;
  envelope_count: number;
  buffer_capacity: number;
  oldest_timestamp: string | null;
  newest_timestamp: string | null;
};

// ─── Ring buffer (module-local, process-local) ─────────────────────────────

function defaultCapacity(): number {
  const raw = process.env.CUNEIFORM_MCP_SESSION_BUFFER;
  if (!raw) return 200;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 200;
  return n;
}

const CAPACITY = defaultCapacity();
const RING: (SessionEnvelopeRecord | null)[] = new Array(CAPACITY).fill(null);
let WRITE_HEAD = 0;
let RECORD_COUNT = 0;

/**
 * Push one envelope onto the ring. Wraps when the buffer is full —
 * oldest record overwritten silently. Called from structuredResult() in
 * src/index.ts as a side effect on every tool response.
 */
export function recordEnvelope(envelope: {
  schema: string;
  text: string;
  data: Record<string, unknown>;
  provenance: Record<string, unknown>;
  warnings?: string[];
}): void {
  const record: SessionEnvelopeRecord = {
    timestamp: new Date().toISOString(),
    tool_name: toolNameFromSchema(envelope.schema),
    schema: envelope.schema,
    text: envelope.text,
    data: envelope.data,
    provenance: envelope.provenance,
    ...(envelope.warnings && envelope.warnings.length > 0
      ? { warnings: envelope.warnings }
      : {}),
  };
  RING[WRITE_HEAD] = record;
  WRITE_HEAD = (WRITE_HEAD + 1) % CAPACITY;
  RECORD_COUNT++;
}

function toolNameFromSchema(schemaUrl: string): string {
  // schema URI shape: https://.../schemas/<tool_name>.schema.json
  const last = schemaUrl.split("/").pop() ?? "";
  return last.replace(/\.schema\.json$/, "") || "unknown";
}

/**
 * Snapshot the current buffer in chronological order (oldest first) and
 * return the envelopes as an array. Empty slots filtered out. Exposed for
 * exportSession() and for tests.
 */
export function readBuffer(): SessionEnvelopeRecord[] {
  // If we've wrapped, start at WRITE_HEAD (oldest). Otherwise start at 0.
  const wrapped = RECORD_COUNT > CAPACITY;
  const start = wrapped ? WRITE_HEAD : 0;
  const length = wrapped ? CAPACITY : Math.min(RECORD_COUNT, CAPACITY);
  const out: SessionEnvelopeRecord[] = [];
  for (let i = 0; i < length; i++) {
    const slot = RING[(start + i) % CAPACITY];
    if (slot) out.push(slot);
  }
  return out;
}

/** Test-only reset. */
export function _resetBuffer(): void {
  for (let i = 0; i < CAPACITY; i++) RING[i] = null;
  WRITE_HEAD = 0;
  RECORD_COUNT = 0;
}

export function bufferStats(): { capacity: number; record_count: number } {
  return { capacity: CAPACITY, record_count: RECORD_COUNT };
}

// ─── Cache + filename helpers ──────────────────────────────────────────────

function cacheDir(): string {
  return (
    process.env.CUNEIFORM_MCP_CACHE_DIR ||
    join(homedir(), ".cache", "cuneiform-mcp")
  );
}

function sessionsDir(): string {
  return join(cacheDir(), "sessions");
}

function sanitizeTimestamp(iso: string): string {
  // Make the ISO string filesystem-safe (drop colons, keep date sortable).
  return iso.replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");
}

// ─── Snapshot writers ──────────────────────────────────────────────────────

export function exportSession(): ExportSessionResult {
  const envelopes = readBuffer();
  const generatedAt = new Date().toISOString();
  const stamp = sanitizeTimestamp(generatedAt);

  const dir = sessionsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const pathJson = join(dir, `${stamp}.json`);
  const pathMd = join(dir, `${stamp}.md`);

  const jsonPayload = {
    generated_at: generatedAt,
    mcp_version: "0.62.0",
    buffer_capacity: CAPACITY,
    envelope_count: envelopes.length,
    oldest_timestamp: envelopes.length > 0 ? envelopes[0].timestamp : null,
    newest_timestamp:
      envelopes.length > 0 ? envelopes[envelopes.length - 1].timestamp : null,
    envelopes,
  };

  writeFileSync(pathJson, JSON.stringify(jsonPayload, null, 2));
  writeFileSync(pathMd, renderMarkdown(jsonPayload));

  return {
    path_json: pathJson,
    path_md: pathMd,
    envelope_count: envelopes.length,
    buffer_capacity: CAPACITY,
    oldest_timestamp: jsonPayload.oldest_timestamp,
    newest_timestamp: jsonPayload.newest_timestamp,
  };
}

function renderMarkdown(payload: {
  generated_at: string;
  mcp_version: string;
  buffer_capacity: number;
  envelope_count: number;
  oldest_timestamp: string | null;
  newest_timestamp: string | null;
  envelopes: SessionEnvelopeRecord[];
}): string {
  const lines: string[] = [];
  lines.push(`# cuneiform-mcp session export`);
  lines.push("");
  lines.push(`- **Generated:** ${payload.generated_at}`);
  lines.push(`- **MCP version:** ${payload.mcp_version}`);
  lines.push(
    `- **Envelopes:** ${payload.envelope_count} / ${payload.buffer_capacity}`,
  );
  if (payload.oldest_timestamp) {
    lines.push(`- **Oldest:** ${payload.oldest_timestamp}`);
    lines.push(`- **Newest:** ${payload.newest_timestamp}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const env of payload.envelopes) {
    lines.push(`## ${env.tool_name} — ${env.timestamp}`);
    lines.push("");
    lines.push("```");
    lines.push(env.text);
    lines.push("```");
    if (env.warnings && env.warnings.length > 0) {
      lines.push("");
      lines.push("**Warnings:**");
      for (const w of env.warnings) lines.push(`- ${w}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
