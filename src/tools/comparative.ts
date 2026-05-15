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

export type JewishTextId =
  | "1_enoch"
  | "jubilees"
  | "genesis"
  | "wisdom_of_solomon"
  | "ben_sira"
  | "ezekiel";

export type ParallelEntry = {
  query_match: {
    text_id: JewishTextId;
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
    wiggermann_type?: "puradu" | "bird_apkallu" | "umu_apkallu";
    ritual_function?: "apotropaic" | "protective_deposit" | "narrative_decoration" | "unspecified";
    location_in_situ?: string;
    palace_room?: string;
    bucket_and_cone_present?: boolean;
    museum_number?: string;
  };
  scholarly_anchor?: string;
  secondary_anchor?: string;
  excerpt?: string;
  translator?: string;
  epithet?: string;
  tablet_position?: string;
};

export type Sage = {
  name: string;
  alt_names?: string[];
  tier: "antediluvian" | "postdiluvian" | "collective";
  paired_king?: string;
  discipline_specialization?: string[];
  attestations: Attestation[];
};

export type ApkalluDataset = {
  _meta: { description: string; compiled: string; curator_note: string; iconography_note: string };
  sages: Sage[];
};

// ---------- v0.7 Discovery Engine types ----------

export type EntityType =
  | "deity"
  | "group"
  | "motif"
  | "narrative"
  | "iconographic_form"
  | "text"
  | "ritual"
  | "concept"
  | "place";

export type Tradition =
  | "sumerian"
  | "akkadian"
  | "ugaritic"
  | "hebrew"
  | "aramaic_jewish"
  | "greek_hellenistic"
  | "syriac_christian"
  | "other";

export type DiscoveryEntity = {
  name: string;
  type: EntityType;
  primary_brief: string;
  alt_names?: string[];
  tradition?: Tradition;
};

export type DiscoveryTrace = {
  supporting_briefs: string[];
  structural_features: string[];
  lexical_overlap?: string[];
  transmission_route?: string;
  reasoning_summary: string;
};

export type ValidationStatus = "pending" | "validated" | "rejected";
export type DiscoveryParallelType =
  | "structural"
  | "lexical"
  | "narrative"
  | "topos"
  | "onomastic"
  | "iconographic";

export type DiscoveryCandidate = {
  entity_a: DiscoveryEntity;
  entity_b: DiscoveryEntity;
  parallel_type: DiscoveryParallelType;
  discovered_by: "ai_traversal" | "human_scholar";
  confidence_score: number;
  validation_status: ValidationStatus;
  discovery_trace: DiscoveryTrace;
  suggested_anchor?: string;
  scholarly_attribution?: ScholarlyAttribution[];
  validation_log?: {
    validated_on?: string;
    validated_by?: string;
    validation_method?: string;
    rejection_reason?: string;
    inconclusive_notes?: string;
  };
  transmission_direction?: string;
  notes?: string;
};

export type DiscoveredCandidatesDataset = {
  _meta: {
    discovery_pass_date: string;
    engine_version: string;
    brief_count: number;
    dataset_count: number;
    entities_traversed: number;
    pairs_evaluated: number;
    candidates_surfaced: number;
    description: string;
  };
  candidates: DiscoveryCandidate[];
};

// ---------- v0.8 Mesopotamian-internal parallel types ----------

export type MesopotamianTradition =
  | "sumerian"
  | "akkadian"
  | "babylonian"
  | "assyrian"
  | "ugaritic"
  | "hurrian_hittite"
  | "amorite"
  | "egyptian"
  | "hellenistic_egyptian"
  | "other";

export type MesopotamianLanguage =
  | "Sumerian"
  | "Akkadian"
  | "Ugaritic"
  | "Hittite"
  | "Hurrian"
  | "Egyptian"
  | "Demotic"
  | "Coptic"
  | "Greek"
  | "bilingual";

export type MesopotamianParallelType =
  | "structural"
  | "lexical"
  | "narrative"
  | "topos"
  | "onomastic"
  | "iconographic"
  | "logographic";

export type MesopotamianTransmissionHypothesis =
  | "direct_borrowing"
  | "common_substrate"
  | "independent_typological_match"
  | "syncretism"
  | "scribal_transmission"
  | "unspecified";

export type MesopotamianEntity = {
  text: string;
  citation?: string;
  language?: MesopotamianLanguage;
  tradition: MesopotamianTradition;
  approximate_date?: string;
};

