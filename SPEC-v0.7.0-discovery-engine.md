# cuneiform-mcp v0.7.0 — Discovery Engine

> *Spec, 2026-05-15. The first generative comparative-religion tool that respects the named-scholarly-attribution discipline.*

The v0.6 comparative-religion tools (`compare_flood_narratives` / `find_antediluvian_parallel` / `apkallu_attestations`) are **retrieval-only** — they return curated knowledge with named scholarly attribution. v0.7 inverts the discipline: the new tool **proposes** parallels the engine has identified through structural-pattern matching over the corpus, explicitly flagged as machine-discovered for human-scholar validation.

This is the difference between a static knowledge base and a **generative research partner**.

## The discipline reversal

| | v0.6 retrieval | v0.7 discovery |
|---|---|---|
| Returns parallels | curated by humans | discovered by AI traversal |
| `scholarly_attribution` | REQUIRED (minItems:1) | empty until validation |
| `discovered_by` field | `human_scholar` implicit | `ai_traversal` explicit |
| `validation_status` | n/a (everything validated) | `pending` / `validated` / `rejected` |
| Discipline | "no scholar, no result" | "trace required; machine-discovered explicitly second-class" |
| Use case | citation in scholarly writing | hypothesis-generation for scholarly review |

The two tiers compose: validated discoveries are promoted into the v0.6 dataset (`antediluvianParallels.json`) with a real `scholarly_attribution` once a human scholar confirms the parallel.

## The new tool

`discover_parallel_candidates(min_confidence?, parallel_type?, validation_status?, max_results?)` — schema: [schemas/discover_parallel_candidates.schema.json](schemas/discover_parallel_candidates.schema.json)

Returns machine-discovered candidate parallels from the curated corpus. Each carries:
- `entity_a` and `entity_b` — the two entities being compared, with their primary-brief sourcing
- `parallel_type` — structural / lexical / narrative / topos / onomastic / iconographic
- `discovered_by: "ai_traversal"` — explicit
- `confidence_score` — relative ranking signal (NOT probability)
- `validation_status: "pending"` — for new candidates
- `discovery_trace` — auditable reasoning: supporting briefs, structural features, lexical overlap, transmission route, reasoning summary
- `suggested_anchor` — specific scholar/publication for human reviewer to check
- `transmission_direction` — uni/bi/structural-only

## The dataset

`data/discoveredCandidates.json` — produced by a one-time discovery pass over the 24-brief corpus + 3 v0.6 datasets at session-end 2026-05-15. Each candidate has provenance back to the briefs that surfaced it.

Pre-existing curated parallels (those already in `antediluvianParallels.json`) are filtered out — the discovery engine surfaces only NEW candidates.

## The discovery process

The Phase-2 entity-extraction subagent traverses:
- 24 research briefs in `~/Desktop/Research/` (Anunnaki, Apkallu, Apkallu_Knowledge, Sumerian_Me, Sumerian_King_List, Atrahasis, Enki_Ea, The_Watchers, Cuneiform_Sumer, Adapa, Berossus, Enuma_Elish, Apkallu_Iconography, 1Enoch_Other_Books, Igigi, Inanna_Ishtar, Gilgamesh_Epic, Marduk, Bit_Meseri, Enlil, Ninhursag, Sumerian_Flood_Story, Lagash_King_List, Erra_Epic)
- 3 v0.6 curated datasets: `floodAlignment.json`, `antediluvianParallels.json`, `apkalluAttestations.json`

It produces:
- `data/entityInventory.json` — ~150-300 structured entities with type + tradition + primary-brief + cross-references
- `data/discoveredCandidates.json` — 20-50 candidate parallels with full discovery_trace

Scoring axes (each contributes to confidence_score):
- **Structural similarity** — do the entities share canonical structural features (seven-count, pre-flood timing, divine origin, antediluvian-wisdom transmission, divine-human hybridity, etc.)?
- **Lexical overlap** — do they share epithets, descriptors, or technical terms?
- **Transmission plausibility** — is there a known historical route by which the two entities might be related?

## Plausible day-one findings (predicted in advance)

