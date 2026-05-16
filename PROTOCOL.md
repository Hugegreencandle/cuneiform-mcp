# cuneiform-mcp Protocol — v0.18.3

> Every result should be inspectable, citeable, and reproducible.

This is the published interface for cuneiform-mcp's **thirty** tools. Each tool
returns BOTH a human-readable rendered text block (in the standard MCP
`content[0]` field) AND a typed `structuredContent` envelope. Downstream
agents should chain on the structured fields; the rendered text is for
direct display and back-compat with v0.4 callers.

## The envelope

Every tool emits `structuredContent` with this shape (JSON Schema at
`schemas/envelope.schema.json`):

```ts
{
  schema:     string;          // stable URI of the tool-specific schema
  data:       T;               // tool-specific payload (per-tool schema)
  provenance: Provenance;      // source system, endpoint, fetched_at, mcp_version
  warnings?:  string[];        // truncations, fallback paths, partial-result notes
}
```

`Provenance` always carries:

| field | type | meaning |
|---|---|---|
| `source` | `"eBL" \| "ORACC" \| "CDLI" \| "OGSL" \| "local"` | Upstream system. `local` for cache-derived data. |
| `endpoint` | string | Exact URL fetched, or `local:<index-name>` for cache-derived results. |
| `fetched_at` | ISO 8601 | When we made the upstream request (or read the cache). |
| `mcp_version` | string | The cuneiform-mcp version that produced this response. |
| `citation` | string (optional) | Human-readable citation hint when the upstream record has a published edition. |

## Museum numbers

eBL stores museum numbers as `{prefix, number, suffix}` triples. Tools that
deal with eBL records emit BOTH the display string AND the typed object —
this avoids a class of bugs where callers walking `joins[]` discard
entries because they assumed strings (caught us out in the P3 gap-probe).

```ts
type MuseumNumberObject = {
  prefix: string;   // e.g. "K", "BM", "VAT", "Rm"
  number: string;   // e.g. "2862", "41255"
  suffix: string;   // e.g. "A", "" (empty when absent)
};

// rendered form: `${prefix}.${number}${suffix ? "." + suffix : ""}`
// e.g. "K.5065.A", "Rm.111", "BM.41255.C"
```

## The thirty tools

> Nine corpus tools (v0.5) + three comparative-religion retrieval tools (v0.6) + two generative Discovery Engine tools (v0.7 secondary literature, v0.13 primary-source eBL corpus) + one Mesopotamian-internal retrieval tool (v0.8) + four RAG tools over the cuneiform-research markdown vault (v0.14.0) + one damaged-sign inference tool (v0.14.2) + one Mesopotamian ↔ Hebrew Bible parallel finder (v0.14.3) + one Random-Indexing semantic-embeddings tool (v0.15.0) + three Anomaly Surface tools (v0.16.0). The v0.6 + v0.8 retrieval tools require named scholarly attribution. The Discovery Engines invert that discipline: they return machine-discovered candidates flagged for human-scholar validation, with full reasoning trace. Validated discoveries promote to retrieval-tier datasets. The v0.14 RAG tools surface the author's accumulated scholarly briefs as a queryable knowledge surface, with explicit `[my synthesis]` flagging to separate the author's interpretive claims from named-scholar consensus. The v0.14.2 sign-inference engine is the first ML/statistical tool in the suite. The v0.14.3 biblical-parallel finder is a curated retrieval tool with named-Assyriologist attribution per parallel. The v0.15.0 `find_thematic_parallel` tool extends the discovery surface from lexical (trigram-Jaccard) to thematic (Random-Indexing distributional embeddings). The v0.16.0 Anomaly Surface joins both into a single discovery surface: tablets isolated in BOTH spaces are the highest-priority candidates for previously-unknown compositions.

**v0.18.3** completes the calibration-audit arc. Three calibration trains shipped between v0.18.1 and v0.18.3: (a) lacuna restorer length-factor multiplier lifted top-1 precision 22.9% → 91.7% from one line; (b) bi-orphan thematic threshold tightened 0.60 → 0.50, bi-orphan scoring rebalanced, and fuzzy_parallels run-bonus added — discovery surface converged 167 → 2 candidates; (c) the same run-bonus calibration pattern ported to find_parallel_text independently surfaces the same K.5896 + K.2761 Mīs pî discovery from both fuzzy AND exact methodologies. The calibration pattern itself is methodology-agnostic. After two audit rounds: six fixes shipped, two no-ops confirmed, all deferrals resolved. Final tally documented at `docs/v0.18.3-parallel-text-run-bonus.md`. The consolidated methods paper at `docs/methods-paper-cdlj-submission.md` (CDLJ camera-ready, ~3,800 words) is the canonical methodological output.

**v0.18.0** added three tools: `restore_lacuna_passage` (multi-sign damaged-passage predictor via parallel-template alignment + bigram beam-search fallback), `find_same_scribe_candidates` + `get_scribal_signature` (orthographic-preference clustering via per-tablet log-likelihood-ratio signature). Tools: 27 → 30.

**v0.17.1** added `reconstruct_cluster`: recursive BFS via fuzzy parallels reconstructs full manuscript-witness clusters. Seeded at BM.77056, recovers a **100+ tablet *āšipūtu* (exorcist) canon cluster spanning 20 museum-collection prefixes** — confirmed via eBL genre metadata pulls.

**v0.17.0** refines the v0.16 Anomaly Surface with 4 quality filters (formulaic / refrain_heavy / heavily_damaged / provenance_cluster) that cut bi-orphan candidates 42 → 28 by removing the false-positive classes identified in the 2026-05-16 inspection (`docs/v0.16-bi-orphan-inspection.md`). Plus a new tool `find_fuzzy_parallels` for catching manuscript siblings missed by exact trigram-Jaccard — validated on the K.2798 ↔ Si.776 pair (2.67× exact-J lift, 129 of 311 query trigrams match fuzzily). Combined with the v0.16 Anomaly Surface, this completes the discovery feedback loop: surface candidates → inspect → identify false-positive classes → filter + rescue.

