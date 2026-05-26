// v0.58 — Two-tier scribal provenance (port of wallet-fingerprint v0.7
// src/provenance.mjs into the cuneiform-mcp TS codebase).
//
// Background — wallet-fingerprint's separation of `funded_by` (origin) from
// `first_out_to` (purpose-of-creation) cleanly disambiguates two questions
// that find_provenance_clusters currently conflates:
//
//   funded_by             → analog: first_copy_event
//                            the earliest *manuscript witness* of a
//                            composition — the "scribal find-spot" of the
//                            text-as-text, distinct from the modern museum
//                            prefix of any one fragment.
//   first_out_to          → analog: first_citation_target
//                            the first commentary / derivative that
//                            references this manuscript — the
//                            "purpose-of-creation" signal showing how a
//                            tablet was first reused downstream.
//
// findProvenanceClusters.ts buckets by ancient find-spot (geographic origin
// — Kuyunjik, Sippar, etc.). This module buckets by *textual* lineage event:
// where a composition first surfaces as a manuscript, and where it is first
// cited. The two cluster spaces are complementary, not redundant.
//
// TODO(tablet-metadata-shape): The canonical TabletMetadata interface in
// this repo (src/fragmentMetadata.ts:FragmentMetadata) does NOT currently
// carry per-tablet `witnesses[]` or `citations[]`/`commentary[]` arrays —
// those concepts live in the chunk-graph (see src/recensionTree.ts and
// src/citationGraph.ts), not in the eBL-derived metadata cache. Fields
// below are therefore typed `any` with the field names the spec assumes
// (`witnesses`, `citations`, `commentary`). When the upstream metadata
// shape is confirmed (or when a TabletMetadata adapter is added), replace
// the `any` type with the real interface and tighten the accessors.

import { comparePeriods } from "./periodChronology.js";
import type { TabletProvenanceInput } from "./scribalProvenanceAdapter.js";

// ─── Public types ──────────────────────────────────────────────────────────

export interface TabletProvenance {
  first_copy_event: string | null;       // earliest manuscript witness ID
  first_copy_period: string | null;      // its period (NA, NB, LB, ...)
  first_citation_target: string | null;  // first commentary/derivative tablet ID
  first_citation_period: string | null;
}

export interface BuildClustersOptions {
  minMembers?: number;
}

// Classification enum mirrors wallet-fingerprint v0.7 exactly:
//   "shared-copy-event"     ← analog of "shared-funder"
//   "shared-citation-target" ← analog of "shared-first-out"
//   "shared-both"           ← analog of "shared-both"
//   "different"             ← analog of "different"
//   "unknown"               ← analog of "unknown"
export type ProvenanceRelationship =
  | "shared-copy-event"
  | "shared-citation-target"
  | "shared-both"
  | "different"
  | "unknown";

// ─── Internal helpers ──────────────────────────────────────────────────────

