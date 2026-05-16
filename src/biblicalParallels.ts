// v0.14.3 — Mesopotamian ↔ Hebrew Bible parallel finder.
//
// Wraps the curated data/biblicalParallels.json dataset (15 canonical
// parallels staged in commit 29b4c4c). Supports lookup by:
//   - biblical_reference  ("Gen 6:9", "Genesis 6", "Job 3", "Eccl 1:9")
//   - theme               ("flood", "creation", "wisdom", "throne-chariot")
//   - mesopotamian_source ("Atrahasis", "Gilgamesh", "Enuma Elish")
//
// All matchers are substring + light-normalization based. The dataset is
// small (~15 parallels) so linear scan is appropriate. Result objects
// are passed through verbatim from the JSON.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────

export type MesopotamianSource = {
  text: string;
  tablet_reference: string;
  summary: string;
  brief_in_vault: string;
};

export type BiblicalParallel = {
  id: string;
  biblical: {
    reference: string;
    theme: string;
    summary: string;
  };
  mesopotamian_sources: MesopotamianSource[];
  shared_elements: string[];
  scholarly_attribution: string[];
  confidence: "strong" | "moderate" | "weak";
  transmission_hypothesis: string;
};

export type ParallelDataset = {
  _meta: {
    compiled: string;
    compiler: string;
    discipline: string;
    notes: string;
  };
  parallels: BiblicalParallel[];
};

// ─── Data loading (lazy, cached) ───────────────────────────────────────────

let _dataset: ParallelDataset | null = null;
let _loadError: Error | null = null;

function dataPath(): string {
  return join(import.meta.dirname ?? process.cwd(), "..", "data", "biblicalParallels.json");
}

export function loadDataset(): ParallelDataset {
  if (_dataset) return _dataset;
  if (_loadError) throw _loadError;
  try {
    const path = dataPath();
    if (!existsSync(path)) {
      throw new Error(`biblicalParallels.json not found at ${path}`);
    }
    _dataset = JSON.parse(readFileSync(path, "utf-8")) as ParallelDataset;
    return _dataset;
  } catch (e) {
    _loadError = e instanceof Error ? e : new Error(String(e));
    throw _loadError;
  }
}

// ─── Biblical-reference normalization ──────────────────────────────────────

// Book abbreviations the caller might pass (the dataset uses long form
// like "Genesis", "Ecclesiastes", but callers commonly type "Gen", "Eccl",
// etc.). Map abbreviation → long form.
const BOOK_ALIASES: Record<string, string> = {
  gen: "genesis",
  genesis: "genesis",
  ex: "exodus", exod: "exodus", exodus: "exodus",
  lev: "leviticus", leviticus: "leviticus",
  num: "numbers", numbers: "numbers",
  dt: "deuteronomy", deut: "deuteronomy", deuteronomy: "deuteronomy",
  josh: "joshua", joshua: "joshua",
  jdg: "judges", judges: "judges",
  "1sam": "1 samuel", "2sam": "2 samuel",
  "1ki": "1 kings", "2ki": "2 kings", "1kgs": "1 kings", "2kgs": "2 kings",
  ps: "psalm", psa: "psalm", psalm: "psalm", psalms: "psalms",
  prov: "proverbs", proverbs: "proverbs",
  eccl: "ecclesiastes", qoh: "ecclesiastes", qohelet: "ecclesiastes", ecclesiastes: "ecclesiastes",
  song: "song of songs", canticles: "song of songs",
  isa: "isaiah", isaiah: "isaiah",
  jer: "jeremiah", jeremiah: "jeremiah",
  lam: "lamentations", lamentations: "lamentations",
  ezek: "ezekiel", ezekiel: "ezekiel",
  dan: "daniel", daniel: "daniel",
  hos: "hosea", joel: "joel", amos: "amos", obad: "obadiah",
  jon: "jonah", jonah: "jonah",
  mic: "micah", nahum: "nahum", hab: "habakkuk", zeph: "zephaniah", hag: "haggai", zech: "zechariah", mal: "malachi",
  job: "job",
};