**v0.16.0** added the Anomaly Surface: three tools (`find_anomalous_tablets`, `describe_anomaly`, `discovery_surface_stats`) that join the corpus-viz lexical graph (17,486 components) with the v0.15 thematic-embedding index (28,665 tablets) + tabletMetadata + v0.14.4 exclusions. Surface yields 167 corpus-wide *bi-orphans*; 42 with sign_count ≥ 100 are high-priority candidates. Top-30 list at `docs/v0.16-bi-orphan-candidates.md`; inspection findings at `docs/v0.16-bi-orphan-inspection.md`.

**v0.15.0** added Mode C semantic embeddings: Sahlgren 2005 Random Indexing over the 28,665-tablet eBL sign corpus, 300-dim, ±3 window, k=8 nonzeros, mean-centered (Mu & Viswanath 2018-lite, fixes mean-pooling collapse). Top-30 cosine neighbors precomputed per tablet. Foundation for v0.16 anomaly-surface tooling.

**v0.14.4** added a corpus-exclusion pre-filter to the Discovery Engine v2.0 (`data/corpus-exclusions.json`). All 20 Asb.* Ashurbanipal-colophon-type prototype records (Hunger 1968 BAK) are filtered out at index-build time so they cannot enter the candidate pool. This closed the colophon-template false-positive class identified in v0.13.4 calibration.


### `lookup_sign` — schema: [lookup_sign.schema.json](schemas/lookup_sign.schema.json)

Sign-list lookup with two-source fallback (OGSL Labasi warm-cache → eBL
`/api/signs`). Returns Borger ABZ + MZL + LAK + HZL + KWU + OBZL + SLLHA
cross-refs, glyph codepoints, sound values with sub-indices, logograms.

```jsonc
// example: lookup_sign({sign: "AN"}) → structuredContent.data
{
  "query": "AN",
  "name": "AN",
  "found": true,
  "source_path": "OGSL",
  "cross_refs": [{"list": "ABZ", "number": "13"}, {"list": "MZL", "number": "10"}],
  "ogsl_image": "http://labasi.acdh.oeaw.ac.at/media/sign_img/sign_013.bmp"
}
```

When the OGSL path matches, the response is intentionally slim — re-call
with `max_values` to drop into the eBL path for the full canonical record
(sound values + logograms + 7 list cross-refs). A `warnings` entry says so
explicitly.

### `search_tablets` — schema: [search_tablets.schema.json](schemas/search_tablets.schema.json)

CDLI catalog search (~350K tablets) across 8 categories: `keyword`,
`publication`, `collection`, `provenience`, `period`, `transliteration`,
`translation`, `id`. Returns CDLI integer DB ids + P/Q-numbers +
designations.

```jsonc
{
  "query": "gilgamesh",
  "category": "keyword",
  "limit": 25,
  "count_returned": 25,
  "page_estimate": {"last_page": 18, "estimate_lower": 426, "estimate_upper": 450},
  "results": [
    {"cdli_id": 273186, "p_number": "P273186", "designation": "Gilgamesh", "period": "..."},
    // ...
  ]
}
```

The `cdli_id` integer is the load-bearing field — feed it to `get_tablet`,
NOT the P-number (`/artifacts/{id}` 404s on P-numbers).

### `get_tablet` — schema: [get_tablet.schema.json](schemas/get_tablet.schema.json)

Full CDLI artifact record by integer DB id (P/Q-numbers auto-resolved via
`/search`). ATF transliteration as a structured `{line_count, lines,
truncated}` object.

```jsonc
{
  "cdli_id": 469670,
  "found": true,
  "resolved_from": "Q000364",
  "designation": "Lugal-e",
  "period": "Neo-Babylonian",
  "languages": ["Sumerian", "Akkadian"],
  "atf": {"line_count": 937, "lines": ["#tr.en: ...", ...], "truncated": true}
}
```

All error paths (resolution failure, 404, fetch error, empty body) return
`found: false` envelopes with a typed `error` string.

### `search_oracc` — schema: [search_oracc.schema.json](schemas/search_oracc.schema.json)

Full-text search within one ORACC project. Returns `hits[]` tagged by
`hit_type` (`translation` or `transliteration`).

```jsonc
{
  "query": "king",
  "project": "saao/saa01",
  "limit": 25,
  "total_hits": 571,    // data-imax from upstream
  "unique_texts": 23,
  "hits": [
    {
      "text_id": "P224485",
      "iref": "P224485.1.1",
      "citation": "SAA 01 001 line 1",
      "snippet": "[To the king] my lord...",
      "hit_type": "translation"
    }
  ]
}
```

When `total_hits > len(hits)`, the gap is surfaced as `unparsed_hits` plus a
warning — markup variants we don't yet recognize.

### `get_oracc_text` — schema: [get_oracc_text.schema.json](schemas/get_oracc_text.schema.json)

One ORACC edition (TEI XML) parsed into typed transliteration + translation.

```jsonc
{
  "project": "saao/saa01",
  "text_id": "P224485",
  "found": true,
  "title": "SAA 01 001",
  "cdli_id": "P224485",
  "transliteration": {"line_count": 71, "lines": [...], "truncated": false},
  "translation":     {"block_count": 9,  "blocks": [...], "truncated": false}
}
```

UPenn returns 200 + empty body for unknown paths — cleanly mapped to
`found: false` with a diagnostic `error`.

### `search_fragments` — schema: [search_fragments.schema.json](schemas/search_fragments.schema.json)

eBL fragment catalog search. Auto-detects museum-number vs. transliteration
queries (overridable). Each result carries both string and object forms of
the museum number.

```jsonc
{
  "query": "K.2862",
  "resolved_mode": "number",
  "limit": 20,
  "count_returned": 1,
  "match_count_total": 0,
  "fragments": [
    {
      "museum_number": "K.2862",
      "museum_number_obj": {"prefix": "K", "number": "2862", "suffix": ""},
      "match_count": 0,
      "matching_lines": []
    }
  ]
}
```

