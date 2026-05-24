# cuneiform-mcp v0.20.0 — Corpus-Wide Chunk Discovery

Round-5 ships the corpus-wide enumeration primitives that v0.19's per-tablet probe foreshadowed. Three new MCP tools sit on top of a one-time chunk-hash index that surfaces every length-20 trigram window shared between 2+ tablets in the corpus, in milliseconds.

## Calibration tally — Round 5

| Lever / Audit | Class | Effect |
|---|---|---|
| `chunk-index.json` build pipeline | **NEW PRIMITIVE** | One-time corpus-wide enumeration of every length-20 trigram window, singletons pruned. Built by `scripts/build-chunk-index.mjs` in under 15 minutes; loaded lazily by the three new tools. The exact-hash complement to v0.19's per-tablet fuzzy probe. |
| `find_formulaic_passages` | **NEW TOOL** | Surfaces every chunk shared with ≥ min_hosts tablets, ranked by `host_genres_spanned × log(host_count)`. Cross-curricular formulae outrank colophon templates by design. |
| `trace_chunk_diffusion` | **NEW TOOL** | Per-chunk chronological diffusion — hosts grouped by period and ordered by `src/periodChronology.ts` sort_keys. Corpus-level transmission map for a single passage. |
| `build_citation_graph` | **NEW TOOL** | Corpus-level commentary→base quotation graph. Partitions chunk occurrences by genre, accumulates per-pair edge weights. The structural complement to v0.18.19's pair-level `commentary_quotes_base_text` verdict. |
| `host_genres_spanned` on `find_chunk_parallels` | **FIELD (v0.19.1)** | Per-chunk count of distinct host primary genres, independent of source-metadata availability. Closes the v0.19 follow-up gap exposed by BM.77056, which lacks source genre attribution. |

**Cumulative v0.18 + v0.19 + v0.20 calibration record:**

| Round | Version | Fixes | No-ops | Class |
|---|---|---|---|---|
| 1 | v0.18.1 | lacuna length-factor (23%→92% top-1) | — | one-line |
| 2 | v0.18.2 | bi-orphan threshold + score rebalance + fuzzy run-bonus | — | three-fix |
| 2 | v0.18.3 | find_parallel_text run-bonus | thematic length-bias + scribal threshold | one fix + two no-ops |
| 3 | v0.18.19 | embedded-fragments tool + commentary verdict + sig-evolution chain default | refrain-thematic + orthographic-outliers | three fix + two no-ops |
| 4 | v0.19.0 | chunk-parallels tool + min_chunk_len=20 + §3.6 amendment | — | one new primitive + one paper amendment |
| **5** | **v0.20.0** | **chunk-hash index + 3 new tools + host_genres_spanned (v0.19.1)** | — | **one new primitive + three new tools** |

**Total: 12 calibrations shipped, 4 no-ops confirmed across the v0.18 + v0.19 + v0.20 family.**

## The three new tools

### `find_formulaic_passages`

Surfaces every length-20 trigram window shared with ≥ `min_hosts` tablets, ranked by `host_genres_spanned * log(1 + host_count)`. The genre-diversity weighting rewards cross-curricular formulae (e.g. *āšipūtu* incipits appearing in Mīs pî + Ritual + Lexical hosts simultaneously) and demotes within-prefix colophon templates (Library of Ashurbanipal Asb.c / Asb.d) where host_genres_spanned collapses to 1.

Motivating case: the BM.77056 position-57 chunk pattern from v0.19's §3.9.1 follow-up — three chunks at the same source offset spanning six sub-genres in their host sets. v0.19 saw this only because BM.77056 was probed directly; v0.20 surfaces it as one of many such cases across the whole corpus.

### `trace_chunk_diffusion`

For a single chunk (by hash, or by source tablet + index), returns its hosts grouped by period and ordered by `period_sort_key`. The diffusion array is the corpus-level transmission map for a passage. Validation case: a canonical KAR-44 incipit chunk diffuses Old Babylonian → Middle Babylonian → Neo-Assyrian → Neo-Babylonian → Hellenistic, mirroring the documented transmission history of the *āšipūtu* curriculum.