function normalizeBibRef(s: string): string {
  // Trim, lowercase, strip punctuation except chapter:verse separator
  const lc = s.trim().toLowerCase();
  // Try to match "<book> <chapter>:<verse>" or "<book> <chapter>"
  const m = lc.match(/^([1-3]?\s*[a-zA-Z]+)\s+(\d+(?::\d+(?:[-–]\d+)?)?)/);
  if (!m) return lc;
  const bookKey = m[1].replace(/\s+/g, "").toLowerCase();
  const book = BOOK_ALIASES[bookKey] || bookKey;
  return `${book} ${m[2]}`;
}

function refMatches(query: string, datasetRef: string): boolean {
  const q = normalizeBibRef(query);
  const d = datasetRef.toLowerCase();
  // First try the normalized "book chapter[:verse]" form
  if (d.includes(q)) return true;
  // Fall back to simpler substring match (handles raw "genesis 6" against "genesis 6:9–9:17")
  // Try book + chapter only
  const m = q.match(/^([\w\s]+?)\s+(\d+)/);
  if (m) {
    const looser = `${m[1]} ${m[2]}`;
    if (d.includes(looser)) return true;
    // try just book + chapter without leading book if the dataset says "gen 6"
    // (in practice dataset uses long form, so this is a no-op)
  }
  return false;
}

// ─── Public API ────────────────────────────────────────────────────────────

export type FindOptions = {
  biblical_reference?: string;
  theme?: string;
  mesopotamian_source?: string;
  confidence_min?: "weak" | "moderate" | "strong";
  max_results?: number;
};

const CONFIDENCE_RANK = { weak: 0, moderate: 1, strong: 2 };

export function findBiblicalParallel(opts: FindOptions): {
  query: FindOptions;
  match_count: number;
  parallels: BiblicalParallel[];
} {
  const dataset = loadDataset();
  const minRank = opts.confidence_min ? CONFIDENCE_RANK[opts.confidence_min] : 0;
  const maxResults = opts.max_results ?? 10;

  const matches: Array<{ parallel: BiblicalParallel; score: number }> = [];

  for (const p of dataset.parallels) {
    if (CONFIDENCE_RANK[p.confidence] < minRank) continue;
    let score = 0;

    if (opts.biblical_reference) {
      if (refMatches(opts.biblical_reference, p.biblical.reference)) {
        score += 100;
      }
      const lc = opts.biblical_reference.toLowerCase();
      if (p.biblical.theme.toLowerCase().includes(lc)) score += 25;
      if (p.biblical.summary.toLowerCase().includes(lc)) score += 10;
    }

    if (opts.theme) {
      const lc = opts.theme.toLowerCase();
      if (p.biblical.theme.toLowerCase().includes(lc)) score += 60;
      if (p.biblical.summary.toLowerCase().includes(lc)) score += 20;
      for (const el of p.shared_elements) {
        if (el.toLowerCase().includes(lc)) {
          score += 30;
          break;
        }
      }
    }

    if (opts.mesopotamian_source) {
      const lc = opts.mesopotamian_source.toLowerCase();
      for (const src of p.mesopotamian_sources) {
        if (src.text.toLowerCase().includes(lc) || src.tablet_reference.toLowerCase().includes(lc)) {
          score += 80;
          break;
        }
      }
    }

    // If no query at all, return everything
    if (!opts.biblical_reference && !opts.theme && !opts.mesopotamian_source) {
      score = 1;
    }

    if (score > 0) matches.push({ parallel: p, score });
  }

  matches.sort((a, b) => b.score - a.score);

  return {
    query: opts,
    match_count: matches.length,
    parallels: matches.slice(0, maxResults).map((m) => m.parallel),
  };
}

export function datasetStats() {
  const ds = loadDataset();
  const byConfidence: Record<string, number> = { weak: 0, moderate: 0, strong: 0 };
  const transmissionHypotheses = new Set<string>();
  let totalScholars = 0;
  for (const p of ds.parallels) {
    byConfidence[p.confidence] = (byConfidence[p.confidence] ?? 0) + 1;
    transmissionHypotheses.add(p.transmission_hypothesis);
    totalScholars += p.scholarly_attribution.length;
  }
  return {
    total_parallels: ds.parallels.length,
    compiled: ds._meta.compiled,
    by_confidence: byConfidence,
    transmission_hypotheses: [...transmissionHypotheses],
    total_scholarly_citations: totalScholars,
  };
}