### `get_fragment` — schema: [get_fragment.schema.json](schemas/get_fragment.schema.json)

Full eBL fragment record. `joins[]` follows eBL's grouped layout; `joins_flat`
is a convenience flat list with the target's own museum number excluded.

```jsonc
{
  "museum_number_input": "K.2862",
  "found": true,
  "museum_number": "K.2862",
  "museum_number_obj": {"prefix": "K", "number": "2862", "suffix": ""},
  "publication": "...",
  "genres": [["CANONICAL", "Literature", "Narrative"]],
  "joins": [[
    {"museum_number": "K.2862", "museum_number_obj": {...}},
    {"museum_number": "K.2868", "museum_number_obj": {...}},
    {"museum_number": "K.5065.A", "museum_number_obj": {...}},
    {"museum_number": "Rm.111", "museum_number_obj": {...}}
  ]],
  "joins_flat": ["K.2868", "K.5065.A", "Rm.111"],
  "external": {"cdli_number": "P396585"},
  "dimensions_cm": {"length": {"value": 9.5}, "width": {"value": 7.0}},
  "transliteration": {"line_count": 99, "lines": [...], "truncated": true}
}
```

CANONICAL is the universal top-level genre marker — every curated-corpus
fragment carries it, so when comparing genres for overlap, skip it.

### `find_join_candidates` — schema: [find_join_candidates.schema.json](schemas/find_join_candidates.schema.json)

Local lineToVec scorer — faithful port of eBL's `LineToVecRanker`. Returns
top-K by raw overlap length AND top-K by ruling-weighted score. Use for
cross-validating against eBL's published algorithm; **recall@15 = 3.4% on
known joins** (validation 2026-05-14).

```jsonc
{
  "target": {
    "museum_number": "K.2862",
    "designation": "Lugal-e",
    "genres": ["CANONICAL → Literature → Narrative"],
    "joins_flat": ["K.2868", "K.5065.A", "Rm.111"]
  },
  "top_k": 15,
  "filters": {"filter_known_joins": false, "require_genre_overlap": false},
  "corpus_size": 36328,
  "corpus_age_ms": 47234521,
  "top_by_raw_score": [
    {"museum_number": "IM.77027", "score": 76, "weighted_score": 126, "genres": [...]}
  ],
  "top_by_weighted_score": [...]
}
```

### `find_parallel_text` — schema: [find_parallel_text.schema.json](schemas/find_parallel_text.schema.json)

Local sign-trigram Jaccard matcher — primary parallel/join discovery tool.
**~22% recall@15** on known joins (combined N=151 across two seeds, 267
known siblings; 95% CI [17%, 28%]; full writeup in
`VALIDATION-N100-2026-05-14.md`).

This is the **Phase 2 auditable-join surface**: every candidate carries
the score components so scholars can inspect WHY a candidate matched, not
just where it ranked.

```jsonc
{
  "target": {"museum_number": "K.2862", "designation": "Lugal-e", ...},
  "target_fingerprint_size": 892,
  "top_k": 15,
  "corpus_size": 35330,
  "candidates": [
    {
      "museum_number": "BM.43161",
      "jaccard": 0.0543,
      "intersection_size": 50,        // count of shared trigrams
      "union_size": 920,
      "candidate_fingerprint_size": 78,
      "shared_trigrams_sample": [     // sorted deterministically
        "ABZ1 ABZ139 ABZ589",
        "ABZ151 ABZ406 ABZ85",
        // ... up to 10
      ],
      "genres": ["CANONICAL → Literature → Narrative"]
    }
  ]
}
```

The `intersection_size` field is the load-bearing audit: a high jaccard
with `intersection_size: 2` is coincidence on a tiny shared vocabulary;
`intersection_size: 50` is real evidence. The `shared_trigrams_sample` lets
a scholar verify against the actual signs in the source manuscripts.

The X-filter (trigrams with ≥2 `X` unreadable-sign tokens dropped, shipped
2026-05-14) compresses the noise floor — median rank of known siblings is
26 with the filter, 89 without; recall@15 unchanged.

## Schemas as the contract

All nine schemas are JSON Schema 2020-12 documents. The shared envelope
and `MuseumNumber` definitions live in `envelope.schema.json` and are
`$ref`'d from the per-tool schemas. Schema `$id` URIs use the prefix
`https://github.com/danebrown/cuneiform-mcp/schemas/` — these are stable
identifiers, not necessarily live HTTP endpoints.

The `structuredResult()` helper in `src/index.ts` runtime-validates every
envelope at construction time (`schema` is an `http(s)` URI; `data` is a
non-null object; `provenance` has source/endpoint/fetched_at/mcp_version).
Violations throw synchronously and surface as MCP tool errors — schema
drift is detected at the wire, not in production.

## Versioning

This is **v0.5.0** — the first version with published structured outputs.
The MCP protocol version is fixed at `2025-06-18`. Future schema changes
will follow semver:

- **Patch** (`0.5.x`): add optional fields, fix typos in descriptions
- **Minor** (`0.x.0`): add new tools, add required fields to optional outputs
- **Major** (`x.0.0`): remove or rename fields, change required-vs-optional

`mcp_version` in every response's `provenance` block names the version that
produced it — cite that, not the date.

## Reproducibility checklist

To reproduce any response from this protocol:

1. Fetch `endpoint` directly with any HTTP client (rate-limit yourself).
2. Apply the parser logic referenced by `schema`.
3. Compare your output against the published response.

For `local:*` endpoints, run the corresponding prefetch command:
- `local:lineToVecCorpus:*` ← `node dist/index.js --prefetch`
- `local:signTrigramIndex:*` ← `node scripts/build-signs-index.mjs`

The cache state at the time of the response is captured by `fetched_at`
on the provenance plus the on-disk file's mtime; mismatch means the
response was served from a cache snapshot newer than your reproduction.

## Failure modes (warning codes)

