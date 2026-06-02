// src/oracc/bundle.ts — build-oracc BUNDLE-ZIP ingest layer (PRIMARY data path).
//
// As re-probed 2026-06-02, the canonical opendata endpoints under
// oracc.museum.upenn.edu (/<proj>/corpus.json, json.zip) are DEAD (200 + 0
// bytes / pager-error HTML). The genuine bulk source is the build-oracc host:
//
//   https://build-oracc.museum.upenn.edu/json/<SLUG>.zip
//
// SLUG rule: take the Oracc project pathname and replace every "/" with "-":
//   dcclt           -> dcclt.zip
//   saao/saa01      -> saao-saa01.zip
//   rinap/rinap1    -> rinap-rinap1.zip
//   ribo/babylon7   -> ribo-babylon7.zip
//   ccpo            -> ccpo.zip      (Cuneiform Commentaries Project — note the
//                                     trailing "o"; ccp.zip is HTTP 500)
//
// INSIDE the zip, files live under the SLASHED pathname, e.g.
//   rinap/rinap1/catalogue.json    — per-text genre/period/provenience/...
//   rinap/rinap1/corpus.json       — { members: { <ID>: "corpusjson/<ID>.json" } }
//   rinap/rinap1/corpusjson/<ID>.json — the CDL edition (some are 0-byte stubs)
//
// This module downloads the zip (binary-safe, InCommon-pinned CA bundle),
// unzips it in-memory with fflate (pure JS, no native build), and writes the
// THREE things the adapter needs into the on-disk cache:
//   <cache>/oracc/<SLUG>/catalogue.json     (enumeration + metadata)
//   <cache>/oracc/<SLUG>/corpus.json        (id -> corpusjson path map)
//   <cache>/oracc/<SLUG>/corpusjson/<ID>.json  (one file per non-stub edition)
//   <cache>/oracc/<SLUG>/.bundle-manifest.json (ingest provenance + TTL)
// Bundles are NEVER written into the repo — only into getCacheDir().
//
// Subsequent calls reuse the extracted cache (honoring a TTL); { force:true }
// re-downloads. 0-byte corpusjson stubs are skipped (never written, recorded as
// stubsSkipped).

import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { getCacheDir } from "../cache.js";
import { oraccHttpsGetBuffer, ORACC_BUILD_BASE } from "./fetch.js";

/** Trim leading/trailing slashes (shared with opendata.normalizeProject). */
function normalize(p: string): string {
  return p.replace(/^\/+|\/+$/g, "");
}

/**
 * Bundle SLUG for a project pathname: "/" -> "-".
 *   saao/saa01 -> saao-saa01 ; rinap/rinap1 -> rinap-rinap1 ; dcclt -> dcclt
 * Special-case: the Cuneiform Commentaries Project ships as "ccpo" (ccp.zip
 * is a 500), so accept "ccp" as an alias for "ccpo".
 */
