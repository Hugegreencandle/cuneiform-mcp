// v0.43.0 — extract_citation_network.
//
// Panel-review Tier-3 #10: bibliography mining + citation-network construction.
// Builds a scholarly-citation graph from the existing parallel datasets
// (data/biblicalParallels.json + data/mesopotamianParallels.json), each of
// which carries `scholarly_attribution[]` — biblical as strings (e.g.
// "Smith 1872 — original public recognition of …"), mesopotamian as
// {author_year, publication} objects.
//
// Network structure:
//   Nodes:
//     - parallel nodes: one per parallel entry (biblical_001, meso_007, ...)
//     - scholar nodes: one per parsed author_year (Lambert 1985, ...)
//   Edges:
//     - cites: parallel → scholar (parallel P is supported by scholar S)
//     - co_cites: scholar ↔ scholar (S1 and S2 both cited in same parallel)
//
// Useful for: (a) auto-citing methods-paper findings, (b) bibliography
// auto-completion, (c) discovering which parallels share scholarly support.

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type ScholarNode = {
  id: string;
  author_year: string;
  parallels_supported: string[];
  n_parallels: number;
};

export type ParallelNode = {
  id: string;
  source_dataset: "biblical" | "mesopotamian";
  title: string | null;
  scholars: string[];
  n_scholars: number;
};

export type CoCitationEdge = {
  scholar_a: string;
  scholar_b: string;
  shared_parallels: string[];
  weight: number;
};

export type CitationNetworkResult = {
  scholars: ScholarNode[];
  parallels: ParallelNode[];
  co_citation_edges: CoCitationEdge[];
  top_scholars_by_parallels: ScholarNode[];
  top_co_citation_pairs: CoCitationEdge[];
  bridge_scholars: ScholarNode[];
  network_stats: {
    n_scholars: number;
    n_parallels: number;
    n_co_citation_edges: number;
    n_bridge_scholars: number;
    max_scholars_per_parallel: number;
    max_parallels_per_scholar: number;
  };
  warnings: string[];
};

export type ExtractCitationNetworkOptions = {
  topK?: number;
  minBridgeReach?: number;
  filterToScholar?: string;
  filterToParallel?: string;
};

// ─── Data loading ──────────────────────────────────────────────────────────

function dataDir(): string {
  if (process.env.CUNEIFORM_MCP_DATA_DIR) return process.env.CUNEIFORM_MCP_DATA_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "..", "data"), join(here, "..", "..", "data")];
  for (const c of candidates) {
    if (existsSync(join(c, "biblicalParallels.json"))) return c;
  }
  return join(here, "..", "data");
}

type BiblicalEntry = {
  id?: string;
  biblical?: string;
  scholarly_attribution?: string[];
};

type MesoEntry = {
  id?: string;
  entity_a?: string;
  entity_b?: string;
  scholarly_attribution?: Array<{ author_year?: string; publication?: string }>;
};

let _biblicalCache: BiblicalEntry[] | null = null;
let _mesoCache: MesoEntry[] | null = null;

function loadBiblical(): BiblicalEntry[] {
  if (_biblicalCache) return _biblicalCache;
  const path = join(dataDir(), "biblicalParallels.json");
  if (!existsSync(path)) {
    _biblicalCache = [];
    return _biblicalCache;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw);
    const parsed: BiblicalEntry[] = Array.isArray(data) ? data : (data.parallels ?? []);
    _biblicalCache = parsed;
    return parsed;
  } catch {
    _biblicalCache = [];
    return [];
  }
}

function loadMeso(): MesoEntry[] {
  if (_mesoCache) return _mesoCache;
  const path = join(dataDir(), "mesopotamianParallels.json");
  if (!existsSync(path)) {
    _mesoCache = [];
    return _mesoCache;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw);
    const parsed: MesoEntry[] = Array.isArray(data) ? data : (data.parallels ?? []);
    _mesoCache = parsed;
    return parsed;
  } catch {
    _mesoCache = [];
    return [];
  }
}

export function _resetForTests(): void {
  _biblicalCache = null;
  _mesoCache = null;
}