export type MesopotamianParallel = {
  id: string;
  entity_a: MesopotamianEntity;
  entity_b: MesopotamianEntity;
  parallel_type: MesopotamianParallelType;
  themes: string[];
  deities: string[];
  texts: string[];
  correspondence_strength: CorrespondenceStrength;
  scholarly_attribution: ScholarlyAttribution[];
  transmission_hypothesis?: MesopotamianTransmissionHypothesis;
  discovery_origin?: {
    discovered_by?: string;
    discovery_date?: string;
    reformulated_on?: string;
    promoted_on?: string;
    discovery_candidate_pair?: string;
  };
  notes?: string;
};

export type MesopotamianParallelsDataset = {
  _meta: { description: string; compiled: string; curator_note: string; discipline_rule: string };
  parallels: MesopotamianParallel[];
};

// ---------- v0.13 Primary-Source Discovery Engine v2.0 types ----------

export type PrimarySourceTabletRef = {
  museum_number: string;
  cdli_id?: string;
  designation?: string;
  genre?: string;
  period?: string;
  city?: string;
  language?: string;
  trigram_count?: number;
};

export type PrimarySourceMatchEvidence = {
  match_type: "sign_trigram_jaccard" | "semantic_embedding" | "lineToVec_lemma";
  jaccard: number;
  intersection_size: number;
  union_size: number;
  shared_trigram_sample?: string[];
};

export type PrimarySourceCrossBoundary = {
  different_genre: boolean;
  different_period: boolean;
  different_city: boolean;
  different_language: boolean;
};

export type PrimarySourceValidationStatus =
  | "pending"
  | "validated_as_known"
  | "validated_as_novel"
  | "rejected_as_artifact";

export type PrimarySourceParallel = {
  id: string;
  tablet_a: PrimarySourceTabletRef;
  tablet_b: PrimarySourceTabletRef;
  match_evidence: PrimarySourceMatchEvidence;
  cross_boundary: PrimarySourceCrossBoundary;
  novelty_score: number;
  discovered_by: "ai_corpus_traversal" | "human_scholar";
  discovery_date: string;
  validation_status: PrimarySourceValidationStatus;
  validation_log?: {
    validated_on?: string;
    validated_by?: string;
    validation_method?: string;
    known_publication?: string;
    rejection_reason?: string;
  };
  notes?: string;
};