// Defensive extraction of an ID-like string from a witness/citation entry
// that may be a bare string, an object with .id, .tablet_id, .museum_number,
// or .target, etc. Returns null if no usable ID can be found.
function extractId(entry: unknown): string | null {
  if (entry == null) return null;
  if (typeof entry === "string") return entry.length > 0 ? entry : null;
  if (typeof entry === "object") {
    const e = entry as Record<string, unknown>;
    for (const key of ["id", "tablet_id", "museum_number", "target", "cites", "cited_by"]) {
      const v = e[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}

// Defensive period extraction. Witness/citation entries may carry a bare
// .period string, a nested .script.period, or nothing at all. The latter
// case is handled by treating the entry as period-unknown (sorts to the
// end via comparePeriods's +Infinity sentinel).
function extractPeriod(entry: unknown): string | null {
  if (entry == null || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  if (typeof e.period === "string" && e.period.length > 0) return e.period;
  const script = e.script as Record<string, unknown> | undefined;
  if (script && typeof script.period === "string" && (script.period as string).length > 0) {
    return script.period as string;
  }
  return null;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Extract two-tier scribal provenance for a single tablet.
 *
 * - `first_copy_event`     ← the earliest manuscript witness (analog of the
 *                            wallet's first incoming funding payment).
 * - `first_citation_target` ← the earliest commentary/derivative that cites
 *                            this manuscript (analog of the wallet's first
 *                            outgoing counterparty).
 *
 * Sorting is by chronology (`comparePeriods` from periodChronology.ts);
 * entries with unknown periods sort to the end. All field access is
 * defensive — missing arrays, malformed entries, and stringly-typed
 * fields are tolerated.
 *
 * @param tablet The tablet provenance input record (adapter-built from
 *               chunkIndex co-occurrence + inverted citation graph).
 *               See scribalProvenanceAdapter.ts for construction.
 */
export function extractScribalProvenance(
  tablet: TabletProvenanceInput | null | undefined,
): TabletProvenance {
  if (tablet == null || typeof tablet !== "object") {
    return {
      first_copy_event: null,
      first_copy_period: null,
      first_citation_target: null,
      first_citation_period: null,
    };
  }

  // 1. Walk tablet.witnesses[] sorted by period ascending (older first).
  //    first_copy_event = the earliest witness's ID.
  let first_copy_event: string | null = null;
  let first_copy_period: string | null = null;
  const witnesses = Array.isArray(tablet.witnesses) ? tablet.witnesses : null;
  if (witnesses && witnesses.length > 0) {
    // Defensive copy + sort. Ties broken by ID for determinism.
    const sorted = [...witnesses].sort((a, b) => {
      const pa = extractPeriod(a);
      const pb = extractPeriod(b);
      const cmp = comparePeriods(pa, pb);
      if (cmp !== 0) return cmp;
      const ia = extractId(a) ?? "";
      const ib = extractId(b) ?? "";
      return ia.localeCompare(ib);
    });
    for (const w of sorted) {
      const id = extractId(w);
      if (id) {
        first_copy_event = id;
        first_copy_period = extractPeriod(w);
        break;
      }
    }
  }

  // 2. Walk tablet.citations[] (or tablet.commentary[]) sorted by date.
  //    first_citation_target = the earliest citing tablet's ID.
  let first_citation_target: string | null = null;
  let first_citation_period: string | null = null;
  // tablet.commentary[] is a legacy field name still tolerated for callers
  // that haven't migrated to TabletProvenanceInput (.citations[]). Access
  // defensively via index signature.
  const legacyCommentary = (tablet as unknown as Record<string, unknown>).commentary;
  const citations = Array.isArray(tablet.citations)
    ? tablet.citations
    : Array.isArray(legacyCommentary)
      ? legacyCommentary
      : null;
  if (citations && citations.length > 0) {
    const sorted = [...citations].sort((a, b) => {
      const pa = extractPeriod(a);
      const pb = extractPeriod(b);
      const cmp = comparePeriods(pa, pb);
      if (cmp !== 0) return cmp;
      const ia = extractId(a) ?? "";
      const ib = extractId(b) ?? "";
      return ia.localeCompare(ib);
    });
    for (const c of sorted) {
      const id = extractId(c);
      if (id) {
        first_citation_target = id;
        first_citation_period = extractPeriod(c);
        break;
      }
    }
  }

  return {
    first_copy_event,
    first_copy_period,
    first_citation_target,
    first_citation_period,
  };
}

/**
 * Build a per-tablet provenance index over a corpus.
 *
 * Returns Map<tablet.id, TabletProvenance>. Tablets without a discoverable
 * ID (no `.id`, `.tablet_id`, or `.museum_number`) are silently skipped —
 * they cannot be keyed.
 */
export function buildScribalProvenanceIndex(
  tablets: TabletProvenanceInput[],
): Map<string, TabletProvenance> {
  const out = new Map<string, TabletProvenance>();
  if (!Array.isArray(tablets)) return out;
  for (const tablet of tablets) {
    const id = extractId(tablet);
    if (!id) continue;
    out.set(id, extractScribalProvenance(tablet));
  }
  return out;
}

/**
 * Cluster tablets by shared `first_copy_event` (the "scribal find-spot"
 * cluster — every tablet whose earliest manuscript witness is the same).
 *
 * Mirrors wallet-fingerprint's buildProvenanceClusters pattern:
 *   - Two-pass build (one for first_copy, one for first_citation —
 *     this function returns the first_copy clusters; pair with
 *     buildFirstCitationClusters for the symmetric view).
 *   - Drop singletons (members < minMembers, default 2).
 *   - Sort cluster map by member-count descending; sort each member
 *     list lexicographically for determinism.
 */
export function buildFirstCopyClusters(
  index: Map<string, TabletProvenance>,
  opts: BuildClustersOptions = {},
): Map<string, string[]> {
  const minMembers = opts.minMembers ?? 2;
  const buckets = new Map<string, string[]>();

  for (const [tabletId, prov] of index) {
    if (!prov.first_copy_event) continue;
    let bucket = buckets.get(prov.first_copy_event);
    if (!bucket) {
      bucket = [];
      buckets.set(prov.first_copy_event, bucket);
    }
    bucket.push(tabletId);
  }

  return new Map(
    [...buckets.entries()]
      .filter(([, members]) => members.length >= minMembers)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, v]) => [k, [...v].sort()] as [string, string[]]),
  );
}

/**
 * Symmetric companion to buildFirstCopyClusters — clusters by shared
 * `first_citation_target` (every tablet first cited by the same
 * commentary). The "purpose-of-creation cluster".
 *
 * Same singleton-drop + size-descending sort as the wallet model.
 */
export function buildFirstCitationClusters(
  index: Map<string, TabletProvenance>,
  opts: BuildClustersOptions = {},
): Map<string, string[]> {
  const minMembers = opts.minMembers ?? 2;
  const buckets = new Map<string, string[]>();

  for (const [tabletId, prov] of index) {
    if (!prov.first_citation_target) continue;
    let bucket = buckets.get(prov.first_citation_target);
    if (!bucket) {
      bucket = [];
      buckets.set(prov.first_citation_target, bucket);
    }
    bucket.push(tabletId);
  }

  return new Map(
    [...buckets.entries()]
      .filter(([, members]) => members.length >= minMembers)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, v]) => [k, [...v].sort()] as [string, string[]]),
  );
}

