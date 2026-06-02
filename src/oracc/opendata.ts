// src/oracc/opendata.ts — project-aware ORACC opendata adapter.
//
// GOAL: a single ingest path that genuinely unlocks 5 target corpora (DCCLT,
// SAAo, RINAP, RIBo, CCP) WITH genre/period/provenience metadata. The PRIMARY
// data path is the build-oracc BUNDLE ZIP (src/oracc/bundle.ts):
//
//   https://build-oracc.museum.upenn.edu/json/<SLUG>.zip   (genuine PK.. zip)
//
// SLUG = project pathname with "/"->"-" (saao/saa01 -> saao-saa01.zip;
// ccp -> ccpo.zip). Each bundle carries:
//   <proj>/catalogue.json    — per-text genre/period/provenience/designation/
//                              cdli_id (the enumeration AND the metadata)
//   <proj>/corpus.json       — id -> corpusjson/<ID>.json map
//   <proj>/corpusjson/<ID>.json — the CDL edition (parseCdl, src/oracc/cdl.ts)
//
// SOURCE-PRIORITY chain per project:
//
//   1. BUNDLE (PRIMARY) — download+unzip the build-oracc zip once, cache the
//      extracted catalogue.json + corpus.json + corpusjson/*.json under
//      getCacheDir()/oracc/<SLUG>/, then enumerate from catalogue.json and read
//      editions from corpusjson/<ID>.json. genre/period/provenience ATTACH.
//   2. per-text TEI (FALLBACK) — /<proj>/tei/<id>.xml + parseOraccTei, for ids
//      NOT present in the bundle. LIVE for saao P-ids + rinap Q-ids.
//   3. pager HTML (OPTIONAL FALLBACK) — /<proj>/pager?q= scrape, only when the
//      bundle is unavailable for a project.
//
// The legacy /<proj>/corpus.json fast-path (oracc.museum.upenn.edu) remains
// DEAD (200+0B / pager-error HTML) and is retained only as the classify/probe
// helper used by the live-mirror unit tests; the live data now comes from the
// build-oracc bundle host.

import fs from "node:fs/promises";
import path from "node:path";
import { getCacheDir } from "../cache.js";
import { oraccHttpsGet, ORACC_BASE, type OraccFetchOutcome } from "./fetch.js";
import { parseOraccTei, type ParsedTei } from "./tei.js";
import { parseCdl, type ParsedCdl } from "./cdl.js";
import {
  ensureBundle,
  readCatalogue,
  readBundleEditionRaw,
  bundleSlug,
  bundleUrl,
  type CatalogueEntry,
} from "./bundle.js";

// ---------------------------------------------------------------------------
// Project registry
// ---------------------------------------------------------------------------

export type TargetProject = {
  /** Canonical pathname, e.g. "dcclt", "saao/saa01", "rinap/rinap1". */
  pathname: string;
  /** Human label. */
  label: string;
  /**
   * Pattern hint for nested sub-projects (e.g. saao has saa01..saa21). The
   * registry lists representative entries; callers pass the exact sub-project
   * pathname. This is documentation, not validation.
   */
  pattern?: string;
  /**
   * true => this project is NOT reachable via the UPenn mirror at all
   * (CCP). Probes short-circuit to ingest_channel:'unavailable'.
   */
  unavailable?: boolean;
  /**
   * Known-good TEI id-type from the 2026-06-02 probe, when established.
   * 'P' (saao), 'Q' (rinap), 'none' (dcclt, ribo today). undefined =>
   * determine at runtime via the capability probe.
   */
  knownTeiIdType?: "P" | "Q" | "none";
};

/**
 * The 5 target corpora. Sub-project lists are representative; pass the exact
 * nested pathname (e.g. "saao/saa05", "rinap/rinap3") to the tools.
 */
export const ORACC_TARGET_PROJECTS: TargetProject[] = [
  { pathname: "dcclt", label: "Digital Corpus of Cuneiform Lexical Texts", knownTeiIdType: "none" },
  {
    pathname: "saao/saa01",
    label: "State Archives of Assyria online (SAA 01..21)",
    pattern: "saao/saaNN",
    knownTeiIdType: "P",
  },
  {
    pathname: "rinap/rinap1",
    label: "Royal Inscriptions of the Neo-Assyrian Period (RINAP 1..5)",
    pattern: "rinap/rinapN",
    knownTeiIdType: "Q",
  },
  {
    pathname: "ribo/babylon7",
    label: "Royal Inscriptions of Babylonia online",
    pattern: "ribo/<sub>",
    knownTeiIdType: "none",
  },
  {
    // Cuneiform Commentaries Project. The build-oracc bundle SLUG is "ccpo"
    // (ccp.zip is HTTP 500; ccpo.zip is 200). bundleSlug() maps "ccp"->"ccpo".
    pathname: "ccp",
    label: "Cuneiform Commentaries Project (build-oracc slug: ccpo)",
  },
];