The `warnings[]` array uses both prose strings (English) and code-style
prefixes for programmatic filtering. Codes seen across v0.5:

| code prefix | meaning |
|---|---|
| `upstream-fetch-failed` | Network error reaching the source system. |
| `upstream-http-<N>` | Upstream returned HTTP `<N>` (4xx or 5xx). |
| `corpus-cache-missing` | Local corpus needs `--prefetch`. |
| `signs-index-missing` | Sign-trigram index needs `build-signs-index.mjs`. |
| `target-enrichment-failed` | Couldn't pull the target's full eBL record. |
| `target-has-no-lineToVec` | Target fragment is untransliterated. |
| `target-has-no-trigrams` | Target fragment has no signs content. |
| `resolution-failed` | Couldn't resolve a P/Q-number to a CDLI integer id. |
| `unexpected-response-shape` | Upstream changed its markup; parser needs updating. |
| (prose) | Truncation notices, fallback-path notes, partial-result counts. |

### `compare_flood_narratives` — schema: [compare_flood_narratives.schema.json](schemas/compare_flood_narratives.schema.json)

Episode × witness alignment matrix for the four canonical Ancient Near Eastern flood narratives: Sumerian Ziusudra story, Akkadian Atra-ḫasīs, Gilgamesh Tablet XI, Hebrew Genesis 6-9. Episodes drawn from a 10-item controlled vocabulary. Each cell carries `citation`, `excerpt`, `scholarly_anchor`, optional `divergence_notes[]`, and `philological_uncertainty` (secure/partial/fragmentary/reconstructed).

Use for comparative-religion work and Genesis-6-9 source-critical background. Provenance: `source: local`, `endpoint: local:floodNarrativeIndex`. Underlying data curated from Lambert & Millard 1969, George 2003, Westermann 1984.

### `find_antediluvian_parallel` — schema: [find_antediluvian_parallel.schema.json](schemas/find_antediluvian_parallel.schema.json)

Take a passage from a Jewish/Christian antediluvian-wisdom text (1 Enoch / Jubilees / Genesis 5-6 / Wisdom of Solomon / Ben Sira) and return ranked Mesopotamian source-candidates that comparative-religion scholarship has identified as parallels. Each result names the scholar(s) who established the parallel.

**Discipline:** `scholarly_attribution[]` is `minItems: 1` — no scholar, no result. This is the difference between research-grade and pop-comparative-religion tooling.

Result fields: `parallel_type` (structural/lexical/narrative/topos/onomastic), `correspondence_strength` (strong/moderate/weak/contested), `transmission_hypothesis` (babylonian_exile / hellenistic_continuity / aramaic_substrate / common_ancient_near_eastern_substrate / unspecified).

Curated queries in v0.6.0: Genesis 5:21-24 (Enoch ascent), Genesis 6:1-4 (sons of God / Nephilim), 1 Enoch 6:1-8 (Watchers descent). Calling without `passage` or `topic` returns the list of available queries.

Provenance: `source: local`, `endpoint: local:antediluvianParallelIndex`. Underlying data curated from Lambert 1967, Kvanvig 1988, Annus 2010, Reed 2005.

### `apkallu_attestations` — schema: [apkallu_attestations.schema.json](schemas/apkallu_attestations.schema.json)

Surface named occurrences of the seven antediluvian apkallū and four named postdiluvian successor *ummânū* across the cuneiform and Hellenistic record. Per-sage entries include `paired_king` (Uruk List), `discipline_specialization[]`, and `attestations[]` across 9 source-types (ritual_text / scholarly_list / myth_narrative / colophon / hellenistic_excerpt / relief / figurine_deposit / amulet / seal).

Iconographic sub-object on visual attestations: `form` (fish_cloaked / bird_headed_griffin / human_form / figurine / composite), `ritual_function`, `location_in_situ`, `museum_number`.

Provenance: `source: local`, `endpoint: local:apkalluAttestationIndex`. Underlying data curated from Reiner 1961, Lenzi 2008, Annus 2010, Verderame 2013.

### `discover_parallel_candidates` — schema: [discover_parallel_candidates.schema.json](schemas/discover_parallel_candidates.schema.json)

The v0.7 **Discovery Engine** — the first generative comparative-religion tool. Returns machine-discovered candidate parallels from the cuneiform-mcp curated corpus, with full provenance trace. Each candidate carries `discovered_by: "ai_traversal"`, `validation_status: "pending"`, and a structural-reasoning trace.

**Discipline reversal:** where v0.6 `find_antediluvian_parallel` REQUIRES named scholarly attribution (no scholar, no result), this tool RETURNS parallels WITHOUT human-scholar validation — explicitly flagged as machine-discovered. The two tiers compose: validated candidates are promoted into v0.6's `antediluvianParallels.json` once a human scholar confirms.

Each `DiscoveryCandidate` carries:
- `entity_a` and `entity_b` — typed entities (`deity` / `group` / `motif` / `narrative` / `iconographic_form` / `text` / `ritual` / `concept` / `place`) with `primary_brief` sourcing back to `~/Desktop/Research/`
- `parallel_type` — same vocabulary as v0.6 plus `iconographic` for visual-form correspondences
- `confidence_score` — relative ranking signal (NOT probability)
- `discovery_trace` — auditable: `supporting_briefs[]`, `structural_features[]`, optional `lexical_overlap[]`, `transmission_route`, `reasoning_summary`
- `suggested_anchor` — specific scholar/publication for human reviewer to check
- `transmission_direction` — uni/bi/structural-only

v0.7.0 ships with **33 machine-discovered candidates** from a one-time AI traversal pass over 24 briefs + 3 datasets (230 entities inventoried, 720 pairs evaluated). Top three: Astronomical Book 364-day calendar ↔ Mul.Apin schematic year (0.88, structural); Bird-headed apkallu (kuribu) ↔ Cherub (Hebrew kĕrūḇ) (0.85, iconographic); Sebitti ↔ Seven Watcher Leaders (0.82, structural).

