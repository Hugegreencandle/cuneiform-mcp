# cuneiform-mcp Protocol — v0.7

> Every result should be inspectable, citeable, and reproducible.

This is the published interface for cuneiform-mcp's nine tools. Each tool
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

## The thirteen tools

> Nine corpus tools (v0.5) + three comparative-religion retrieval tools (v0.6) + one generative Discovery Engine tool (v0.7). The v0.6 additions are curated-local with REQUIRED named scholarly attribution. The v0.7 addition INVERTS that discipline: returns machine-discovered candidates explicitly flagged for human-scholar validation, with full reasoning trace.


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

## Citation

If you build on this protocol, cite the repo and the version in the
`mcp_version` field of any response you publish. Example BibTeX entry:

```
@software{cuneiform_mcp_2026,
  author = {Brown, Dane},
  title  = {cuneiform-mcp: an MCP server for cuneiform corpora},
  year   = {2026},
  url    = {https://github.com/danebrown/cuneiform-mcp},
  version = {0.7.0}
}
```
