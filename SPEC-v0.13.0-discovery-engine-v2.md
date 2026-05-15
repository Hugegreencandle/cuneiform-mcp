# cuneiform-mcp v0.13.0 — Discovery Engine v2.0 (Primary-Source)

> *Spec, 2026-05-15. The move from rediscovering published scholarship to surfacing previously-unnoticed parallels in the primary-source corpus.*

## The thesis

The v0.7 Discovery Engine traversed **48 secondary-literature briefs** and found candidates that turned out to correspond to **already-published scholar arguments** (Lambert 1967, Annus 2010, Wright 2009, Pingree 1997). It was rediscovery, not discovery — useful infrastructure but not new knowledge.

The v0.13 Discovery Engine traverses **the primary-source cuneiform corpus** — ~350K tablets across CDLI + ORACC + eBL + OGSL — at scale that no human scholar can read exhaustively. This is the move from "machine rediscovers what scholars already found" to "machine surfaces what scholars haven't looked at yet."

## What v2.0 produces

**`PrimarySourceParallel`** records: pairs of cuneiform tablets sharing significant sign-trigram fingerprints, especially across genre / period / city boundaries that specialist scholars rarely cross. Each record carries:

- Both tablets' identifiers + metadata (genre, period, city, language)
- The shared-signs evidence (jaccard score + intersection size + sample trigrams)
- Cross-boundary flags (different_genre / different_period / different_city)
- A novelty score weighting cross-boundary matches higher than within-boundary matches
- Discovery provenance + pending validation status

The v2.0 output is structurally analogous to the v0.7 `DiscoveryCandidate` envelope but targets primary sources rather than secondary literature.

## What this could plausibly produce

These are the kinds of findings the engine could surface that scholars haven't yet catalogued:

1. **Compositional reuse across genres** — medical/diagnostic tablets quoting omen-series formulae; royal inscriptions echoing literary-text vocabulary
2. **Cross-period intertextual quotations** — Late-Babylonian texts preserving older formulae beyond what's been documented
3. **Scribal-school cross-contamination** — tablets from one city's scribal tradition showing influence from another city's tradition
4. **Esagil-kīn-apli source-text identification** — which earlier texts did his Diagnostic Handbook recension absorb? Substantially under-documented.
5. **Mul.Apin compositional layers** — what earlier observational texts did Mul.Apin draw on?
6. **Unrecorded tablet-joins** — fragments from the same physical original now in different museums (the existing `find_parallel_text` already finds these but at one-query-at-a-time scale)

## Architecture

### Three discovery modes

1. **Mode A: Cross-tablet lexical reuse** — find pairs sharing the same phrases/formulae. Uses sign-trigram Jaccard (existing `find_parallel_text` mechanism). The most tractable mode for MVP.

2. **Mode B: Cross-boundary filtered parallels** — Mode A results filtered to pairs that cross genre / period / city boundaries. Pure metadata-overlay on top of Mode A. The mode most likely to surface novel findings.

3. **Mode C: Semantic similarity** *(deferred to v0.14+)* — embedding-based conceptual matching across texts that don't share lexical surface forms. Requires trained embeddings for transliterated cuneiform; v0.13 ships without this.

### High-level data flow

```
┌──────────────────────────────────────────────────────────┐
│ 1. CORPUS INGESTION                                      │
│    eBL /fragments/all-signs    → ~350K tablet records   │
│    + CDLI catalog metadata     → genre / period / city  │
│    + ORACC text catalogs       → composition / language │
│                                                          │
│    Output: data/corpusIndex.json (single consolidated)   │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 2. TRIGRAM INDEX (already exists for find_parallel_text) │
│    Build inverted sign-trigram index across full corpus  │
│    Output: persisted on disk (~33MB per existing tool)   │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 3. BATCH DISCOVERY PASS                                  │
│    For each tablet T_a:                                  │
│      candidates = inverted_index.query(T_a.trigrams)     │
│      for T_b in candidates:                              │
│        jaccard = compute_jaccard(T_a, T_b)               │
│        if jaccard >= MIN_THRESHOLD (e.g. 0.25):          │
│          record = build_parallel_record(T_a, T_b)        │
│          apply cross-boundary filters                    │
│          apply novelty scoring                           │
│    Output: data/primarySourceParallels.json (raw)        │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 4. POST-PROCESSING                                       │
│    Filter formulaic-only matches (royal-titulary etc.)   │
│    Deduplicate symmetric pairs                           │
│    Rank by novelty_score descending                      │
│    Sample top-K for human review                         │
│    Output: data/primarySourceParallels.json (curated)    │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 5. MCP TOOL: discover_primary_source_parallels           │
│    Query interface for downstream agents                 │
│    Filters: min_jaccard / cross_genre_only /             │
│             cross_period_only / max_results              │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 6. VALIDATION PIPELINE (v0.13.1+)                        │
│    Web-search per candidate: "Is this parallel already   │
│    documented in published Assyriological literature?"   │
│    Output: validation_status updates                     │
└──────────────────────────────────────────────────────────┘
```