Provenance: `source: local`, `endpoint: local:discoveredCandidatesIndex`. Companion artifact at `~/Desktop/Research/DISCOVERED-CANDIDATES-2026-05-15.md` (human-readable scholar-facing review document, ~1000 lines).

### `find_mesopotamian_parallel` — schema: [find_mesopotamian_parallel.schema.json](schemas/find_mesopotamian_parallel.schema.json)

The v0.8 retrieval tool — cross-Mesopotamian-internal sibling to v0.6's `find_antediluvian_parallel`. Returns curated parallels between Mesopotamian / Hurrian-Hittite / Ugaritic figures and texts WITHOUT requiring a Jewish biblical passage as the entry-point.

**Same named-scholarship discipline as v0.6:** `scholarly_attribution.minItems: 1` enforced. No scholar, no result.

**Query keying:** Mesopotamian-internal axes (filters AND-combine):
- `deity_name` — e.g. "Marduk", "Inanna", "Bēlet-ilī" (case-insensitive substring match)
- `theme` — e.g. "chaoskampf", "divine_substitution", "mother_goddess", "named_authorship", "king_list_dissent", "descent_ascent", "succession"
- `tradition_pair` — e.g. "akkadian↔ugaritic", "sumerian↔akkadian", "hurrian_hittite↔akkadian" (order-insensitive; separator can be ↔ / <-> / <=> / ⇔ / -- / — / `,`)
- `text_name` — e.g. "Enūma Eliš", "Baal Cycle", "Erra Epic", "lugal-e"

Each `MesopotamianParallel` carries: entity_a + entity_b (both Mesopotamian/ANE), `parallel_type` (same as v0.6 plus `logographic` for cases like the DINGIR.MAḪ Hannahanna↔Bēlet-ilī equation), themes[], deities[], texts[], correspondence_strength, scholarly_attribution, transmission_hypothesis (direct_borrowing / common_substrate / syncretism / scribal_transmission / independent_typological_match), and `discovery_origin` (if promoted from Discovery Engine).

v0.8.0 dataset ships with **6 parallels** promoted from the Discovery Engine v0.7 validation pipeline:
- **mp-chaoskampf-1**: Marduk-Tiamat ↔ Baal-Yam (Gunkel 1895, Smith 1994, Day 1985)
- **mp-divine-substitution-1**: Ninurta-Asag ↔ Marduk-Tiamat (Lambert 1986, Lambert 2013, Annus 2002)
- **mp-mother-goddess-1**: Hannahanna ↔ Bēlet-ilī (von Schuler RlA, Beckman 1983, Asher-Greve & Westenholz 2013)
- **mp-named-authorship-1**: Enheduanna ↔ Kabti-ilāni-Marduk (Helle 2019, Helle 2023, Lenzi 2008)
- **mp-king-list-dissent-1**: Lagash KL ↔ SKL (Sollberger 1967, Glassner 2004)
- **mp-descent-ascent-1**: Inanna's Descent ↔ Adapa's ascent (Annus 2016) — reformulated from initial Discovery Engine framing

Provenance: `source: local`, `endpoint: local:mesopotamianParallelsIndex`.

### `discover_primary_source_parallels` — schema: [discover_primary_source_parallels.schema.json](schemas/discover_primary_source_parallels.schema.json)

The Discovery Engine **v2.0** — primary-source corpus traversal. Operates over the full eBL `/fragments/all-signs` cache (36,498 tablets), computing pairwise sign-trigram Jaccard with size-bound early termination, then enriches via per-tablet metadata (script.period, collection-as-city proxy, genres_flat) and applies cross-boundary scoring (`+0.15·diff_genre +0.10·diff_period +0.10·diff_city − 0.30·formulaic_genre_penalty`).

```jsonc
// example: discover_primary_source_parallels({min_jaccard: 0.35, validation_status: "validated_as_known"}) → structuredContent.data
{
  "query_summary": {"min_jaccard": 0.35, "validation_status": "validated_as_known"},
  "total_in_dataset": 335,
  "returned": 9,
  "parallels": [
    {
      "tablet_a": {"museum_number": "BM.43159", "period": "Neo_Babylonian", "city": "Babylon", "genre": "magical_ritual"},
      "tablet_b": {"museum_number": "K.2796",   "period": "Neo_Assyrian",  "city": "Nineveh", "genre": "magical_ritual"},
      "match_evidence": {"jaccard": 0.50, "intersection_size": 12, "union_size": 24},
      "cross_boundary": {"different_genre": false, "different_period": true, "different_city": true},
      "novelty_score": 0.700,
      "validation_status": "validated_as_known",
      "validation_log": {
        "validated_on": "2026-05-15",
        "validation_method": "Subagent WebFetched eBL records — bidirectional editor cross-reference …",
        "known_publication": "Leichty/Finkel/Walker 2019 CBT IV-V p. 536; eBL fragment records (Peterson/Jiménez/Földi 2018-2019)"
      },
      "notes": "v0.13.2 validation: 3-witness bilingual Enki incantation cluster …"
    }
    // …8 more
  ]
}
```

Calibration (2026-05-15): 11 top cross-boundary candidates manually validated. 9/11 confirmed as already-documented eBL editor cross-references (100% true-positive rate on real intertextual parallels). 2/11 surfaced a methodological discovery — Asb.* records in eBL are colophon-template prototypes (Asb.c = 212 manuscripts, Asb.d = 116 manuscripts), not individual tablets, producing systematic false-positive matches. v0.13.5 corpus-cleaning task tracks the prototype-exclusion fix.

Provenance: `source: local`, `endpoint: local:primarySourceParallelsIndex`, `citation` notes machine-discovery + pending-validation status.

## v0.14 — RAG over the cuneiform-research markdown vault

Four tools that turn ~50 author-maintained Mesopotamian scholarly briefs into a queryable knowledge surface. BM25 retrieval over chunked markdown, with named-Assyriologist citation extraction and explicit `[my synthesis]` flagging. Index built lazily on first call, cached for the process lifetime. Source directory configurable via `CUNEIFORM_RESEARCH_DIR` env var (default `~/Desktop/Research/`).

