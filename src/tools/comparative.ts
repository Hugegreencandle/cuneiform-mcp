// Comparative-religion tools (v0.6) — curated local datasets that surface
// Mesopotamian / Hebrew / Aramaic antediluvian-wisdom parallels with named
// scholarly attribution. Underlying data lives in /data as JSON; this module
// loads it once and exposes typed accessors.
//
// Discipline: every comparative claim carries a scholar's citation. No
// scholar, no result. This is the difference between research-grade and
// pop-comparative-religion tooling.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ---------- types ----------

export type WitnessId = "sumerian_ziusudra" | "atrahasis" | "gilgamesh_xi" | "genesis_6_9";

export type PhilologicalUncertainty = "secure" | "partial" | "fragmentary" | "reconstructed";

export type FloodCell = {
  citation: string;
  excerpt: string;
  translator?: string;
  scholarly_anchor: string;
  divergence_notes?: string[];
  philological_uncertainty?: PhilologicalUncertainty;
};

export type FloodRow = {
  episode: string;
  summary?: string;
  cells: Record<string, FloodCell | null>;
  divergence_summary?: string;
};

export type FloodDataset = {
  _meta: { description: string; compiled: string; curator_note: string };
  witnesses: WitnessId[];
  rows: FloodRow[];
};

export type ParallelType = "structural" | "lexical" | "narrative" | "topos" | "onomastic";
export type CorrespondenceStrength = "strong" | "moderate" | "weak" | "contested";
export type TransmissionHypothesis =
  | "babylonian_exile"
  | "hellenistic_continuity"
  | "aramaic_substrate"
  | "common_ancient_near_eastern_substrate"
  | "unspecified";

export type ScholarlyAttribution = {
  author_year: string;
  publication: string;
  argument_summary?: string;
};

export type ParallelCandidate = {
  mesopotamian_source: {
    text: string;
    citation: string;
    language?: "Sumerian" | "Akkadian" | "bilingual";
    approximate_date?: string;
  };
  parallel_type: ParallelType;
  correspondence_strength: CorrespondenceStrength;
  scholarly_attribution: ScholarlyAttribution[];
  transmission_hypothesis?: TransmissionHypothesis;
  notes?: string;
};

export type ParallelEntry = {
  query_match: {
    text_id: "1_enoch" | "jubilees" | "genesis" | "wisdom_of_solomon" | "ben_sira";
    passages: string[];
    topics: string[];
  };
  passage_text: string;
  passage_translator: string;
  results: ParallelCandidate[];
};

export type ParallelsDataset = {
  _meta: { description: string; compiled: string; curator_note: string; discipline_rule: string };
  parallels: ParallelEntry[];
};

export type SourceType =
  | "ritual_text"
  | "scholarly_list"
  | "myth_narrative"
  | "colophon"
  | "hellenistic_excerpt"
  | "relief"
  | "figurine_deposit"
  | "amulet"
  | "seal";

export type IconographyForm = "fish_cloaked" | "bird_headed_griffin" | "human_form" | "figurine" | "composite";

export type Attestation = {
  source: string;
  source_type: SourceType;
  citation: string;
  language?: "Sumerian" | "Akkadian" | "bilingual" | "Greek" | "n_a";
  approximate_date?: string;
  iconography?: {
    form: IconographyForm;
    ritual_function?: "apotropaic" | "protective_deposit" | "narrative_decoration" | "unspecified";
    location_in_situ?: string;
    museum_number?: string;
  };
  scholarly_anchor?: string;
  excerpt?: string;
  translator?: string;
};

export type Sage = {
  name: string;
  alt_names?: string[];
  tier: "antediluvian" | "postdiluvian";
  paired_king?: string;
  discipline_specialization?: string[];
  attestations: Attestation[];
};

export type ApkalluDataset = {
  _meta: { description: string; compiled: string; curator_note: string; iconography_note: string };
  sages: Sage[];
};

// ---------- loader ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// dist/src/tools/comparative.js → ../../data/<file>.json
// src/tools/comparative.ts → ../../data/<file>.json (when running via ts-node)
function dataPath(file: string): string {
  return resolve(__dirname, "..", "..", "data", file);
}