The companion module `src/periodChronology.ts` provides the curated period-to-sort_key map (~16 periods, Ur III through Sasanian) with approximate BCE bounds for span-years estimation.

### `build_citation_graph`

Corpus-level commentary→base quotation graph. For every chunk in the index, partitions occurrences into commentary-genre hosts (by case-insensitive substring match against `commentary_genres`, default `["Commentary", "Commentaries"]`) vs. base-text hosts (any other resolvable genre). Every (commentary, base) pair earns one edge credit per shared chunk, weighted by chunk length.

The pair-level companion is v0.18.19's `commentary_quotes_base_text` verdict in `compare_tablet_pair`. That tool answers "is THIS pair commentary/base?". `build_citation_graph` answers "what does the WHOLE corpus's quotation network look like?" — and degree-centrality analysis identifies canonical base texts (high in-degree) without scholar curation.

Validation case: BM.47463 → CBS.6060 (Šurpu commentary citing Šurpu base, 147-sign shared chain, methods-paper §3.7.1) must appear as an edge.

## Tool surface — 64 MCP tools

| v0.19 baseline | + v0.20.0 round-5 |
|---|---|
| 61 tools | 3 new tools (64 total) |

`find_formulaic_passages`, `trace_chunk_diffusion`, `build_citation_graph` ship simultaneously because they share the chunk-hash index backbone.

## Prerequisite — fragment-metadata enrichment burst

The binding constraint on Round 5 is fragment-metadata coverage. v0.20.0 opens with an overnight `enrich_prefix_metadata` burst across K, BM, Sm, Rm, IM, VAT, CBS, ND (~26.5K tablets, ~2.2 hours at polite 5-concurrency). Below 10% coverage, the cross-genre attribution + commentary/base partition degrade silently. Gate: `fragment_metadata_coverage` reports ≥10% before relying on `find_formulaic_passages` cross-genre filtering or `build_citation_graph`.

## Reproducibility

```bash
# One-time index build (after fragment-metadata enrichment ≥10%)
node scripts/build-chunk-index.mjs
# Expect: <15 min, 100K-500K non-singleton hashes, ~100-200 MB JSON cache

# Build + smoke
npm run build
npm run smoke                                                # 64 tools

# Round-5 audit
node scripts/round5-corpus-wide-chunk-audit.mjs
# 5 tests: index sanity + formulaic positive + colophon negative + diffusion + citation

# Live probe (after Claude Code restart)
find_formulaic_passages({ min_hosts: 50, top_k: 10 })
trace_chunk_diffusion({ chunk_hash: "<from previous>" })
build_citation_graph({ min_shared_chunks: 3 })
```

Audit writeup: `docs/v0.20-calibration-round5-corpus-wide-chunk.md`.

Methods paper §3.10 + claims 23-25: `docs/methods-paper-cdlj-submission.md`.

## New methods-paper synthesis claims (round 5 adds claims 23-25)

23. Chunk-hash indexing transforms sub-tablet discovery from per-tablet probe to corpus-wide enumeration without ML primitives.
24. Formulaic-passage discovery recovers the KAR-44 curriculum's most-canonical incipits as the highest-host-count chunks — the third independent recovery of the curriculum from the same corpus (v0.17 whole-tablet clustering → v0.19 chunk-parallels probe → v0.20 chunk-hash enumeration).
25. The citation graph derived from chunks shared between commentary-genre and base-text hosts is a corpus-level structural primitive, not a pair-level diagnostic.

## Outstanding (v0.21+)

- **Incipit-targeted discovery** (`find_incipits`) — needs a length-10 chunk-hash index with its own calibration; different precision regime.
- **Cross-corpus comparative** (Hebrew Bible / Ugaritic / Hittite per methods paper §5.4) — needs a second corpus integration.
- **Active-learning prioritization** by chunk-coverage gaps — needs the bi-orphan validation backlog as a queue; separate UX problem.
- **Per-archetype threshold matrix** (Lever 5 deferred from Round 3) — still deferred; not blocking v0.20.
- **Sign-form variant normalization at query time** — methods paper §5.4 future work, separate analytical primitive.

The v0.20 chunk-hash index doesn't address these; they remain on the roadmap.