/**
 * Classify the provenance relationship between two tablets.
 *
 * Returns one of:
 *   "shared-copy-event"      — same first_copy_event (analog: shared-funder)
 *   "shared-citation-target" — same first_citation_target (analog: shared-first-out)
 *   "shared-both"            — both match (strongest signal)
 *   "different"              — both sides have provenance but neither matches
 *   "unknown"                — at least one side is missing the relevant data
 *
 * Mirrors wallet-fingerprint v0.7 classifyPairProvenance's enum and
 * fall-through priority exactly.
 */
export function classifyTabletProvenance(
  index: Map<string, TabletProvenance>,
  a: string,
  b: string,
): ProvenanceRelationship {
  const pa = index.get(a);
  const pb = index.get(b);
  if (!pa || !pb) return "unknown";

  if (!pa.first_copy_event || !pb.first_copy_event) {
    // Fall back to first-citation matching when copy data is missing.
    if (pa.first_citation_target && pb.first_citation_target) {
      return pa.first_citation_target === pb.first_citation_target
        ? "shared-citation-target"
        : "unknown";
    }
    return "unknown";
  }

  const copyMatch = pa.first_copy_event === pb.first_copy_event;
  const citationMatch =
    !!pa.first_citation_target &&
    !!pb.first_citation_target &&
    pa.first_citation_target === pb.first_citation_target;

  if (copyMatch && citationMatch) return "shared-both";
  if (copyMatch) return "shared-copy-event";
  if (citationMatch) return "shared-citation-target";
  return "different";
}