## Data schema

### Input: `data/corpusIndex.json`

Consolidated tablet metadata across the four upstream sources.

```typescript
type CorpusEntry = {
  museum_number: string;        // e.g. "K.2486", "BM.41255.C"
  cdli_id?: string;             // e.g. "P276234"
  oracc_id?: string;            // e.g. "rinap/rinap4/Q003230"
  designation?: string;         // human-readable name if any
  genre?: string;               // CDLI genre tag, normalized
  period?: string;              // CDLI period tag, normalized
  city?: string;                // findspot if known
  language?: "Akkadian" | "Sumerian" | "bilingual" | "Hittite" | "other";
  signs_available: boolean;     // does it have a transliteration?
  trigram_count?: number;       // size of fingerprint
  sources: ("CDLI" | "ORACC" | "eBL" | "OGSL")[];
};

type CorpusIndex = {
  _meta: { compiled: string; total_tablets: number; total_with_signs: number };
  entries: CorpusEntry[];
};
```

### Output: `data/primarySourceParallels.json`

Discovery output — the dataset that powers the new MCP tool.

```typescript
type PrimarySourceParallel = {
  id: string;                   // "psp-2026-05-15-0001"
  tablet_a: TabletRef;
  tablet_b: TabletRef;
  match_evidence: {
    match_type: "sign_trigram_jaccard";
    jaccard: number;            // 0..1
    intersection_size: number;
    union_size: number;
    shared_trigram_sample: string[];  // deterministic sort, up to 10
  };
  cross_boundary: {
    different_genre: boolean;
    different_period: boolean;
    different_city: boolean;
    different_language: boolean;
  };
  novelty_score: number;        // composite — see Scoring below
  discovered_by: "ai_corpus_traversal";
  discovery_date: string;       // ISO date
  validation_status: "pending" | "validated_as_known" | "validated_as_novel" | "rejected_as_artifact";
  validation_log?: {
    validated_on?: string;
    validated_by?: string;
    validation_method?: string;
    known_publication?: string;  // if validated_as_known
    rejection_reason?: string;
  };
};

type TabletRef = {
  museum_number: string;
  designation?: string;
  genre?: string;
  period?: string;
  city?: string;
  language?: string;
};
```

### MCP tool schema: `schemas/discover_primary_source_parallels.schema.json`

The structured envelope returned by the new tool — analogous shape to v0.7 `discover_parallel_candidates.schema.json`.

## Scoring

### Jaccard baseline

`jaccard = |A ∩ B| / |A ∪ B|` over sign-trigram fingerprints. Existing `find_parallel_text` already computes this. Validation 2026-05-14: ~22% recall@15 on known eBL joins.

### Cross-boundary novelty bonus

```
novelty_score = jaccard
              + 0.15 if different_genre
              + 0.10 if different_period
              + 0.10 if different_city
              + 0.05 if different_language
              - 0.30 if either tablet is a known-formulaic genre
                       (royal-titulary, omen-series, hemerology, etc.)
                       — these will generate many low-value matches
```

The penalty for formulaic genres is critical. Royal titularies share massive formulaic vocabulary; without filtering, they'll dominate the results.

### Threshold tiers

- `novelty_score >= 0.55` — **strong candidates** for human review
- `0.40 <= novelty_score < 0.55` — **moderate candidates** worth surfacing
- `0.25 <= novelty_score < 0.40` — **weak candidates** kept for completeness

## MCP tool — `discover_primary_source_parallels`

```typescript
discover_primary_source_parallels({
  min_jaccard?: number,            // default 0.25
  min_novelty?: number,            // default 0.40
  cross_genre_only?: boolean,      // default false
  cross_period_only?: boolean,     // default false
  validation_status?: "pending" | "validated_as_known" | "validated_as_novel" | "rejected_as_artifact" | "all",
  max_results?: number,            // default 25, max 100
})
  → PrimarySourceParallel[]
```

Same envelope conventions as the existing 14 tools — `structuredContent` with `schema` + `data` + `provenance` + optional `warnings`.

## Implementation plan

### Phase 1 — Corpus index build (~3 hours)

**Script:** `scripts/build-corpus-index.mjs`