export function bundleSlug(proj: string): string {
  const n = normalize(proj);
  if (n === "ccp") return "ccpo";
  return n.replace(/\//g, "-");
}

/** https://build-oracc.museum.upenn.edu/json/<SLUG>.zip */
export function bundleUrl(proj: string): string {
  return `${ORACC_BUILD_BASE}/json/${bundleSlug(proj)}.zip`;
}

/** Absolute on-disk cache dir for an extracted bundle: <cache>/oracc/<SLUG>/. */
export function bundleCacheDir(proj: string): string {
  return path.join(getCacheDir(), "oracc", bundleSlug(proj));
}

/**
 * The in-zip top-level directory for a project (where its files actually live).
 * For most projects this is the normalized slashed pathname (rinap/rinap1,
 * saao/saa01, ribo/babylon7, dcclt) — verified live. The Cuneiform Commentaries
 * Project is the exception: its bundle is ccpo.zip AND its files live under the
 * "ccpo/" directory (NOT "ccp/"), so the in-zip prefix must track the slug, not
 * the registry pathname "ccp".
 */
function inZipPrefix(proj: string): string {
  const n = normalize(proj);
  if (n === "ccp") return "ccpo";
  return n;
}

/** Bundle freshness window. Bundles are rebuilt upstream periodically; 7 days. */
export const BUNDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type BundleManifest = {
  project: string;
  slug: string;
  url: string;
  cachedAt: number;
  ttlMs: number;
  bundleBytes: number;
  editionsWritten: number;
  stubsSkipped: number;
  /** in-zip prefix used to locate files, e.g. "rinap/rinap1". */
  inZipPrefix: string;
};

export type EnsureBundleResult =
  | { ok: true; fromCache: boolean; manifest: BundleManifest; dir: string }
  | { ok: false; error: string; slug: string; url: string };

function manifestFile(proj: string): string {
  return path.join(bundleCacheDir(proj), ".bundle-manifest.json");
}

async function readBundleManifest(proj: string): Promise<BundleManifest | null> {
  try {
    const raw = await fs.readFile(manifestFile(proj), "utf8");
    const m = JSON.parse(raw) as BundleManifest;
    if (Date.now() - m.cachedAt < m.ttlMs) return m;
    return null;
  } catch {
    return null;
  }
}

/**
 * Ensure the extracted bundle for `proj` is present in the cache, downloading +
 * unzipping if absent or stale. Reuses the cache on subsequent calls; pass
 * { force:true } to bypass the cache and re-download. Never throws — all
 * failures resolve to { ok:false }.
 */
export async function ensureBundle(
  projInput: string,
  opts: { force?: boolean } = {},
): Promise<EnsureBundleResult> {
  const project = normalize(projInput);
  const slug = bundleSlug(project);
  const url = bundleUrl(project);
  const dir = bundleCacheDir(project);

  if (!opts.force) {
    const cached = await readBundleManifest(project);
    if (cached) {
      // Sanity: catalogue.json must still be on disk.
      try {
        await fs.access(path.join(dir, "catalogue.json"));
        return { ok: true, fromCache: true, manifest: cached, dir };
      } catch {
        // Cache directory was pruned out from under the manifest — re-ingest.
      }
    }
  }

  const res = await oraccHttpsGetBuffer(url);
  if (!res.ok) {
    return { ok: false, error: `bundle fetch failed (${res.status ?? "no-status"}): ${res.error}`, slug, url };
  }
  // Guard: a 200 that is HTML (e.g. an error page) is not a zip.
  const ct = (res.contentType ?? "").toLowerCase();
  const looksZip = res.body.length >= 4 && res.body[0] === 0x50 && res.body[1] === 0x4b; // "PK"
  if (!looksZip) {
    return {
      ok: false,
      error: `bundle for ${slug} is not a ZIP (content-type ${ct || "unknown"}, ${res.body.length} bytes, no PK signature) — project may not be published under build-oracc.`,
      slug,
      url,
    };
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(res.body));
  } catch (e) {
    return { ok: false, error: `unzip failed: ${e instanceof Error ? e.message : String(e)}`, slug, url };
  }

  const prefix = inZipPrefix(project);
  const dec = new TextDecoder("utf-8");

  // Fresh extract — clear any prior corpusjson dir so a force-refresh is clean.
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, "corpusjson"), { recursive: true });

  const catalogueEntry = `${prefix}/catalogue.json`;
  const corpusEntry = `${prefix}/corpus.json`;
  let wroteCatalogue = false;
  let wroteCorpus = false;
  let editionsWritten = 0;
  let stubsSkipped = 0;

  for (const [name, bytes] of Object.entries(files)) {
    if (name === catalogueEntry) {
      await fs.writeFile(path.join(dir, "catalogue.json"), Buffer.from(bytes));
      wroteCatalogue = true;
    } else if (name === corpusEntry) {
      await fs.writeFile(path.join(dir, "corpus.json"), Buffer.from(bytes));
      wroteCorpus = true;
    } else if (name.startsWith(`${prefix}/corpusjson/`) && name.endsWith(".json")) {
      if (bytes.length === 0) {
        stubsSkipped++; // 0-byte stub — skip per spec.
        continue;
      }
      const base = name.slice(name.lastIndexOf("/") + 1);
      await fs.writeFile(path.join(dir, "corpusjson", base), Buffer.from(bytes));
      editionsWritten++;
    }
    // Everything else in the bundle (indexes, geojson, portal, …) is ignored.
    void dec; // (decoder reserved for future text-side needs; keeps import honest)
  }

  if (!wroteCatalogue) {
    return {
      ok: false,
      error: `bundle ${slug} unzipped but contained no ${catalogueEntry} — unexpected layout (in-zip prefix "${prefix}" wrong?).`,
      slug,
      url,
    };
  }
  if (!wroteCorpus) {
    // corpus.json is the id->path map; not strictly required (we can scan the
    // corpusjson dir) but its absence is worth recording.
  }

  const manifest: BundleManifest = {
    project,
    slug,
    url,
    cachedAt: Date.now(),
    ttlMs: BUNDLE_TTL_MS,
    bundleBytes: res.body.length,
    editionsWritten,
    stubsSkipped,
    inZipPrefix: prefix,
  };
  await fs.writeFile(manifestFile(project), JSON.stringify(manifest), "utf8");
  return { ok: true, fromCache: false, manifest, dir };
}