// ─── Scholar-name extraction ───────────────────────────────────────────────

// Biblical scholar strings look like:
//   "Smith 1872 — original public recognition of the Gen 6-9 ↔ Gilgamesh XI parallel"
// or                                                                              ^^^^
//   "Lambert & Millard 1969 — *Atra-ḫasīs: …"
// We extract the leading "Author[s] YEAR" portion.
function parseAuthorYearFromBiblicalString(s: string): string | null {
  // Match leading author-and-year up to a separator (em dash, en dash, hyphen
  // surrounded by spaces, comma, colon, or "—" / "–").
  const m = /^([^—–:,]+?\s+\d{4})\s*(?:[—–:,]|$)/.exec(s.trim());
  if (!m) return null;
  return m[1].trim();
}

function extractScholarsFromEntry(
  entry: BiblicalEntry | MesoEntry,
  dataset: "biblical" | "mesopotamian",
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const attr = entry.scholarly_attribution ?? [];
  if (!Array.isArray(attr)) return out;
  for (const s of attr) {
    let authorYear: string | null = null;
    if (typeof s === "string") {
      authorYear = parseAuthorYearFromBiblicalString(s);
    } else if (s && typeof s === "object" && typeof (s as { author_year?: string }).author_year === "string") {
      authorYear = (s as { author_year: string }).author_year.trim();
    }
    if (authorYear && !seen.has(authorYear)) {
      seen.add(authorYear);
      out.push(authorYear);
    }
  }
  return out;
}

function entryId(entry: BiblicalEntry | MesoEntry, dataset: "biblical" | "mesopotamian", idx: number): string {
  const raw = entry.id;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return dataset === "biblical" ? `biblical_${String(idx + 1).padStart(3, "0")}` : `meso_${String(idx + 1).padStart(3, "0")}`;
}

function entryTitle(entry: BiblicalEntry | MesoEntry, dataset: "biblical" | "mesopotamian"): string | null {
  if (dataset === "biblical") {
    return (entry as BiblicalEntry).biblical ?? null;
  }
  const meso = entry as MesoEntry;
  if (meso.entity_a && meso.entity_b) return `${meso.entity_a} ↔ ${meso.entity_b}`;
  return meso.entity_a ?? meso.entity_b ?? null;
}

// ─── Public entry point ────────────────────────────────────────────────────