1. Reuse the existing `scripts/build-signs-index.mjs` fetch logic for eBL `/fragments/all-signs` (~26s, ~33MB)
2. Augment with CDLI catalog metadata (genre + period + provenance)
3. Augment with ORACC composition catalogs where available
4. Cross-reference museum numbers across sources
5. Output `data/corpusIndex.json` (single consolidated file)

**Risks:**
- CDLI catalog access may rate-limit (use existing cache + retry logic)
- Some tablets appear in multiple sources with different IDs — need cross-reference table
- Genre tagging is inconsistent across CDLI; normalize to a controlled vocabulary

### Phase 2 — Trigram index (existing — reuse)

Already exists from `find_parallel_text` v0.5. Just need to ensure it covers the full eBL corpus, not just the working subset.

**Script:** existing `scripts/build-signs-index.mjs` (run with `--full` flag if not already done)

### Phase 3 — Batch discovery pass (~6 hours wall clock)

**Script:** `scripts/discovery-primary-v2.mjs`

```javascript
const idx = loadSignsIndex();             // existing
const corpus = loadCorpusIndex();          // new in Phase 1

const parallels = [];
for (const tabletA of corpus.entries) {
  if (!tabletA.signs_available) continue;
  const candidates = scoreAgainstIndex(tabletA, idx);  // existing logic
  for (const candidate of candidates) {
    if (candidate.jaccard < MIN_THRESHOLD) continue;
    if (candidate.museum_number === tabletA.museum_number) continue;
    if (alreadySeenAsPair(tabletA, candidate)) continue;  // dedupe
    const parallel = buildParallel(tabletA, candidate, corpus);
    if (passesFilters(parallel)) parallels.push(parallel);
  }
  if (parallels.length > MAX_RAW_OUTPUT) saveAndContinue();
}
```

**Optimizations:**
- The existing `find_parallel_text` indexed lookup is fast (~ms per query)
- Process in batches with checkpointing — corpus is large enough that crash-recovery matters
- Use the existing X-trigram filter for noise reduction

**Estimated output:** ~10K-50K raw parallels (before filtering). Most will be near-duplicates or formulaic; the high-novelty subset is the interesting one.

### Phase 4 — Post-processing + filtering (~2 hours)

**Script:** `scripts/postprocess-primary-parallels.mjs`

1. Deduplicate symmetric pairs (psp(A,B) == psp(B,A))
2. Apply formulaic-genre penalty
3. Rank by `novelty_score` descending
4. Slice top-1000 for `validation_status: pending`
5. Save lower-novelty matches to archive (`data/primarySourceParallels_archive.json`)
6. Output `data/primarySourceParallels.json`

### Phase 5 — MCP tool integration (~3 hours)

**Files:**
- `schemas/discover_primary_source_parallels.schema.json` — new
- `src/tools/comparative.ts` — add `discoverPrimarySourceParallels()` handler
- `src/index.ts` — register the tool

**Smoke test:** 15 tools registered (was 14 in v0.12). Build clean.

### Phase 6 — Validation pipeline (~6 hours, runs background)

**Script:** `scripts/validate-primary-parallels.mjs`

For each top-K candidate (start with top 50):
- Search ORACC + CDLI + Google Scholar for the two museum-number combination
- Check if the parallel is documented in any published source
- If documented: `validation_status: validated_as_known`, capture citation
- If undocumented: `validation_status: validated_as_novel` (PROVISIONAL — needs human-scholar review)
- If clearly artifact (formulaic / royal-titulary / etc.): `validation_status: rejected_as_artifact`

**Output:** updated `data/primarySourceParallels.json` + a human-review markdown artifact at `~/Desktop/Research/PRIMARY-SOURCE-DISCOVERIES-2026-05-15.md`.

## Risk register

| Risk | Mitigation |
|---|---|
| Corpus access rate-limits | Reuse existing cache + retry logic from v0.5 tools |
| Genre tagging inconsistency | Normalize to controlled vocabulary; manual mapping table |
| Formulaic false positives (royal-titulary etc.) | Genre-penalty in novelty_score; explicit filter list |
| Computational cost | Batch with checkpointing; corpus-index optimization |
| Memory footprint | The trigram index is ~33MB — fits in memory. Corpus index ~50-100MB |
| Validation cost | Start with top-50 candidates only; expand iteratively |
| Real novel findings could embarrass current scholarship | The named-scholarship discipline keeps the engine honest; flag novel candidates with provisional status |
| Some tablets have no transliteration | Skip non-transliterated tablets; exposed via `warnings` in MCP responses |

## What success looks like for v0.13

### Minimum (v0.13.0 ship)

- 1 new MCP tool registered (`discover_primary_source_parallels`)
- 1 new dataset shipped (`data/primarySourceParallels.json`) with 500-1000 candidate parallels
- Corpus traversal of ~30K eBL fragments at minimum (sign-trigram-indexed subset)
- Top-50 candidates validated against published literature
- Build clean; smoke shows 15 tools