let _flood: FloodDataset | null = null;
let _parallels: ParallelsDataset | null = null;
let _apkallu: ApkalluDataset | null = null;

function loadJson<T>(file: string): T {
  const raw = readFileSync(dataPath(file), "utf8");
  return JSON.parse(raw) as T;
}

export function getFloodDataset(): FloodDataset {
  if (!_flood) _flood = loadJson<FloodDataset>("floodAlignment.json");
  return _flood;
}

export function getParallelsDataset(): ParallelsDataset {
  if (!_parallels) _parallels = loadJson<ParallelsDataset>("antediluvianParallels.json");
  return _parallels;
}

export function getApkalluDataset(): ApkalluDataset {
  if (!_apkallu) _apkallu = loadJson<ApkalluDataset>("apkalluAttestations.json");
  return _apkallu;
}

// ---------- tool handlers ----------

export type CompareFloodNarrativesArgs = {
  episodes?: string[];
  witnesses?: WitnessId[];
};

export function compareFloodNarratives(args: CompareFloodNarrativesArgs): {
  episodes: string[];
  witnesses: WitnessId[];
  alignment: FloodRow[];
} {
  const ds = getFloodDataset();
  const wanted_episodes = args.episodes && args.episodes.length > 0 ? new Set(args.episodes) : null;
  const wanted_witnesses = args.witnesses && args.witnesses.length > 0 ? args.witnesses : ds.witnesses;
  const wanted_set = new Set<string>(wanted_witnesses);

  const rows = ds.rows
    .filter((r) => (wanted_episodes ? wanted_episodes.has(r.episode) : true))
    .map((r) => {
      const filtered_cells: Record<string, FloodCell | null> = {};
      for (const w of wanted_witnesses) {
        if (Object.prototype.hasOwnProperty.call(r.cells, w)) {
          filtered_cells[w] = r.cells[w];
        }
      }
      return { ...r, cells: filtered_cells };
    });

  return {
    episodes: rows.map((r) => r.episode),
    witnesses: wanted_witnesses,
    alignment: rows,
  };
}

export type FindAntediluvianParallelArgs = {
  text_id: ParallelEntry["query_match"]["text_id"];
  passage?: string;
  topic?: string;
};

export function findAntediluvianParallel(args: FindAntediluvianParallelArgs): ParallelEntry | null {
  const ds = getParallelsDataset();
  const passage_lower = args.passage?.toLowerCase().trim();
  const topic_lower = args.topic?.toLowerCase().trim();

  for (const entry of ds.parallels) {
    if (entry.query_match.text_id !== args.text_id) continue;
    if (passage_lower) {
      const matches = entry.query_match.passages.some((p) => p.toLowerCase().includes(passage_lower));
      if (matches) return entry;
    }
    if (topic_lower) {
      const matches = entry.query_match.topics.some((t) => t.toLowerCase().includes(topic_lower));
      if (matches) return entry;
    }
  }
  return null;
}

export function listAntediluvianQueries(): Array<{
  text_id: ParallelEntry["query_match"]["text_id"];
  passages: string[];
  topics: string[];
}> {
  return getParallelsDataset().parallels.map((p) => ({
    text_id: p.query_match.text_id,
    passages: p.query_match.passages,
    topics: p.query_match.topics,
  }));
}

export type ApkalluAttestationsArgs = {
  sage_name?: string;
  include_iconography?: boolean;
  include_postdiluvian?: boolean;
};

export function apkalluAttestations(args: ApkalluAttestationsArgs): { sages: Sage[] } {
  const ds = getApkalluDataset();
  const include_icon = args.include_iconography !== false;
  const include_post = args.include_postdiluvian !== false;
  const wanted_name = args.sage_name?.toLowerCase().trim();

  const filtered = ds.sages.filter((s) => {
    if (!include_post && s.tier === "postdiluvian") return false;
    if (wanted_name) {
      const matches_name = s.name.toLowerCase() === wanted_name;
      const matches_alt = (s.alt_names ?? []).some((a) => a.toLowerCase().includes(wanted_name));
      if (!matches_name && !matches_alt) return false;
    }
    return true;
  });

  if (include_icon) return { sages: filtered };

  return {
    sages: filtered.map((s) => ({
      ...s,
      attestations: s.attestations.map((a) => {
        if (a.iconography) {
          const { iconography: _drop, ...rest } = a;
          return rest;
        }
        return a;
      }),
    })),
  };
}