Cluster classifications (auto-detected from filename patterns):
- **cosmology** — Apsu_*, Royal_Descents, Subterranean_Cities, Anunnaki, Igigi
- **theology** — Apkallu*, Adapa, Enki*, Enlil, Inanna*, Bit_Meseri
- **royal_myth** — Gilgamesh*, Enuma_Elish, Atrahasis, Erra*, Sumerian_King_List, Sumerian_Flood, Lagash_King_List, Sumerian_Me
- **divination_science** — Hepatoscopy, Diagnostic_Handbook, Late_Babylonian_Astrology
- **reception_comparative** — Berossus, 1Enoch*, Amarna_Religion, Book_of_the_Dead, Coffin_Texts
- **monuments** — Tablet_of_Shamash
- **infrastructure** — Cuneiform_API*, Cuneiform_Sumer, Cuneiform_Tools*

### `query_research` — schema: [query_research.schema.json](schemas/query_research.schema.json)

BM25 retrieval over chunked briefs. Each hit returns the chunk text, brief name, section heading, extracted scholarly citations, synthesis-flag, and BM25 score.

```jsonc
// example: query_research({query: "Tablet of Shamash river preservation", top_k: 3}) → structuredContent.data
{
  "query": "Tablet of Shamash river preservation",
  "hit_count": 3,
  "hits": [
    {
      "brief": "Tablet_of_Shamash",
      "section_path": "3.3 The miraculous recovery",
      "text": "The inscription then describes the recovery. King Simbar-Šipak (Second Dynasty of Isin, c. 1025–1008 BCE) attempted a partial restoration but had to abandon the work — no proper model of the original statue existed. …",
      "score": 14.775,
      "scholar_citations": ["Lambert 2013", "Frame 1995"],
      "synthesis_flag": false,
      "cluster": "monuments"
    }
    // …2 more
  ]
}
```

Provenance: `source: local`, `endpoint: local:cuneiform-research`.

### `get_brief` — schema: [get_brief.schema.json](schemas/get_brief.schema.json)

Retrieve a specific brief by name (case-insensitive, `.md` suffix tolerated). Paginated 5 chunks per page. Returns near-match suggestions on miss.

```jsonc
// example: get_brief({name: "Royal_Descents", page: 1}) → structuredContent.data
{
  "query": "Royal_Descents",
  "found": true,
  "name": "Royal_Descents",
  "cluster": "cosmology",
  "page": 1,
  "total_pages": 8,
  "total_chunks": 38,
  "chunks": [
    {
      "section_path": "TL;DR",
      "text": "Three downward descent narratives (Gilgamesh through Mashu, Inanna through the seven gates, Nergal to Ereshkigal) produce structurally similar outcomes …",
      "scholar_citations": ["George 2003", "Sladek 1974", "Lapinkivi 2010", "Hutter 1985"],
      "synthesis_flag": false
    }
    // …4 more chunks per page
  ]
}
```

Provenance: `source: local`, `endpoint: local:cuneiform-research`.

### `list_briefs` — schema: [list_briefs.schema.json](schemas/list_briefs.schema.json)

Enumerate briefs in the vault with per-brief summaries: name, cluster, section count, chunk count, total chars, unique citation count, synthesis-claim flag.

```jsonc
// example: list_briefs({cluster: "cosmology"}) → structuredContent.data
{
  "cluster_filter": "cosmology",
  "brief_count": 5,
  "briefs": [
    {"name": "Anunnaki",              "cluster": "cosmology", "section_count": 7,  "chunk_count": 14, "total_chars": 12657, "citation_count": 22, "has_synthesis_claims": false},
    {"name": "Apsu_Exchange_Network", "cluster": "cosmology", "section_count": 12, "chunk_count": 64, "total_chars": 78912, "citation_count": 41, "has_synthesis_claims": true},
    // …
  ],
  "clusters_available": ["cosmology", "theology", "royal_myth", "divination_science", "reception_comparative", "monuments", "infrastructure", "uncategorized"],
  "vault_stats": {"dir": "/Users/danebrown/Desktop/Research", "total_briefs": 58, "total_chunks": 2364, "total_chars": 2126505}
}
```

Provenance: `source: local`, `endpoint: local:cuneiform-research`.

### `find_synthesis_claims` — schema: [find_synthesis_claims.schema.json](schemas/find_synthesis_claims.schema.json)

Surface all paragraphs flagged `[my synthesis]`, `[unverified]`, or `[Cluster synthesis — my reading]`. These are the author's explicit interpretive claims that go beyond scholarly consensus — the structural readings worth testing or defending. Optional `query` filters claims by BM25 relevance.

```jsonc
// example: find_synthesis_claims({query: "river preservation apkallu"}) → structuredContent.data
{
  "query": "river preservation apkallu",
  "claim_count": 4,
  "claims": [
    {
      "brief": "Tablet_of_Shamash",
      "section_path": "3.3 The miraculous recovery",
      "marker": "[Cluster synthesis — my reading]",
      "paragraph": "The river-preservation cosmic-mechanism in the Tablet's narrative is structurally identical to the apkallū-knowledge preservation through the Flood — both place the river/Apsû as the cosmic preserver of critical religious-civilizational material across catastrophic disruption …"
    }
    // …3 more
  ]
}
```

82 synthesis claims currently indexed across the vault (2026-05-16). Provenance: `source: local`, `endpoint: local:cuneiform-research`.

## v0.14.2 — Damaged-Tablet Sign-Inference Engine

For each `X` damaged-position token in an eBL transliteration, suggest the most-probable sign via bigram context across the 36,498-tablet eBL corpus. Score = geometric mean of `P(sign | prev_sign)` and `P(sign | next_sign)` with Laplace smoothing (ε = 1e-5). Optional period/genre conditioning soft-boosts candidates typical of the queried context.