### Stretch (v0.13.x)

- Full ~350K corpus traversal (CDLI + ORACC + eBL combined)
- Cross-corpus references resolved
- Top-100+ candidates validated with named scholarly attribution OR provisional-novel flag
- Markdown writeup at `~/Desktop/Research/PRIMARY-SOURCE-DISCOVERIES-2026-05-15.md`
- At least one genuinely novel finding (= candidate that survives human-scholar review as previously-undocumented)

### Wishlist (v0.14+)

- Semantic embedding mode (Mode C above) — requires trained transliteration embeddings
- Cross-corpus orchestration with Hebrew + Greek + Egyptian primary-source MCPs
- Hypothesis-generation mode (the second-tier idea from the prior discussion)

## Estimated effort

- **MVP (Phase 1-5)**: ~14 hours of building (1-2 days)
- **Validation pipeline (Phase 6)**: ~6 hours initial + ongoing
- **First markdown writeup**: ~3 hours of human-review framing
- **Total to v0.13.0 ship**: ~2-3 days

## Open architectural questions

1. **Cross-corpus IDs.** A tablet can have a CDLI P-number + an eBL museum-number + an ORACC composition-name. Cross-reference table is essential but tedious to build. Use which as canonical?
   - **Recommendation:** museum_number as canonical (more stable than CDLI's P-numbers which can shift); fallback to CDLI when no museum number exists.

2. **Period-tagging granularity.** CDLI period tags range from "Early Dynastic IIIa" to "Late Babylonian" — substantial granularity. Should `different_period` apply at the broad period (OB vs SB) or the fine-grained level (Early Dynastic IIIa vs IIIb)?
   - **Recommendation:** Broad period for `different_period` boolean. Capture fine-grained in metadata for later analysis.

3. **Genre normalization.** CDLI genre is freeform-ish. How aggressive should normalization be?
   - **Recommendation:** Use a controlled vocabulary derived from CDLI's most-frequent tags, ~30 distinct genres. Map all variants to this vocab.

4. **Validation: how to scale beyond manual?** The v0.7 validation was 4 subagents × 3-4 candidates each. Top-50 here would need 12-15 subagents. Could be:
   - Run them in parallel like v0.7
   - Or use a single subagent batch-mode that validates 10-15 at a time
   - Or trust the automated literature-search and defer human scholar consultation

5. **What about Sumerian texts vs Akkadian?** The sign-trigram approach works for both since signs are the same Sumerian-Akkadian system. But Sumerian texts have very different vocabulary patterns. Should they be siloed?
   - **Recommendation:** Don't silo. Cross-language matches are some of the most interesting (e.g., a Neo-Assyrian Akkadian text quoting Sumerian formulae). Capture `different_language` in cross_boundary.

## Why this is the right next move

The v0.7-v0.12 work built infrastructure that proved the named-scholarship discipline + AI discovery pipeline. The cluster now covers ~13,630 lines of secondary-literature curation and has 30 queryable parallels with named scholarship.

The next probability-of-genuine-discovery move is the primary-source corpus. **No comparative-religion knowledge base — or any AI tool — has run systematic intertextual analysis at this scale on cuneiform primary sources.** The specialist scholars who could do it have read deeply within their genres but rarely cross genre/period/city boundaries. The engine has no such constraint.

The MVP is ~2 days of work. The probability of at least one genuinely novel finding (= a parallel that no human scholar has yet documented) is — given the size of the corpus and the cross-boundary filtering approach — meaningfully > 50%.

## Implementation order (for the v0.13.0 build)

1. **Phase 1 first** — corpus index build. This is the bottleneck. Once done, everything else is straightforward.
2. **Phase 3 batch discovery** — run it; let it churn for a few hours.
3. **Phase 4 post-processing** — sort + filter + rank.
4. **Phase 5 MCP tool wrap** — same pattern as the existing 14 tools.
5. **Phase 6 validation** — parallel subagents on top-50.
6. **Markdown writeup + commit + ship.**

Phases 2 (trigram index) and 5 (MCP tool) are easy carryovers from existing v0.5 + v0.7 infrastructure. Phases 1, 3, 4, 6 are the new work.

---

*v0.13.0 is the move from rediscovery to discovery. The named-scholarship discipline applies in inverted form: novel candidates carry `validation_status: pending` until a human-scholar review either confirms them as genuinely novel or identifies the published scholar who already made the argument. The discipline scales because the same auditable-trace framework that worked for v0.7 secondary-literature candidates works for v0.13 primary-source candidates.*