- **Sebitti (destructive seven) ↔ Watchers (200 fallen angels with seven leaders)** — structural inversion of the apkallū's positive seven. Cross-tradition: Mesopotamian + Aramaic-Jewish.
- **Lagash King List's missing Flood ↔ Genesis's compressed Genesis 6** — both texts have ambiguous Flood-references that may reflect dissenting cosmological traditions.
- **Ninhursag's omega-uterus iconography ↔ apkallū's bucket-and-cone purification gesture** — both ritual-image gestures of cosmic ordering. Structural-iconographic parallel.
- **Inanna's Descent through seven gates ↔ Adapa's heavenly ascent through Anu's gate-keepers (Dumuzi + Gishzida)** — inverted-direction parallel (down vs up; mortal entering divine vs sage entering divine).
- **The Eridu / Dilmun paradise framework ↔ Genesis 2 Eden in the East** — Sumerian Flood Story specifies Dilmun "where the sun rises" as the survivor's eternal-life destination; Genesis 2:8 places Eden "in the east."
- **Erra's authorship-frame (Kabti-ilāni-Marduk) ↔ 1 Enoch's pseudepigraphic Enoch-frame** — both texts use a named figure as authorial source for content that is theologically authoritative.

These predictions are tentative — what the engine actually surfaces depends on what's in the corpus.

## Implementation

### Data shape

```ts
type DiscoveryCandidate = {
  entity_a: Entity;
  entity_b: Entity;
  parallel_type: "structural" | "lexical" | "narrative" | "topos" | "onomastic" | "iconographic";
  discovered_by: "ai_traversal" | "human_scholar";
  confidence_score: number;             // 0-1, relative ranking
  validation_status: "pending" | "validated" | "rejected";
  discovery_trace: {
    supporting_briefs: string[];        // brief filenames
    structural_features: string[];      // shared features
    lexical_overlap?: string[];         // shared terms
    transmission_route?: string;        // historical hypothesis
    reasoning_summary: string;          // ~500 chars
  };
  suggested_anchor?: string;            // scholar/publication for verification
  transmission_direction?: string;
  notes?: string;
};

type Entity = {
  name: string;
  type: "deity" | "group" | "motif" | "narrative" | "iconographic_form" | "text" | "ritual" | "concept" | "place";
  primary_brief: string;
  alt_names?: string[];
  tradition: "sumerian" | "akkadian" | "ugaritic" | "hebrew" | "aramaic_jewish" | "greek_hellenistic" | "syriac_christian" | "other";
};
```

### Handler

Single function in `src/tools/comparative.ts`:

```ts
export function discoverParallelCandidates(args: DiscoverArgs): DiscoveryResponse;
```

Loads `data/discoveredCandidates.json` (lazy-cached), applies filters (min_confidence, parallel_type, validation_status), sorts by confidence_score desc, slices to max_results.

### Registration

Added to `src/index.ts` alongside the existing 12 tools.

## Open considerations

- **Scoring quality.** The first discovery pass produces relative-ranked candidates with hand-set confidence-scores from the Phase-2 subagent. v0.8 could replace these with proper embedding-based similarity if it's worth the dependency.
- **Candidate promotion.** Once a candidate is human-scholar validated, the workflow is: add scholarly_attribution to discoveredCandidates entry, change validation_status to `validated`, optionally promote into `antediluvianParallels.json`. v0.7.0 ships without automated promotion — manual is fine for now.
- **False positives.** The engine WILL surface dubious candidates. The discipline is to keep them in `discoveredCandidates.json` with `validation_status: rejected` + a rejection-reason in `notes`, so future-Dane (or future-scholars) can see what was already considered and dismissed.

## Companion artifact

`~/Desktop/Research/DISCOVERED-CANDIDATES-2026-05-15.md` — human-readable scholar-facing document with each candidate's pair, structural reasoning, supporting evidence, confidence, suggested anchor-to-check, validation status. Generated in parallel with the MCP tool implementation.

---

*v0.7.0 is the first generative tool in cuneiform-mcp. The discipline reversal — from "no parallel without scholar" to "trace required; machine-discovered explicitly second-class" — is what makes it research-grade rather than hallucination-prone. Every candidate it surfaces is auditable back to specific briefs and specific structural features.*