// ---------------------------------------------------------------------------
// Catalogue reading — enumeration + per-text metadata.
// ---------------------------------------------------------------------------

/** The subset of a catalogue member entry the adapter surfaces. */
export type CatalogueEntry = {
  id: string;
  genre: string | null;
  period: string | null;
  provenience: string | null;
  designation: string | null;
  language: string | null;
  cdli_id: string | null;
  primary_publication: string | null;
};

/** id -> CatalogueEntry map. */
export type Catalogue = {
  project: string;
  entries: Record<string, CatalogueEntry>;
  ids: string[];
};

function pickStr(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Pure parse of a catalogue.json body into id->metadata. */
export function parseCatalogue(body: string, project: string): Catalogue {
  let doc: { members?: Record<string, Record<string, unknown>> };
  try {
    doc = JSON.parse(body);
  } catch {
    return { project, entries: {}, ids: [] };
  }
  const members = doc.members && typeof doc.members === "object" ? doc.members : {};
  const entries: Record<string, CatalogueEntry> = {};
  const ids: string[] = [];
  for (const [id, raw] of Object.entries(members)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    entries[id] = {
      id,
      genre: pickStr(o, "genre"),
      period: pickStr(o, "period"),
      provenience: pickStr(o, "provenience"),
      designation: pickStr(o, "designation"),
      language: pickStr(o, "language"),
      cdli_id: pickStr(o, "cdli_id"),
      primary_publication: pickStr(o, "primary_publication"),
    };
    ids.push(id);
  }
  return { project, entries, ids };
}

/** Read + parse the cached catalogue.json for a project. */
export async function readCatalogue(projInput: string): Promise<Catalogue | null> {
  const project = normalize(projInput);
  try {
    const body = await fs.readFile(path.join(bundleCacheDir(project), "catalogue.json"), "utf8");
    return parseCatalogue(body, project);
  } catch {
    return null;
  }
}

/**
 * Read one cached corpusjson edition body for a project + id. Returns null when
 * the id is not in the bundle (so callers can fall back to live TEI).
 */
export async function readBundleEditionRaw(projInput: string, id: string): Promise<string | null> {
  const project = normalize(projInput);
  try {
    return await fs.readFile(path.join(bundleCacheDir(project), "corpusjson", `${id}.json`), "utf8");
  } catch {
    return null;
  }
}
