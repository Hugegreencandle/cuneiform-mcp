# cuneiform-mcp methods paper — [my synthesis] Claims Inventory

Auto-extracted from `docs/methods-paper-cdlj-submission.md` via `scripts/generate-claims-inventory.mjs`. Generated 2026-05-24.

**9 numbered claims** spanning §3.1 → §3.14 + §5 + appendix.

Use this as a quick reference for cross-checking, paper-edit passes, and v1.0 review.

## 23. The chunk-hash index transforms sub-tablet discovery from per-tablet probe to corpus-wide enumeration without ML primitives

Paper line ~357.

The same trigram alignment that produces `find_chunk_parallels`' per-tablet output, applied at corpus scale with singleton pruning, surfaces every passage shared between 2+ tablets in milliseconds. No embedding-space, no learned model — just exact hashing of length-20 windows. The build step is single-pass over `all-signs-full.json` and runs in 25 seconds on a 35K-tablet corpus, producing **96,654 non-singleton hashes** (Round-5 Test 1 PASS).

## 24. Formulaic-passage discovery recovers the KAR-44 curriculum's most-canonical incipits as the highest-host-count chunks

Paper line ~359.

Round-5 Test 2: the top-10 ranked formulaic chunks at `min_hosts=20` each span **17 to 30 distinct host primary genres** (Šuʾila, Mīs pî, Anti-witchcraft, Bīt rimki, Namburbi, Diĝiršadiba, Magic Varia, Šuʾila Emesal, Ritual texts, Magic, Astronomy, Celestial). This is the third independent recovery of the *āšipūtu* curriculum from the same corpus — v0.17 whole-tablet clustering (§3.1), v0.19 chunk-parallels per-tablet probe (§3.9.1), v0.20 corpus-wide chunk-hash enumeration (§3.10) — three orthogonal methods converging on the same canonical structure. Methodology-independent recovery is strong…

## 25. The citation graph derived from chunks shared between commentary-genre and base-text hosts is a corpus-level structural primitive, not a pair-level diagnostic

Paper line ~361.

The v0.18.19 `commentary_quotes_base_text` verdict in `compare_tablet_pair` answers "is THIS pair a commentary/base relationship?". `build_citation_graph` answers "what does the WHOLE corpus's quotation network look like?". Round-5 Test 5 returned **11 directed citation edges across 6 distinct base-text genres** (Astronomy, Magic, Divine, Bīt rimki, Celestial, CANONICAL). **K.3716 emerges empirically as a hub commentary tablet** citing 7 base texts across Magic / Divine / multiple CANONICAL composition classes; **Sm.803 → BM.42262 (Astronomy commentary→base)** at weight 800 / 40 shared chunks …

## 26. Stemma reconstruction is automatable at corpus scale from chunk-overlap distance alone

Paper line ~381.

Given the v0.20 chunk-hash index + neighbor-joining over the max-denominator distance metric, every composition with ≥3 chunk-related witnesses can have a stemma proposed in milliseconds. K.5896 (Mīs pî) demonstrates the method recovers 12/16 witnesses with the canonical genre label and surfaces K.6683 as a potentially-undocumented close sister. No scholar curation required during reconstruction.

## 27. Scribal schools emerge empirically from joint clustering on orthographic signature + find-spot

Paper line ~383.

Connected-components on a thresholded scribal-cosine graph, restricted to same-provenance edges, surfaces 30 candidate schools in the eBL corpus. Top results align with known scholastic communities (Babylon Hellenistic astronomers, Nineveh EAE ateliers, Nineveh therapeutic-medicine atelier) — empirical reconstruction with no curation.

## 28. The composition-level and physical-place axes are independently learnable but convergent

Paper line ~385.

§3.1–§3.10's composition-level clustering (BM.77056 *āšipūtu* curriculum) and §3.11's scribal-school clustering recover overlapping but non-identical structure. The composition axis traces *what* people copied; the scribal-school axis traces *where* and *with whom*. Methodological independence of the two axes is the empirical basis for treating both as primary reconstructions of cuneiform scribal culture, not as alternative views of the same phenomenon.

## 29. Sign-level distributional embeddings recover sign-equivalence structure without scholar curation

Paper line ~403.

PPMI+SVD over a ±5 sign context window on the eBL corpus yields a 100-dim embedding in which 95.4% of the top-30 most-frequent signs have pairwise cosine below 0.4 (distributional discrimination preserved) while every top-10 sign has at least one neighbor at cosine ≥ 0.51 (coherent local neighborhoods). The numerical-context cluster around ABZ480 surfaces empirically without priors fed into the SVD.

## 30. The semantic axis decomposes into two granularities — sign-level (§3.12) and tablet-level (§2.3) — which encode orthogonal distributional information

Paper line ~405.

Tablet-level Random-Indexing embeddings capture *what compositions a tablet is similar to*; sign-level PPMI+SVD embeddings capture *which signs occur in similar contexts*. The two layers compose: aggregating sign-cosine into a tablet-level lexical-substitution score would produce a complement to the existing lexical/fuzzy/thematic axes of §2 (deferred to v0.24).

## 31. Sign-level embeddings serve as a falsifier for folk-Assyriological sign-equivalence claims — but theory–behavior coupling must be tested separately

Paper line ~407.

v0.21's `find_incipits` `exclude_numerical_only` filter assumes ABZ480 and ABZ411 are interchangeable contexts — both treated as "cuneiform numeral 1 family." v0.23 measures their distributional cosine at **0.097** — assumption falsified. The v0.23.1 follow-up audit (`docs/v0.23.1-incipit-filter-reaudit.md`) then verified the filter's actual *behavior*: 67 of 88 globally filtered chunks are filtered because of ABZ411 specifically, and on inspection all 67 are genuine numerical-table residue — repeated ABZ411 count-tokens with ABZ480 separators. **The filter's stated theory was wrong, but its b…

---

## Claim categories (rough grouping)

- **§3.1–§3.6 (v0.13–v0.18.2 era):** original methods paper claims (1–13)
- **§3.7.x:** cluster-typology findings (e.g. K.5896 transmission)
- **§3.8:** archetype typology (locked 2026-05-23)
- **§3.9 + §3.9.1 (v0.19.0 + post-enrichment):** chunk-parallels per-tablet probe + BM.77056 KAR-44 cross-curricular finding
- **§3.10 (v0.20.0):** corpus-wide chunk discovery (claims 23–25)
- **§3.11 (v0.22.0):** stemma reconstruction + scribal schools (claims 26–28)
- **§3.12 + §3.13 (v0.23–v0.25):** sign2vec + lexical-substitution axis (claims 29–31, with v0.25 refinement)
- **§3.14 (v0.26.0):** per-period + per-archetype conditional calibration (claim 32)