// ---------- rendering ----------

export function renderFloodMatrix(result: ReturnType<typeof compareFloodNarratives>): string {
  const lines: string[] = [];
  lines.push(`Flood-narrative alignment — ${result.episodes.length} episode(s), ${result.witnesses.length} witness(es)`);
  lines.push("");
  for (const row of result.alignment) {
    lines.push(`## ${row.episode}`);
    if (row.summary) lines.push(`  _${row.summary}_`);
    for (const w of result.witnesses) {
      const cell = row.cells[w];
      if (cell === null || cell === undefined) {
        lines.push(`  • ${w}: (absent / not preserved)`);
      } else {
        lines.push(`  • ${w} [${cell.philological_uncertainty ?? "n/a"}] — ${cell.citation}`);
        lines.push(`    ${cell.excerpt}`);
        lines.push(`    anchor: ${cell.scholarly_anchor}`);
      }
    }
    if (row.divergence_summary) {
      lines.push(`  divergence: ${row.divergence_summary}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderParallelEntry(entry: ParallelEntry | null, query: { text_id: string; passage?: string; topic?: string }): string {
  if (!entry) {
    return `No curated parallel found for text_id=${query.text_id}${query.passage ? `, passage=${query.passage}` : ""}${query.topic ? `, topic=${query.topic}` : ""}. Use list-queries to see what's available.`;
  }
  const lines: string[] = [];
  lines.push(`Antediluvian parallels for ${entry.query_match.text_id} → ${entry.query_match.passages.join(", ")}`);
  lines.push("");
  lines.push(`Passage (${entry.passage_translator}):`);
  lines.push(`  ${entry.passage_text}`);
  lines.push("");
  lines.push(`${entry.results.length} parallel(s) — ranked strongest first:`);
  for (const r of entry.results) {
    lines.push("");
    lines.push(`• [${r.correspondence_strength}/${r.parallel_type}] ${r.mesopotamian_source.text}`);
    lines.push(`    ${r.mesopotamian_source.citation}`);
    for (const cite of r.scholarly_attribution) {
      lines.push(`    scholar: ${cite.author_year} — ${cite.publication}`);
      if (cite.argument_summary) lines.push(`      → ${cite.argument_summary}`);
    }
    if (r.transmission_hypothesis) lines.push(`    transmission: ${r.transmission_hypothesis}`);
    if (r.notes) lines.push(`    notes: ${r.notes}`);
  }
  return lines.join("\n");
}

export function renderApkalluSages(result: ReturnType<typeof apkalluAttestations>): string {
  const lines: string[] = [];
  lines.push(`Apkallū attestations — ${result.sages.length} sage(s)`);
  lines.push("");
  for (const s of result.sages) {
    lines.push(`## ${s.name} [${s.tier}]${s.alt_names && s.alt_names.length > 0 ? ` (also: ${s.alt_names.join(", ")})` : ""}`);
    if (s.paired_king) lines.push(`  paired king: ${s.paired_king}`);
    if (s.discipline_specialization && s.discipline_specialization.length > 0) {
      lines.push(`  disciplines: ${s.discipline_specialization.join(", ")}`);
    }
    lines.push(`  ${s.attestations.length} attestation(s):`);
    for (const a of s.attestations) {
      lines.push(`    • ${a.source} [${a.source_type}] — ${a.citation}`);
      if (a.iconography) {
        lines.push(`      iconography: ${a.iconography.form}${a.iconography.ritual_function ? ` (${a.iconography.ritual_function})` : ""}${a.iconography.museum_number ? ` — ${a.iconography.museum_number}` : ""}`);
      }
      if (a.excerpt) lines.push(`      ${a.excerpt}`);
      if (a.scholarly_anchor) lines.push(`      anchor: ${a.scholarly_anchor}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