/** Trim leading/trailing slashes. saao//saa01/ => saao/saa01. */
export function normalizeProject(p: string): string {
  return p.replace(/^\/+|\/+$/g, "");
}

/** Registry lookup by exact pathname, then by top-level prefix (saao, rinap…). */
export function lookupProject(proj: string): TargetProject | undefined {
  const n = normalizeProject(proj);
  const exact = ORACC_TARGET_PROJECTS.find((t) => t.pathname === n);
  if (exact) return exact;
  const top = n.split("/")[0];
  return ORACC_TARGET_PROJECTS.find((t) => t.pathname.split("/")[0] === top);
}

// ---------------------------------------------------------------------------
// Capability probe
// ---------------------------------------------------------------------------

export type CorpusJsonStatus = "available" | "empty-200" | "html-error" | "fetch-failed";
export type IngestChannel = "bundle" | "corpusjson" | "tei" | "pager-only" | "unavailable";

export type ProjectCapability = {
  project: string;
  /** Result of probing /<proj>/corpus.json. */
  corpusJson: CorpusJsonStatus;
  /** TEI id-type that returns a real <TEI> body, or 'none'. */
  teiIdType: "P" | "Q" | "none";
  /** Whether the pager channel responded with a parseable pager page. */
  pagerAvailable: boolean;
  /** The chosen ingest channel given the source-priority chain. */
  ingestChannel: IngestChannel;
  /** Sample id used to probe TEI (for transparency). */
  teiSampleId?: string;
  /** Free-form notes (e.g. transient 500). */
  notes: string[];
};

/**
 * Classify a corpus.json fetch outcome. The dead opendata layer returns
 * 200 + 0 bytes OR 200 + text/html (pager-error). Real opendata is
 * 200 + application/json + non-empty body.
 */
export function classifyCorpusJson(res: OraccFetchOutcome): CorpusJsonStatus {
  if (!res.ok) return "fetch-failed";
  const ct = (res.contentType ?? "").toLowerCase();
  const len = res.body.length;
  if (len === 0) return "empty-200";
  if (ct.includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(res.body)) {
    return "html-error";
  }
  // Looks like real JSON bytes.
  return "available";
}

/**
 * Build the canonical sample-id list for a project's TEI probe. saao uses
 * P-ids, rinap uses Q-ids; when unknown we try both id-types.
 */
function teiSampleIds(proj: TargetProject | undefined): Array<{ id: string; kind: "P" | "Q" }> {
  // Known-good fixtures double as live probe ids.
  const known: Record<string, { id: string; kind: "P" | "Q" }> = {
    "saao/saa01": { id: "P224485", kind: "P" },
    "rinap/rinap1": { id: "Q003414", kind: "Q" },
  };
  if (proj && known[proj.pathname]) return [known[proj.pathname]];
  // Unknown sub-project: try a P then a Q via the pager later; here we just
  // signal "probe via pager-enumerated id" by returning [].
  return [];
}

/** TEI url for a project + id. */
export function teiUrl(proj: string, id: string): string {
  return `${ORACC_BASE}/${normalizeProject(proj)}/tei/${id}.xml`;
}

/** corpus.json url for a project. */
export function corpusJsonUrl(proj: string): string {
  return `${ORACC_BASE}/${normalizeProject(proj)}/corpus.json`;
}

/** pager url for a project + (optional) query. */
export function pagerUrl(proj: string, query = ""): string {
  return `${ORACC_BASE}/${normalizeProject(proj)}/pager?q=${encodeURIComponent(query)}`;
}

/**
 * Run the full per-project capability probe: corpus.json classify → TEI id-type
 * sample → pager check, deciding the source-priority ingest channel. Never
 * throws. Performs at most 3 live fetches (corpus.json, one TEI sample, pager).
 *
 * For unavailable registry entries (CCP) short-circuits to 'unavailable' with
 * no network calls.
 */