Index built lazily on first call (~5 seconds): 36,498 tablets · 4,874,046 sign tokens · 8,757 distinct signs · 4,688,092 bigram pairs · 7 period buckets · 6 genre buckets. v0.13.1 tablet metadata provides the period/genre conditioning when available.

### `infer_damaged_sign` — schema: [infer_damaged_sign.schema.json](schemas/infer_damaged_sign.schema.json)

```jsonc
// example: infer_damaged_sign({tablet_id: "K.3982", top_k: 3}) → structuredContent.data
{
  "tablet_id": "K.3982",
  "input_signs_length": 312,
  "damaged_positions": [20, 215, 317],
  "inferences": [
    {
      "position": 20,
      "context": {
        "prev_sign": "ABZ319",
        "next_sign": "ABZ411",
        "snippet": "ABZ230 ABZ332 ABZ319 [?] ABZ411 ABZ69 ABZ230"
      },
      "candidates": [
        {"sign": "ABZ411", "score": 0.07498, "evidence": {"forward_prob": 0.0223, "backward_prob": 0.2519, "forward_count": 327, "backward_count": 76308, "total_corpus_count": 84127}},
        {"sign": "ABZ13",  "score": 0.05184, "evidence": {"forward_prob": 0.1180, "backward_prob": 0.0228, "forward_count": 1728, "backward_count": 6905, "total_corpus_count": 9482}}
        // …more
      ]
    }
    // …more positions
  ],
  "conditioning": {"applied": false},
  "index_stats": {"total_tablets": 36498, "total_signs": 4874046, "distinct_signs": 8757, "bigram_pairs": 4688092}
}
```

**Candidate-pool selection** (controlled via `candidate_pool` argument):
- `intersection` (default, strictest) — signs that followed `prev_sign` AND preceded `next_sign`. Falls back to union if intersection is empty.
- `union` — all signs from either side.
- `next_of_prev` — only signs that followed `prev_sign` (use when `next_sign` is missing / unreliable).
- `prev_of_next` — symmetric to above.

Provenance: `source: local`, `endpoint: local:sign-inference-bigram-index`, `citation` notes v0.14.2 corpus version.

## v0.14.3 — Mesopotamian ↔ Hebrew Bible Parallel Finder

A curated dataset of canonical Mesopotamian textual parallels to Hebrew Bible passages, with named-Assyriologist attribution + transmission hypothesis + `brief_in_vault` pointer per parallel for drill-down via `get_brief`. 15 parallels initial dataset (compiled 2026-05-16): 12 strong-consensus + 3 moderate-consensus. 63 unique scholarly citations.

