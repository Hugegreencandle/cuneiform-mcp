// Shared types for v0.5 structured responses.
//
// Every tool response includes a `structuredContent` envelope alongside the
// rendered text. The envelope makes results inspectable, citeable, and
// reproducible — downstream agents can chain on typed fields instead of
// regex-parsing markdown.
//
// MCP SDK 1.29.0 supports `structuredContent` natively (spec rev 2025-06-18).
// Each tool's data shape has a matching JSON Schema in /schemas. The schema
// identifier in `envelope.schema` is a stable URI that resolves to that file.

/** ISO 8601 timestamp string. */
export type Timestamp = string;

/**
 * eBL's representation of a museum number. Caught us out in the gap-probe —
 * /fragments/{id} returns this as a nested object inside joins[i].museumNumber,
 * NOT a string. Treat as load-bearing for anyone walking the joins graph.
 */
export type MuseumNumberObject = {
  prefix: string;
  number: string;
  suffix: string;
};

export function museumNumberToString(mn: MuseumNumberObject | string): string {
  if (typeof mn === "string") return mn;
  const sfx = mn.suffix && mn.suffix.length > 0 ? "." + mn.suffix : "";
  return `${mn.prefix}.${mn.number}${sfx}`;
}

/** Sources of record for our data. */
export type SourceSystem = "eBL" | "ORACC" | "CDLI" | "OGSL" | "local";

/**
 * Source-of-record provenance attached to every structured response.
 * `source` identifies the upstream system; `endpoint` is the exact URL
 * (or "local:<index>" form when derived from cached corpus).
 */
export type Provenance = {
  source: SourceSystem;
  endpoint: string;
  fetched_at: Timestamp;
  mcp_version: string;
  /** Optional human-readable citation hint (DOI/permalink/textual reference). */
  citation?: string;
};

/**
 * Wrapper shape every tool's `structuredContent` conforms to. Generic over
 * the tool-specific `data` payload. `schema` is the stable URI of the
 * matching JSON Schema file, so consumers can validate the envelope.
 */
export type StructuredEnvelope<T> = {
  schema: string;
  data: T;
  provenance: Provenance;
  /** Truncations, fallback-path notices, partial-result warnings. */
  warnings?: string[];
};

/**
 * Stable URI prefix for cuneiform-mcp schemas. Resolves to the on-disk
 * schemas/<name>.schema.json file in this repo at the matching tag.
 */
export const SCHEMA_BASE = "https://github.com/danebrown/cuneiform-mcp/schemas";

/** Build the canonical schema identifier for a given tool name. */
export function schemaId(name: string): string {
  return `${SCHEMA_BASE}/${name}.schema.json`;
}

/** Convenience constructor for the provenance block. */
export function provenance(
  source: SourceSystem,
  endpoint: string,
  mcpVersion: string,
  extras?: { citation?: string },
): Provenance {
  return {
    source,
    endpoint,
    fetched_at: new Date().toISOString(),
    mcp_version: mcpVersion,
    ...(extras?.citation ? { citation: extras.citation } : {}),
  };
}