export function extractCitationNetwork(opts: ExtractCitationNetworkOptions = {}): CitationNetworkResult {
  const warnings: string[] = [];
  const topK = Math.max(1, Math.min(100, opts.topK ?? 20));
  const minBridgeReach = Math.max(2, opts.minBridgeReach ?? 3);

  const biblical = loadBiblical();
  const meso = loadMeso();
  if (biblical.length === 0 && meso.length === 0) {
    warnings.push("no parallel data found in data/biblicalParallels.json or data/mesopotamianParallels.json");
  }

  // Build parallel nodes + scholar-to-parallels map.
  const parallels: ParallelNode[] = [];
  const scholarToParallels = new Map<string, Set<string>>();
  const parallelToScholars = new Map<string, string[]>();

  for (let i = 0; i < biblical.length; i++) {
    const entry = biblical[i];
    const id = entryId(entry, "biblical", i);
    const scholars = extractScholarsFromEntry(entry, "biblical");
    parallels.push({
      id,
      source_dataset: "biblical",
      title: entryTitle(entry, "biblical"),
      scholars,
      n_scholars: scholars.length,
    });
    parallelToScholars.set(id, scholars);
    for (const s of scholars) {
      if (!scholarToParallels.has(s)) scholarToParallels.set(s, new Set());
      scholarToParallels.get(s)!.add(id);
    }
  }
  for (let i = 0; i < meso.length; i++) {
    const entry = meso[i];
    const id = entryId(entry, "mesopotamian", i);
    const scholars = extractScholarsFromEntry(entry, "mesopotamian");
    parallels.push({
      id,
      source_dataset: "mesopotamian",
      title: entryTitle(entry, "mesopotamian"),
      scholars,
      n_scholars: scholars.length,
    });
    parallelToScholars.set(id, scholars);
    for (const s of scholars) {
      if (!scholarToParallels.has(s)) scholarToParallels.set(s, new Set());
      scholarToParallels.get(s)!.add(id);
    }
  }

  // Build scholar nodes.
  const scholars: ScholarNode[] = Array.from(scholarToParallels.entries()).map(([id, ps]) => ({
    id,
    author_year: id,
    parallels_supported: Array.from(ps).sort(),
    n_parallels: ps.size,
  }));

  // Co-citation edges: for each parallel, all pairs of its scholars co-cite.
  const edgeMap = new Map<string, CoCitationEdge>();
  for (const [parallelId, scholarList] of parallelToScholars.entries()) {
    for (let i = 0; i < scholarList.length; i++) {
      for (let j = i + 1; j < scholarList.length; j++) {
        const [a, b] = [scholarList[i], scholarList[j]].sort();
        const key = `${a}|${b}`;
        let edge = edgeMap.get(key);
        if (!edge) {
          edge = { scholar_a: a, scholar_b: b, shared_parallels: [], weight: 0 };
          edgeMap.set(key, edge);
        }
        edge.shared_parallels.push(parallelId);
        edge.weight++;
      }
    }
  }
  const coCitationEdges = Array.from(edgeMap.values());

  // Filtering.
  let filteredScholars = scholars;
  let filteredParallels = parallels;
  let filteredEdges = coCitationEdges;
  if (opts.filterToScholar) {
    const target = opts.filterToScholar;
    filteredScholars = filteredScholars.filter((s) => s.id === target);
    filteredEdges = filteredEdges.filter((e) => e.scholar_a === target || e.scholar_b === target);
    const supported = new Set<string>(scholarToParallels.get(target) ?? []);
    filteredParallels = filteredParallels.filter((p) => supported.has(p.id));
  }
  if (opts.filterToParallel) {
    const target = opts.filterToParallel;
    filteredParallels = filteredParallels.filter((p) => p.id === target);
    const supportedScholars = new Set(parallelToScholars.get(target) ?? []);
    filteredScholars = filteredScholars.filter((s) => supportedScholars.has(s.id));
    filteredEdges = filteredEdges.filter((e) => e.shared_parallels.includes(target));
  }

  // Top-K rankings.
  const topScholarsByParallels = scholars
    .slice()
    .sort((a, b) => b.n_parallels - a.n_parallels || a.id.localeCompare(b.id))
    .slice(0, topK);
  const topCoCitationPairs = coCitationEdges
    .slice()
    .sort((a, b) => b.weight - a.weight || a.scholar_a.localeCompare(b.scholar_a))
    .slice(0, topK);

  // Bridge scholars: those supporting ≥ minBridgeReach parallels.
  const bridgeScholars = scholars
    .filter((s) => s.n_parallels >= minBridgeReach)
    .sort((a, b) => b.n_parallels - a.n_parallels || a.id.localeCompare(b.id));

  const maxScholarsPerParallel = parallels.reduce((m, p) => Math.max(m, p.n_scholars), 0);
  const maxParallelsPerScholar = scholars.reduce((m, s) => Math.max(m, s.n_parallels), 0);

  return {
    scholars: filteredScholars.sort((a, b) => b.n_parallels - a.n_parallels || a.id.localeCompare(b.id)),
    parallels: filteredParallels,
    co_citation_edges: filteredEdges.sort((a, b) => b.weight - a.weight || a.scholar_a.localeCompare(b.scholar_a)),
    top_scholars_by_parallels: topScholarsByParallels,
    top_co_citation_pairs: topCoCitationPairs,
    bridge_scholars: bridgeScholars,
    network_stats: {
      n_scholars: scholars.length,
      n_parallels: parallels.length,
      n_co_citation_edges: coCitationEdges.length,
      n_bridge_scholars: bridgeScholars.length,
      max_scholars_per_parallel: maxScholarsPerParallel,
      max_parallels_per_scholar: maxParallelsPerScholar,
    },
    warnings,
  };
}