**Coverage:** Flood (Gen 6-9 ↔ Atrahasis + Sumerian Flood + Gilgamesh XI + Berossus) · Creation (Gen 1 ↔ Enuma Elish) · Eden (Gen 2-3 ↔ Adapa + Gilgamesh plant of rejuvenation) · Babel (Gen 11 ↔ Etemenanki + Enmerkar's spell of Nudimmud) · Theodicy (Job ↔ Babylonian Theodicy + Ludlul Bel Nemeqi) · Vanity (Ecclesiastes ↔ Šiduri's speech in Gilg X + Šamaš Hymn) · Apocalyptic Beasts (Daniel 7 ↔ Enuma Elish monsters + Anzu) · Throne-Chariot (Ezekiel 1 ↔ Apkallū iconography + Lamassu) · Cosmic Dragon (Leviathan ↔ Tiamat + Ugaritic Lotan) · Sacred Marriage (Song of Songs ↔ Inanna-Dumuzi liturgy) · Royal Hubris (Isaiah 14 ↔ Etana ascent + Mesopotamian royal-deification) · Wisdom (Proverbs ↔ Sumerian + Akkadian wisdom literature) · Plant of Life (Gen 3:22-24 ↔ Gilgamesh's plant) · Sacrifice Savor (Gen 8:21 ↔ Atra-ḫasīs III v 35 "gods like flies") · Healing Serpent (Numbers 21 Nehushtan ↔ Ningishzida iconography).

### `find_biblical_parallel` — schema: [find_biblical_parallel.schema.json](schemas/find_biblical_parallel.schema.json)

```jsonc
// example: find_biblical_parallel({biblical_reference: "Gen 6:9"}) → structuredContent.data
{
  "query": {"biblical_reference": "Gen 6:9"},
  "match_count": 1,
  "parallels": [
    {
      "id": "bp-flood-1",
      "biblical": {
        "reference": "Genesis 6:9–9:17",
        "theme": "The Great Flood",
        "summary": "Noah is warned by Yahweh of an impending universal flood. He builds an ark of gopher wood …"
      },
      "mesopotamian_sources": [
        {
          "text": "Atra-ḫasīs Epic",
          "tablet_reference": "Atra-ḫasīs III (Old Babylonian, c. 1700 BCE)",
          "summary": "Atra-ḫasīs warned by Enki through the reed wall of his hut, builds a boat. Loads animals + family …",
          "brief_in_vault": "Atrahasis"
        },
        {"text": "Sumerian Flood Story (Ziusudra)", "tablet_reference": "WB 62", "brief_in_vault": "Sumerian_Flood_Story", "summary": "…"},
        {"text": "Standard Babylonian Gilgamesh, Tablet XI", "brief_in_vault": "Gilgamesh_Epic", "summary": "…"},
        {"text": "Berossus, Babyloniaca", "brief_in_vault": "Berossus", "summary": "…"}
      ],
      "shared_elements": [
        "Divine warning to a chosen mortal",
        "Construction of a large boat by divine instruction",
        "Bird-sending sequence to test the receding waters (raven + dove)",
        "Landing on a mountain (Ararat / Niṣir)",
        "Burnt offering sacrifice upon emerging",
        "…"
      ],
      "scholarly_attribution": [
        "Smith 1872 — original public recognition of the Gen 6-9 ↔ Gilgamesh XI parallel",
        "Lambert & Millard 1969 — *Atra-ḫasīs: The Babylonian Story of the Flood*",
        "George 2003 — *The Babylonian Gilgamesh Epic*",
        "Sparks 2007 — *Ancient Texts for the Study of the Hebrew Bible*",
        "Heidel 1949 — *The Gilgamesh Epic and Old Testament Parallels*"
      ],
      "confidence": "strong",
      "transmission_hypothesis": "scribal_transmission_via_west_semitic_intermediary"
    }
  ]
}
```

**Composition with the rest of the stack:** the `brief_in_vault` pointer chains directly to `get_brief` for full scholarly drill-down. Then `query_research` for cross-references, `find_synthesis_claims` for the author's interpretive positions.

Provenance: `source: local`, `endpoint: local:biblicalParallels`.

### `find_thematic_parallel` — schema: [find_thematic_parallel.schema.json](schemas/find_thematic_parallel.schema.json)

```jsonc
// example: find_thematic_parallel({tablet_id: "K.3982", top_k: 5}) → structuredContent.data
{
  "tablet_id": "K.3982",
  "neighbors": [
    {"id": "BM.32494", "score": 0.7821, "genre": "divinatory"},
    {"id": "K.4136",   "score": 0.7654},
    {"id": "BM.32207", "score": 0.7390},
    {"id": "K.12295",  "score": 0.7188},
    {"id": "Rm.729",   "score": 0.6975}
  ],
  "filters_applied": {"min_cosine": 0.5},
  "index_stats": {
    "total_tablets": 28665,
    "embedding_dim": 300,
    "method": "random_indexing",
    "vocab_size": 2082,
    "generated_at": "2026-05-16T…Z"
  },
  "warnings": []
}
```

**Method:** Sahlgren 2005 Random Indexing. Each sign in the vocab (filtered to ≥3 corpus occurrences; 2,082 signs) gets a deterministic random sparse index vector (k=8 nonzeros over 300 dims, ±1 values, seed=42). Each sign's context vector accumulates the index vectors of its window neighbors (window=±3). L2-normalized. Per-tablet embedding = IDF-weighted mean of sign vectors, then corpus-mean-centered (Mu & Viswanath 2018 lite — without this step every cosine collapses to 0.97+; with it, random-pair median is ~0), then L2-normalized. Top-30 cosine neighbors precomputed per tablet by `scripts/build-embeddings.mjs` and cached at `$CUNEIFORM_MCP_CACHE_DIR/tablet-neighbors.json`.

**What this surfaces that lexical methods miss:** tablets sharing zero exact trigrams but using signs that pattern-out the same distributional roles. E.g., two literary tablets using different vocabularies to describe the same scene (Akkadian/Sumerian bilingual parallels; alternate-spelling witnesses; cross-period reworkings of the same composition).

**What this does NOT surface:** very-short tablets (< 20 sign tokens — excluded by `MIN_TABLET_SIGNS`); the v0.14.4 Asb.* colophon-template prototypes (excluded). Re-build the index with `node scripts/build-embeddings.mjs` if the exclusion list or the all-signs cache changes.

**Composition with the rest of the stack:** pair with `discover_primary_source_parallels` to combine lexical + thematic discovery — tablets that appear in *both* result sets are the highest-confidence parallels; tablets that appear in only one are the most-interesting discovery candidates. v0.16 will operationalize this with `find_anomalous_tablets`.

Provenance: `source: local`, `endpoint: local:semantic-embeddings-random-indexing`.

## v0.14.4 — Corpus-exclusion pre-filter (Discovery Engine v2.0)

A `data/corpus-exclusions.json` table lists records that must be filtered out of the Discovery Engine v2.0 candidate pool at index-build time. Loaded by `scripts/discovery-primary-v2.mjs` on every run.

**Initial 20 exclusions (all Asb.* prototypes):** Asb.a, .b, .c, .d, .e, .f, .g, .group.1, .h, .i, .k, .k.var, .l, .m, .n, .o, .p, .q, .r, .s, .t, .v. Each is a Hunger 1968 BAK colophon-type prototype that aggregates standardized Ashurbanipal-library palace-colophon language across 100-200 manuscripts. Their trigram-similarity to any Kuyunjik tablet reflects formulaic colophon match, not meaningful intertextual content.

**Why excluded:** v0.13.4 calibration surfaced these explicitly. Of 11 top-tier candidates evaluated, 2 (`K.3716 ↔ Asb.c` and `K.3716 ↔ Asb.d`) were colophon-template false positives. v0.14.4 closes this class permanently — re-runs of the Discovery Engine cannot produce Asb.*-touching parallels.

**Schema (`data/corpus-exclusions.json`):**

```jsonc
{
  "_meta": {
    "compiled": "2026-05-16",
    "version": "v0.14.4",
    "total_exclusions": 20,
    "exclusion_categories": ["colophon_template_prototype"],
    "scholarly_anchor": "Hunger 1968 — Babylonische und assyrische Kolophone (AOAT 2)"
  },
  "excluded_records": [
    {
      "id": "Asb.c",
      "reason": "colophon_template_prototype",
      "category": "Ashurbanipal_colophon_type",
      "manuscript_count_eBL": 212,
      "rationale": "Hunger 1968 BAK Type-C Ashurbanipal-library palace colophon. Aggregates 212 manuscripts. …"
    }
    // …19 more
  ]
}
```

`scripts/apply-exclusion-pass-v144.mjs` is the retroactive pass that updates `data/primarySourceParallels.json`: any existing parallel involving an excluded record is marked `rejected_as_artifact` with the canonical rejection reason. The 2026-05-15 + 2026-05-16 passes have processed all currently-surfaced cases.

## Citation

If you build on this protocol, cite the repo and the version in the
`mcp_version` field of any response you publish. Example BibTeX entry:

```
@software{cuneiform_mcp_2026,
  author = {Brown, Dane},
  title  = {cuneiform-mcp: an MCP server for cuneiform corpora},
  year   = {2026},
  url    = {https://github.com/danebrown/cuneiform-mcp},
  version = {0.18.3}
}
```