export async function probeProjectCapability(
  projInput: string,
  opts: { sampleId?: string } = {},
): Promise<ProjectCapability> {
  const project = normalizeProject(projInput);
  const reg = lookupProject(project);
  const notes: string[] = [];

  if (reg?.unavailable) {
    return {
      project,
      corpusJson: "fetch-failed",
      teiIdType: "none",
      pagerAvailable: false,
      ingestChannel: "unavailable",
      notes: [`${reg.pathname} is not served by the UPenn mirror (absent from projects.json).`],
    };
  }

  // 1. corpus.json fast-path detection.
  const cjRes = await oraccHttpsGet(corpusJsonUrl(project));
  const corpusJson = classifyCorpusJson(cjRes);
  if (corpusJson === "empty-200" || corpusJson === "html-error") {
    notes.push(`corpus.json ${corpusJson} — opendata JSON layer is dead upstream for this project.`);
  } else if (corpusJson === "available") {
    notes.push("corpus.json returned real JSON bytes — opendata fast-path is LIVE.");
  }

  // 2. TEI id-type sample.
  let teiIdType: "P" | "Q" | "none" = "none";
  let teiSampleId: string | undefined;
  const samples = opts.sampleId
    ? [{ id: opts.sampleId, kind: (opts.sampleId[0] === "Q" ? "Q" : "P") as "P" | "Q" }]
    : teiSampleIds(reg);
  for (const s of samples) {
    const res = await oraccHttpsGet(teiUrl(project, s.id));
    if (res.ok && res.body.includes("<TEI")) {
      teiIdType = s.kind;
      teiSampleId = s.id;
      break;
    }
  }
  if (samples.length === 0 && corpusJson !== "available") {
    // No known sample id; we can't cheaply assert TEI without enumerating the
    // pager first. Record the registry hint if present.
    if (reg?.knownTeiIdType) {
      teiIdType = reg.knownTeiIdType;
      notes.push(`TEI id-type taken from registry hint (${reg.knownTeiIdType}); not live-sampled.`);
    } else {
      notes.push("No known TEI sample id; TEI id-type undetermined without pager enumeration.");
    }
  }

  // 3. pager availability.
  const pagerRes = await oraccHttpsGet(pagerUrl(project, ""));
  const pagerAvailable = pagerRes.ok && pagerRes.body.includes("p4Pager");
  if (!pagerAvailable) {
    notes.push(
      pagerRes.ok
        ? "pager returned 200 but no p4Pager marker (format change?)."
        : `pager fetch failed (${pagerRes.status ?? "no-status"}) — likely transient 500.`,
    );
  }

  // Source-priority decision.
  let ingestChannel: IngestChannel;
  if (corpusJson === "available") ingestChannel = "corpusjson";
  else if (teiIdType !== "none") ingestChannel = "tei";
  else if (pagerAvailable) ingestChannel = "pager-only";
  else ingestChannel = "unavailable";

  return {
    project,
    corpusJson,
    teiIdType,
    pagerAvailable,
    ingestChannel,
    teiSampleId,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Text-id enumeration via the pager scrape
// ---------------------------------------------------------------------------

export type EnumerateResult = {
  project: string;
  query: string;
  /** Deduped [PQX]\d+ ids in first-seen order. */
  textIds: string[];
  /** data-imax total reported by the pager (may exceed textIds.length). */
  reportedTotal: number;
  ok: boolean;
  warnings: string[];
};

/**
 * Enumerate text ids by scraping the pager HTML (data-iref="[PQX]\d+"),
 * reusing search_oracc's extraction regex. Tolerates non-200 / transient 500
 * (returns ok:false + warning, never throws). `maxIds` caps the returned list;
 * the pager's own data-imax is surfaced as reportedTotal.
 */
export async function enumerateTextIds(
  projInput: string,
  query = "",
  maxIds = 500,
): Promise<EnumerateResult> {
  const project = normalizeProject(projInput);
  const url = pagerUrl(project, query);
  const res = await oraccHttpsGet(url);
  if (!res.ok) {
    return {
      project,
      query,
      textIds: [],
      reportedTotal: 0,
      ok: false,
      warnings: [`pager-fetch-failed${res.status ? `-${res.status}` : ""}: ${res.error}`],
    };
  }
  return parsePagerIds(res.body, project, query, maxIds);
}

/**
 * Pure parse of pager HTML into deduped ids + data-imax. Exposed for hermetic
 * unit tests against a saved pager fixture.
 */
export function parsePagerIds(
  html: string,
  project: string,
  query: string,
  maxIds = 500,
): EnumerateResult {
  const warnings: string[] = [];
  if (!html.includes("p4Pager")) {
    warnings.push("unexpected-response-shape (no p4Pager marker)");
  }
  const imaxMatch = html.match(/data-imax="(\d+)"/);
  const reportedTotal = imaxMatch ? parseInt(imaxMatch[1], 10) : 0;

  // search_oracc's id extraction: data-iref="[PQX]\d+...". Dedup, first-seen.
  const seen = new Set<string>();
  const textIds: string[] = [];
  for (const m of html.matchAll(/data-iref="([PQX]\d+)/g)) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      textIds.push(id);
      if (textIds.length >= maxIds) break;
    }
  }
  if (reportedTotal > textIds.length) {
    warnings.push(
      `pager reports ${reportedTotal} hits (data-imax) but only ${textIds.length} ids on this page — pager pagination not yet followed.`,
    );
  }
  return {
    project,
    query,
    textIds,
    reportedTotal,
    ok: textIds.length > 0,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Bundle-first project index (PRIMARY) — enumerate from catalogue.json.
// ---------------------------------------------------------------------------

export type BundleIndexResult =
  | {
      ok: true;
      project: string;
      slug: string;
      url: string;
      fromCache: boolean;
      /** Total texts catalogued (== catalogue members). */
      total: number;
      /** Editions actually present in the bundle (non-stub corpusjson files). */
      editionsAvailable: number;
      stubsSkipped: number;
      /** Paged/sampled id list with attached metadata. */
      sample: CatalogueEntry[];
      /** Genre + period histograms (top buckets), from catalogue.json. */
      genres: Record<string, number>;
      periods: Record<string, number>;
    }
  | { ok: false; project: string; slug: string; url: string; warning: string };

/**
 * PRIMARY index path: ensure the build-oracc bundle is cached, then enumerate
 * texts from its catalogue.json (id -> genre/period/provenience/designation),
 * returning counts + a paged sample with metadata. Replaces dependence on the
 * live pager (which 500s on empty q) — catalogue.json IS the enumeration.
 * Never throws.
 */
export async function bundleIndexProject(
  projInput: string,
  opts: { offset?: number; limit?: number; force?: boolean } = {},
): Promise<BundleIndexResult> {
  const project = normalizeProject(projInput);
  const slug = bundleSlug(project);
  const url = bundleUrl(project);
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 2000));

  const ens = await ensureBundle(project, { force: opts.force });
  if (!ens.ok) {
    return { ok: false, project, slug, url, warning: ens.error };
  }
  const cat = await readCatalogue(project);
  if (!cat) {
    return { ok: false, project, slug, url, warning: `bundle ingested but catalogue.json unreadable for ${slug}.` };
  }

  const genres: Record<string, number> = {};
  const periods: Record<string, number> = {};
  for (const id of cat.ids) {
    const e = cat.entries[id];
    if (e.genre) genres[e.genre] = (genres[e.genre] ?? 0) + 1;
    if (e.period) periods[e.period] = (periods[e.period] ?? 0) + 1;
  }

  const sample = cat.ids.slice(offset, offset + limit).map((id) => cat.entries[id]);

  return {
    ok: true,
    project,
    slug,
    url,
    fromCache: ens.fromCache,
    total: cat.ids.length,
    editionsAvailable: ens.manifest.editionsWritten,
    stubsSkipped: ens.manifest.stubsSkipped,
    sample,
    genres: topBuckets(genres),
    periods: topBuckets(periods),
  };
}

/** Sort a histogram desc and keep the top 15 buckets. */
function topBuckets(h: Record<string, number>, n = 15): Record<string, number> {
  return Object.fromEntries(
    Object.entries(h)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n),
  );
}

// ---------------------------------------------------------------------------
// Edition retrieval
// ---------------------------------------------------------------------------

export type FetchEditionResult =
  | {
      found: true;
      project: string;
      textId: string;
      channel: "tei" | "corpusjson" | "bundle";
      tei?: ParsedTei;
      cdl?: ParsedCdl;
      /** Attached catalogue metadata (bundle channel only). */
      meta?: CatalogueEntry;
      url: string;
    }
  | {
      found: false;
      project: string;
      textId: string;
      url: string;
      warning: string;
    };

/**
 * Fetch + parse one edition. PRIMARY: read corpusjson/<ID>.json from the cached
 * build-oracc bundle, parse via parseCdl, and ATTACH catalogue metadata
 * (genre/period/provenience) from catalogue.json. FALLBACK: live per-text TEI
 * (parseOraccTei) when the id is not present in the bundle. Never throws.
 */
export async function fetchEdition(
  projInput: string,
  textId: string,
): Promise<FetchEditionResult> {
  const project = normalizeProject(projInput);

  // 1. PRIMARY: build-oracc bundle. Ensure cached, then read the edition.
  const ens = await ensureBundle(project);
  if (ens.ok) {
    const raw = await readBundleEditionRaw(project, textId);
    if (raw) {
      let doc: unknown;
      try {
        doc = JSON.parse(raw);
      } catch {
        doc = null;
      }
      if (doc) {
        const cdl = parseCdl(doc);
        const cat = await readCatalogue(project);
        const meta = cat?.entries[textId];
        return {
          found: true,
          project,
          textId,
          channel: "bundle",
          cdl,
          ...(meta ? { meta } : {}),
          url: `${ens.manifest.url}#corpusjson/${textId}.json`,
        };
      }
    }
    // id not in bundle (or a stub) — fall through to TEI.
  }

  // 2. FALLBACK: live per-text TEI.
  const url = teiUrl(project, textId);
  const res = await oraccHttpsGet(url);
  if (!res.ok) {
    return {
      found: false,
      project,
      textId,
      url,
      warning: `not-in-bundle + tei-fetch-failed${res.status ? `-${res.status}` : ""}: ${res.error}. ${project}/${textId} is absent from the build-oracc bundle and live TEI did not resolve.`,
    };
  }
  if (!res.body || !res.body.includes("<TEI")) {
    return {
      found: false,
      project,
      textId,
      url,
      warning: `no-edition: ${project}/${textId} is not in the build-oracc bundle and has no live TEI (mirror returns 200+empty or a 404 page for unknown paths).`,
    };
  }
  const tei = parseOraccTei(res.body, textId);
  return { found: true, project, textId, channel: "tei", tei, url };
}

// ---------------------------------------------------------------------------
// corpus.json fast-path (DORMANT — auto-activates when opendata returns)
// ---------------------------------------------------------------------------

export type CorpusJsonFastPathResult = {
  project: string;
  available: boolean;
  status: CorpusJsonStatus;
  /** id -> ParsedCdl map when available; undefined when dormant. */
  editions?: Record<string, ParsedCdl>;
  note: string;
};

/**
 * Probe + (if live) parse a project's corpus.json into an id->ParsedCdl map.
 *
 * DORMANT TODAY: /<proj>/corpus.json returns 200+0bytes or text/html upstream.
 * Returns { available:false } in that state. When UPenn restores opendata and
 * the endpoint returns real JSON, this fetches it, walks its per-text corpusjson
 * map, and parses each via parseCdl — NO code change required to light up.
 *
 * The expected live shape (per Oracc opendata docs) is a project bundle whose
 * members are individual {type:"cdl", textid, cdl:[…]} documents. We support
 * two plausible container shapes defensively:
 *   - { members: { "<id>": <corpusjson> , … } }   (Oracc "members" map)
 *   - { "<id>": <corpusjson>, … }                  (flat id->doc map)
 * A single {type:"cdl"} doc (one text) is also handled.
 */
export async function corpusJsonFastPath(projInput: string): Promise<CorpusJsonFastPathResult> {
  const project = normalizeProject(projInput);
  const res = await oraccHttpsGet(corpusJsonUrl(project));
  const status = classifyCorpusJson(res);
  if (status !== "available" || !res.ok) {
    return {
      project,
      available: false,
      status,
      note:
        status === "empty-200" || status === "html-error"
          ? `corpus.json is dead upstream (${status}); CDL fast-path dormant. Falls back to TEI/pager.`
          : `corpus.json fetch failed; CDL fast-path dormant.`,
    };
  }
  // LIVE bytes — parse.
  return parseCorpusJsonBundle(res.body, project);
}

/**
 * Pure parser for a corpus.json bundle body. Separated from the fetch so it can
 * be unit-tested against a checked-in fixture the moment a real bundle shape is
 * captured. Returns available:false on unparseable JSON.
 */
export function parseCorpusJsonBundle(body: string, project: string): CorpusJsonFastPathResult {
  let doc: unknown;
  try {
    doc = JSON.parse(body);
  } catch {
    return {
      project,
      available: false,
      status: "html-error",
      note: "corpus.json body is not valid JSON; treated as unavailable.",
    };
  }
  const editions: Record<string, ParsedCdl> = {};
  const d = doc as Record<string, unknown>;

  const ingestOne = (key: string, value: unknown) => {
    const parsed = parseCdl(value);
    const id = parsed.textId ?? key;
    editions[id] = parsed;
  };

  if (d && typeof d === "object") {
    if (d.type === "cdl" && Array.isArray((d as { cdl?: unknown }).cdl)) {
      // Single-text document.
      ingestOne(((d as { textid?: string }).textid ?? project), d);
    } else if (d.members && typeof d.members === "object") {
      for (const [k, v] of Object.entries(d.members as Record<string, unknown>)) ingestOne(k, v);
    } else {
      // Flat id->doc map: only ingest values that look like cdl docs.
      for (const [k, v] of Object.entries(d)) {
        if (v && typeof v === "object" && (v as { cdl?: unknown }).cdl) ingestOne(k, v);
      }
    }
  }

  if (Object.keys(editions).length === 0) {
    return {
      project,
      available: false,
      status: "available",
      note: "corpus.json returned JSON but no recognizable CDL documents; treated as unavailable.",
    };
  }
  return {
    project,
    available: true,
    status: "available",
    editions,
    note: `corpus.json fast-path LIVE — parsed ${Object.keys(editions).length} CDL edition(s).`,
  };
}

// ---------------------------------------------------------------------------
// Cache helpers — getCacheDir()/oracc/<proj-with-slash->dash>/
// ---------------------------------------------------------------------------

/** "saao/saa01" -> "saao-saa01" for a flat on-disk directory name. */
export function projectCacheKey(proj: string): string {
  return normalizeProject(proj).replace(/\//g, "-");
}

/** Absolute cache dir for one project. */
export function projectCacheDir(proj: string): string {
  return path.join(getCacheDir(), "oracc", projectCacheKey(proj));
}

/** TTLs (ms). Manifest short (upstream volatile); editions long; negatives tiny. */
export const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const EDITION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d
export const NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1h

type CacheEntry<T> = { cachedAt: number; ttlMs: number; data: T };

async function readCache<T>(file: string): Promise<T | null> {
  try {
    const stat = await fs.stat(file);
    const raw = await fs.readFile(file, "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    const age = Date.now() - (entry.cachedAt ?? stat.mtimeMs);
    if (age < (entry.ttlMs ?? MANIFEST_TTL_MS)) return entry.data;
    return null;
  } catch {
    return null;
  }
}

async function writeCache<T>(file: string, data: T, ttlMs: number): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const entry: CacheEntry<T> = { cachedAt: Date.now(), ttlMs, data };
  await fs.writeFile(file, JSON.stringify(entry), "utf8");
}

/** manifest.json path for a project. */
export function manifestPath(proj: string): string {
  return path.join(projectCacheDir(proj), "manifest.json");
}

/** editions/<id>.json path for a project + id. */
export function editionPath(proj: string, id: string): string {
  return path.join(projectCacheDir(proj), "editions", `${id}.json`);
}

/** Read a cached manifest (capability + enumerated ids) honoring its TTL. */
export async function readManifestCache<T>(proj: string): Promise<T | null> {
  return readCache<T>(manifestPath(proj));
}

/** Write a manifest with a TTL chosen by the caller (short for negatives). */
export async function writeManifestCache<T>(proj: string, data: T, ttlMs = MANIFEST_TTL_MS): Promise<void> {
  return writeCache(manifestPath(proj), data, ttlMs);
}

/** Read a cached parsed edition honoring its TTL. */
export async function readEditionCache<T>(proj: string, id: string): Promise<T | null> {
  return readCache<T>(editionPath(proj, id));
}

/** Write a parsed edition; found:false results should use NEGATIVE_TTL_MS. */
export async function writeEditionCache<T>(proj: string, id: string, data: T, ttlMs = EDITION_TTL_MS): Promise<void> {
  return writeCache(editionPath(proj, id), data, ttlMs);
}