export type PrimarySourceParallelsDataset = {
  _meta: {
    description: string;
    compiled: string;
    engine_version: string;
    sample_size: number;
    min_jaccard: number;
    min_intersection: number;
    min_trigram_count: number;
    random_seed: number;
    corpus_size_traversed: number;
    total_candidates_found: number;
    candidates_output: number;
    discovery_pass_duration_seconds: number;
    metadata_enrichment_status: "complete" | "partial_only_eBL" | "partial_no_metadata" | "not_yet_run";
    note: string;
  };
  parallels: PrimarySourceParallel[];
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
let _discovered: DiscoveredCandidatesDataset | null = null;
let _mesopotamian: MesopotamianParallelsDataset | null = null;
let _primarySource: PrimarySourceParallelsDataset | null = null;

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

export function getDiscoveredCandidatesDataset(): DiscoveredCandidatesDataset {
  if (!_discovered) _discovered = loadJson<DiscoveredCandidatesDataset>("discoveredCandidates.json");
  return _discovered;
}

export function getMesopotamianParallelsDataset(): MesopotamianParallelsDataset {
  if (!_mesopotamian) _mesopotamian = loadJson<MesopotamianParallelsDataset>("mesopotamianParallels.json");
  return _mesopotamian;
}

export function getPrimarySourceParallelsDataset(): PrimarySourceParallelsDataset {
  if (!_primarySource) _primarySource = loadJson<PrimarySourceParallelsDataset>("primarySourceParallels.json");
  return _primarySource;
}

export type DiscoverPrimarySourceParallelsArgs = {
  min_jaccard?: number;
  min_novelty?: number;
  cross_genre_only?: boolean;
  cross_period_only?: boolean;
  validation_status?: PrimarySourceValidationStatus | "all";
  max_results?: number;
};

export function discoverPrimarySourceParallels(args: DiscoverPrimarySourceParallelsArgs): {
  query: DiscoverPrimarySourceParallelsArgs;
  results: PrimarySourceParallel[];
  corpus_metadata: {
    total_parallels_in_corpus: number;
    engine_version: string;
    discovery_pass_date: string;
    corpus_size_traversed: number;
    metadata_enrichment_status: string;
  };
} {
  const ds = getPrimarySourceParallelsDataset();
  const min_jaccard = args.min_jaccard ?? 0;
  const min_novelty = args.min_novelty ?? 0;
  const cross_genre_only = args.cross_genre_only === true;
  const cross_period_only = args.cross_period_only === true;
  const validation_status = args.validation_status ?? "all";
  const max_results = args.max_results ?? 25;

  const filtered = ds.parallels.filter((p) => {
    if (p.match_evidence.jaccard < min_jaccard) return false;
    if (p.novelty_score < min_novelty) return false;
    if (cross_genre_only && !p.cross_boundary.different_genre) return false;
    if (cross_period_only && !p.cross_boundary.different_period) return false;
    if (validation_status !== "all" && p.validation_status !== validation_status) return false;
    return true;
  });

  filtered.sort((a, b) => b.novelty_score - a.novelty_score);
  const sliced = filtered.slice(0, max_results);

  return {
    query: {
      ...(args.min_jaccard !== undefined ? { min_jaccard } : {}),
      ...(args.min_novelty !== undefined ? { min_novelty } : {}),
      ...(args.cross_genre_only !== undefined ? { cross_genre_only } : {}),
      ...(args.cross_period_only !== undefined ? { cross_period_only } : {}),
      ...(args.validation_status !== undefined ? { validation_status } : {}),
      ...(args.max_results !== undefined ? { max_results } : {}),
    },
    results: sliced,
    corpus_metadata: {
      total_parallels_in_corpus: ds.parallels.length,
      engine_version: ds._meta.engine_version,
      discovery_pass_date: ds._meta.compiled,
      corpus_size_traversed: ds._meta.corpus_size_traversed,
      metadata_enrichment_status: ds._meta.metadata_enrichment_status,
    },
  };
}

export function renderPrimarySourceParallels(
  result: ReturnType<typeof discoverPrimarySourceParallels>,
): string {
  const lines: string[] = [];
  lines.push(
    `Primary-Source Discovery — ${result.results.length} of ${result.corpus_metadata.total_parallels_in_corpus} match the query.`,
  );
  lines.push(
    `  corpus: ${result.corpus_metadata.corpus_size_traversed} tablets traversed; pass date ${result.corpus_metadata.discovery_pass_date}; engine ${result.corpus_metadata.engine_version}`,
  );
  lines.push(`  metadata_enrichment_status: ${result.corpus_metadata.metadata_enrichment_status}`);
  lines.push("");
  if (result.results.length === 0) {
    lines.push("No parallels match. Try lowering min_jaccard or min_novelty.");
    return lines.join("\n");
  }
  lines.push(
    "All candidates are MACHINE-DISCOVERED via sign-trigram Jaccard matching; pending human-scholar validation.",
  );
  lines.push("");
  for (const p of result.results) {
    const aLabel = p.tablet_a.designation
      ? `${p.tablet_a.museum_number} (${p.tablet_a.designation})`
      : p.tablet_a.museum_number;
    const bLabel = p.tablet_b.designation
      ? `${p.tablet_b.museum_number} (${p.tablet_b.designation})`
      : p.tablet_b.museum_number;
    lines.push(`### ${p.id}: ${aLabel} ↔ ${bLabel}`);
    lines.push(
      `  jaccard=${p.match_evidence.jaccard.toFixed(3)} · intersection=${p.match_evidence.intersection_size}/${p.match_evidence.union_size} · novelty_score=${p.novelty_score.toFixed(3)}`,
    );
    if (p.match_evidence.shared_trigram_sample && p.match_evidence.shared_trigram_sample.length > 0) {
      lines.push(`  shared trigrams (sample): ${p.match_evidence.shared_trigram_sample.slice(0, 5).join(" | ")}`);
    }
    const boundary: string[] = [];
    if (p.cross_boundary.different_genre) boundary.push("different_genre");
    if (p.cross_boundary.different_period) boundary.push("different_period");
    if (p.cross_boundary.different_city) boundary.push("different_city");
    if (p.cross_boundary.different_language) boundary.push("different_language");
    if (boundary.length > 0) lines.push(`  cross-boundary: ${boundary.join(", ")}`);
    lines.push(`  validation_status: ${p.validation_status}`);
    lines.push("");
  }
  return lines.join("\n");
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

// ---------- v0.7 Discovery Engine handler ----------

export type DiscoverParallelCandidatesArgs = {
  min_confidence?: number;
  parallel_type?: DiscoveryParallelType | "all";
  validation_status?: ValidationStatus | "all";
  max_results?: number;
};

export function discoverParallelCandidates(args: DiscoverParallelCandidatesArgs): {
  query: DiscoverParallelCandidatesArgs;
  results: DiscoveryCandidate[];
  corpus_metadata: {
    brief_count: number;
    dataset_count: number;
    discovery_pass_date: string;
    engine_version: string;
    entities_traversed: number;
    candidates_in_corpus: number;
  };
} {
  const ds = getDiscoveredCandidatesDataset();
  const min_confidence = args.min_confidence ?? 0.3;
  const parallel_type = args.parallel_type ?? "all";
  const validation_status = args.validation_status ?? "pending";
  const max_results = args.max_results ?? 25;

  const filtered = ds.candidates.filter((c) => {
    if (c.confidence_score < min_confidence) return false;
    if (parallel_type !== "all" && c.parallel_type !== parallel_type) return false;
    if (validation_status !== "all" && c.validation_status !== validation_status) return false;
    return true;
  });

  filtered.sort((a, b) => b.confidence_score - a.confidence_score);
  const sliced = filtered.slice(0, max_results);

  return {
    query: {
      ...(args.min_confidence !== undefined ? { min_confidence } : {}),
      ...(args.parallel_type !== undefined ? { parallel_type } : {}),
      ...(args.validation_status !== undefined ? { validation_status } : {}),
      ...(args.max_results !== undefined ? { max_results } : {}),
    },
    results: sliced,
    corpus_metadata: {
      brief_count: ds._meta.brief_count,
      dataset_count: ds._meta.dataset_count,
      discovery_pass_date: ds._meta.discovery_pass_date,
      engine_version: ds._meta.engine_version,
      entities_traversed: ds._meta.entities_traversed,
      candidates_in_corpus: ds.candidates.length,
    },
  };
}

// ---------- v0.8 Mesopotamian-parallel handler ----------

export type FindMesopotamianParallelArgs = {
  deity_name?: string;
  theme?: string;
  tradition_pair?: string;
  text_name?: string;
  max_results?: number;
};

function normalizeTraditionPair(a: string, b: string): string {
  return [a, b].sort().join("↔");
}

function matchesTraditionPair(parallel: MesopotamianParallel, query: string): boolean {
  const qNormalized = normalizeTraditionPair(
    ...(query.split(/↔|<->|<=>|⇔|--|—|,/).map((s) => s.trim().toLowerCase()) as [string, string]),
  );
  const parallelPair = normalizeTraditionPair(
    parallel.entity_a.tradition.toLowerCase(),
    parallel.entity_b.tradition.toLowerCase(),
  );
  return parallelPair === qNormalized;
}

const STRENGTH_RANK: Record<CorrespondenceStrength, number> = {
  strong: 4,
  moderate: 3,
  weak: 2,
  contested: 1,
};

export function findMesopotamianParallel(args: FindMesopotamianParallelArgs): {
  query: FindMesopotamianParallelArgs;
  results: MesopotamianParallel[];
  corpus_metadata: {
    total_parallels: number;
    traditions_covered: string[];
    themes_covered: string[];
  };
} {
  const ds = getMesopotamianParallelsDataset();
  const max_results = args.max_results ?? 25;

  const deity = args.deity_name?.toLowerCase().trim();
  const theme = args.theme?.toLowerCase().trim();
  const textName = args.text_name?.toLowerCase().trim();
  const traditionPair = args.tradition_pair?.trim();

  const filtered = ds.parallels.filter((p) => {
    if (deity) {
      const has = p.deities.some((d) => d.toLowerCase().includes(deity));
      if (!has) return false;
    }
    if (theme) {
      const has = p.themes.some((t) => t.toLowerCase().includes(theme));
      if (!has) return false;
    }
    if (textName) {
      const has = p.texts.some((t) => t.toLowerCase().includes(textName));
      if (!has) return false;
    }
    if (traditionPair) {
      if (!matchesTraditionPair(p, traditionPair)) return false;
    }
    return true;
  });

  filtered.sort(
    (a, b) =>
      STRENGTH_RANK[b.correspondence_strength] - STRENGTH_RANK[a.correspondence_strength],
  );

  const sliced = filtered.slice(0, max_results);

  const traditionsCovered = new Set<string>();
  const themesCovered = new Set<string>();
  for (const p of ds.parallels) {
    traditionsCovered.add(p.entity_a.tradition);
    traditionsCovered.add(p.entity_b.tradition);
    for (const t of p.themes) themesCovered.add(t);
  }

  return {
    query: {
      ...(args.deity_name !== undefined ? { deity_name: args.deity_name } : {}),
      ...(args.theme !== undefined ? { theme: args.theme } : {}),
      ...(args.tradition_pair !== undefined ? { tradition_pair: args.tradition_pair } : {}),
      ...(args.text_name !== undefined ? { text_name: args.text_name } : {}),
      ...(args.max_results !== undefined ? { max_results: args.max_results } : {}),
    },
    results: sliced,
    corpus_metadata: {
      total_parallels: ds.parallels.length,
      traditions_covered: [...traditionsCovered].sort(),
      themes_covered: [...themesCovered].sort(),
    },
  };
}

export function renderMesopotamianParallels(result: ReturnType<typeof findMesopotamianParallel>): string {
  const lines: string[] = [];
  lines.push(`Mesopotamian-internal parallels — ${result.results.length} of ${result.corpus_metadata.total_parallels} match the query.`);
  const filterParts: string[] = [];
  if (result.query.deity_name) filterParts.push(`deity_name="${result.query.deity_name}"`);
  if (result.query.theme) filterParts.push(`theme="${result.query.theme}"`);
  if (result.query.tradition_pair) filterParts.push(`tradition_pair="${result.query.tradition_pair}"`);
  if (result.query.text_name) filterParts.push(`text_name="${result.query.text_name}"`);
  if (filterParts.length > 0) lines.push(`  filters: ${filterParts.join(", ")}`);
  if (result.results.length === 0) {
    lines.push("");
    lines.push("No parallels match. Try a broader query.");
    lines.push("");
    lines.push(`Available themes: ${result.corpus_metadata.themes_covered.join(", ")}`);
    lines.push(`Available traditions: ${result.corpus_metadata.traditions_covered.join(", ")}`);
    return lines.join("\n");
  }
  lines.push("");
  for (const p of result.results) {
    lines.push(`### ${p.entity_a.text.substring(0, 60)}... (${p.entity_a.tradition}) ↔ ${p.entity_b.text.substring(0, 60)}... (${p.entity_b.tradition})`);
    lines.push(`  [${p.parallel_type} / ${p.correspondence_strength}]`);
    lines.push(`  themes: ${p.themes.join(", ")}`);
    lines.push(`  deities: ${p.deities.join(", ")}`);
    lines.push(`  texts: ${p.texts.join(", ")}`);
    for (const cite of p.scholarly_attribution) {
      lines.push(`  scholar: ${cite.author_year} — ${cite.publication}`);
      if (cite.argument_summary) lines.push(`    → ${cite.argument_summary.substring(0, 200)}${cite.argument_summary.length > 200 ? "..." : ""}`);
    }
    if (p.transmission_hypothesis) lines.push(`  transmission: ${p.transmission_hypothesis}`);
    if (p.notes) lines.push(`  notes: ${p.notes.substring(0, 200)}${p.notes.length > 200 ? "..." : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function renderDiscoveredCandidates(result: ReturnType<typeof discoverParallelCandidates>): string {
  const lines: string[] = [];
  lines.push(`Discovery Engine (v0.7.0) — ${result.results.length} candidate(s) of ${result.corpus_metadata.candidates_in_corpus} in corpus`);
  lines.push(`  corpus: ${result.corpus_metadata.brief_count} briefs, ${result.corpus_metadata.entities_traversed} entities traversed`);
  lines.push(`  filters: min_confidence=${result.query.min_confidence ?? 0.3}, parallel_type=${result.query.parallel_type ?? "all"}, validation_status=${result.query.validation_status ?? "pending"}`);
  lines.push("");
  lines.push("Each candidate is MACHINE-DISCOVERED via structural-pattern matching over the corpus.");
  lines.push("Status: pending human-scholar validation. Suggested anchors are pointers, NOT citations.");
  lines.push("");
  for (const c of result.results) {
    lines.push(`### ${c.entity_a.name} (${c.entity_a.tradition}) ↔ ${c.entity_b.name} (${c.entity_b.tradition})`);
    lines.push(`  [${c.parallel_type} / confidence ${c.confidence_score.toFixed(2)} / ${c.validation_status}]`);
    lines.push(`  Reasoning: ${c.discovery_trace.reasoning_summary}`);
    lines.push(`  Structural features: ${c.discovery_trace.structural_features.join("; ")}`);
    if (c.discovery_trace.lexical_overlap && c.discovery_trace.lexical_overlap.length > 0) {
      lines.push(`  Lexical overlap: ${c.discovery_trace.lexical_overlap.join(", ")}`);
    }
    lines.push(`  Supporting briefs: ${c.discovery_trace.supporting_briefs.join(", ")}`);
    if (c.discovery_trace.transmission_route) lines.push(`  Transmission: ${c.discovery_trace.transmission_route}`);
    if (c.suggested_anchor) lines.push(`  Suggested anchor: ${c.suggested_anchor}`);
    if (c.notes) lines.push(`  Notes: ${c.notes}`);
    lines.push("");
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
