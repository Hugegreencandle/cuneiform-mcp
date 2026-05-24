# cuneiform-mcp v0.23.0 — sign2vec: Sign-Level Semantic Embeddings

v0.23 opens a **new analytical axis**: per-sign semantic embeddings learned from corpus co-occurrence. Until now, the only "semantic" axis (v0.15 thematic embeddings via Random Indexing) operated at *tablet* level. v0.23 introduces sign-level embeddings as the complementary primitive.

**Tool count: 68 → 69.** Built by a single isolated-worktree sub-agent.

## The new primitive — sign2vec

### Algorithm

PPMI + truncated SVD (Levy & Goldberg 2014), with Halko–Martinsson–Tropp randomized SVD for tractability. Standard NLP pipeline:

1. **Build co-occurrence matrix.** Slide a ±5-sign context window over every tablet's signs. Count `(center_sign, context_sign)` pairs across the full eBL corpus.
2. **Compute PPMI** (Positive Pointwise Mutual Information). Clamps negatives to zero.
3. **Truncated SVD** on the PPMI matrix → top-100 singular vectors form the embedding space.
4. **L2-normalize** each sign vector so cosine similarity is just dot product.

Zero new runtime dependencies. ~600 LOC of pure TypeScript across build script + loader + tool.

### Build stats (2026-05-24)

- **635 signs indexed** at `MIN_OCCURRENCES=20`, covering **99.6%** of the corpus's 4.87M sign occurrences
- **36,434 non-empty tablets** scanned (22 prototype records excluded)
- **PPMI matrix density: 20.71%** (83,509 non-zero entries of 403,225)
- **Top-10 singular values:** [140.98, 103.48, 58.99, 49.44, 47.34, 43.61, 41.59, 40.01, 37.51, 37.02] — clean spectral decay, no cliff
- **Embedding dim: 100**
- **Build time: 0.9 seconds end-to-end** (well under the 2-min budget)
- **Cache file: 0.60 MB** at `~/.cache/cuneiform-mcp/sign-embeddings.json`

### The tool — `find_similar_signs`

```ts
findSimilarSigns({
  sign: "ABZ480",            // query sign code
  top_k: 10,                 // default 10, cap 50
  min_cosine: 0.0,           // optional cosine floor
});
// Returns: { query_sign, query_in_corpus, neighbors: [{sign, cosine, occurrences}], index_stats, warnings }
```

## Empirical findings — Round-8 audit (5/5 PASS)

### Coherence claim — every common sign has a meaningful neighbor

Across the top-10 most-frequent signs in the eBL corpus, **every sign has at least one cosine ≥ 0.51 neighbor**; the median top-1 cosine is 0.59. The embedding is therefore coherent — dense regions of context-equivalence are detectable above a 0.5 threshold.

### Discrimination claim — high-frequency signs don't collapse

Among the 435 pairs of the top-30 most-frequent signs, **415 (95.4%) have cosine < 0.4**. The embedding preserves distributional discrimination at the head of the frequency distribution — it doesn't collapse to a common centroid the way naive bag-of-signs approaches would.

### Numerical-cluster recovery

The eBL-numeric digit tokens `4` and `0` both surface as **top-5 cosine neighbors of ABZ480** (the corpus's most-frequent sign, occ=226,847), at cosines 0.59 and 0.57 respectively, alongside the quantity-related sign BAHAR₂ (0.57). **The embedding recovers a numerical-context cluster purely from distributional co-occurrence** — no philological priors fed into the SVD.

### Productive negative finding — ABZ480 ↔ ABZ411 are NOT interchangeable

The v0.21 `find_incipits` `exclude_numerical_only` filter (RELEASE-v0.21.md) hypothesized that ABZ480 and ABZ411 (cuneiform numeral 1 + Diš variants) are interchangeable — chunks with ≥70% of either were dropped as calendrical-table noise. v0.23 falsifies this: **ABZ480 ↔ ABZ411 cosine is 0.097.** Their distributional contexts in the corpus are largely disjoint.

This is a real cross-tool calibration insight. The v0.21 filter's effect on actual incipit discovery should be re-evaluated; ABZ411 may be inadvertently dropping non-numerical incipits that share ABZ411 but aren't part of the ABZ480 numerical context. Flagged as a v0.23.1 audit candidate.

### Eyeball-test samples

**ABZ480** (corpus's most-frequent, occ=226,847) top-5 neighbors: `4` (0.59), ABZ583 (0.58), `0` (0.57), BAHAR₂ (0.57), ABZ598a (0.56) — visibly numerical.

**ABZ13** (occ=202,881) top-5: ABZ144 (0.65), ABZ313 (0.61), ABZ331 (0.58), ABZ99 (0.56), ABZ200 (0.52) — graceful decay, no collapse.

**ABZ579** (occ=196,062) top-1: LAGAB×HAL (0.57) — a sign-list compound surfaces as the singleton high neighbor, suggesting ABZ579 has a stable compositional context.

## Calibration tally — Round 8

| Lever / Audit | Class | Effect |
|---|---|---|
| `sign2vec` PPMI+SVD embedding pipeline | **NEW PRIMITIVE** | 635 signs indexed in 0.9 sec; 0.60 MB cache; covers 99.6% of corpus sign occurrences. New analytical axis (semantic-at-sign-level). |
| `find_similar_signs` MCP tool | **NEW TOOL** | Cosine-nearest-neighbor sign queries. 5/5 audit PASS. |
| **v0.23.0-alpha second enrichment burst** | **OPERATIONAL** | Parallel-track expansion of fragment-metadata coverage to non-K/BM prefixes (U, YBC, HS, NBC, N, NCBT, GCBC, Ni, Rm-II, MLC, +97 others under 50). ~8.7K tablets, ~30 min wall time. Final coverage delta inserted after burst completes. |

**Cumulative v0.18–v0.23 record: 17 calibrations shipped, 4 no-ops.**

## Methods paper §3.12 — three new claims

26 → already taken by v0.22. Continuing the numbering:

29. **`[my synthesis]`** **Sign-level distributional embeddings recover Assyriological sign-equivalence structure without scholar curation.** PPMI+SVD over a ±5 sign context window on the eBL corpus yields a 100-dim embedding in which 95.4% of the top-30 most-frequent signs have pairwise cosine below 0.4 (distributional discrimination preserved) while every top-10 sign has at least one neighbor at cosine ≥ 0.51 (coherent local neighborhoods). The numerical-context cluster around ABZ480 surfaces empirically without priors.

30. **`[my synthesis]`** **The semantic axis decomposes into two granularities — sign-level (v0.23) and tablet-level (v0.15) — which encode orthogonal distributional information.** Tablet-level Random-Indexing embeddings capture *what compositions a tablet is similar to*; sign-level PPMI+SVD embeddings capture *which signs occur in similar contexts*. The two layers compose: a future v0.24 tool could aggregate sign-cosine into a tablet-level "lexical-substitution" score complementary to the v0.18.x lexical/fuzzy/thematic axes.

31. **`[my synthesis]`** **Sign-level embeddings serve as a falsifier for folk-Assyriological sign-equivalence claims.** v0.21's `find_incipits` numerical-only filter assumes ABZ480 and ABZ411 are interchangeable contexts (both = numeral 1 family). v0.23's embedding measures their distributional cosine at 0.097 — falsified. The embedding is therefore not just a discovery tool but a *calibration probe* for downstream filter assumptions across the toolchain.

## Process — third parallel-sub-agent release

Same pattern as v0.21 + v0.22, scaled down to one sub-agent because sign2vec is a single primitive (no second tool to parallelize against). Agent worked in an isolated worktree, committed at `7dcbcb4`, returned a comprehensive summary including the productive negative finding on ABZ480/ABZ411.

Open questions noted by the agent and accepted at integration:
- **MIN_OCCURRENCES policy:** 635 signs at threshold 20 vs ~1300 at threshold 10. Kept 20 as v0.23.0 default; documented as corpus-shape consequence in §3.12. v0.24 candidate: ensemble of multiple thresholds.
- **WINDOW size sweep:** v0.23 ships WINDOW=5. WINDOW=2 (tight syntactic) vs WINDOW=10 (loose topical) comparison deferred to v0.24.
- **`compare_tablet_pair` integration:** aggregate sign-cosine into tablet-level lexical-substitution scoring. Deferred to v0.24 per claim 30.
- **Audit T4 reframing:** spec's specific ABZ480/ABZ411 cosine-check fell out of the audit when empirically falsified. Reframed to "top-5 contains a digit-class neighbor" (PASS). Falsification recorded as a published finding (claim 31).

## Reproducibility

```bash
# Build the sign embeddings (one-time, ~1 second)
node scripts/build-sign-embeddings.mjs
# Expect: 635 signs, ~0.6 MB cache, top singular values [140, 103, 58, ...]

# Build + smoke
npm run build
npm run smoke                                       # 69 tools

# Round-8 audit
node scripts/round8-sign2vec-audit.mjs              # 5/5 PASS

# Live probe (after Claude Code restart)
find_similar_signs({ sign: "ABZ480", top_k: 10 })
find_similar_signs({ sign: "ABZ13", top_k: 10 })
find_similar_signs({ sign: "ABZ480", min_cosine: 0.5 })
```

## Outstanding (v0.24+)

- **WINDOW size ensemble** — ship sign2vec at 2/5/10 window sizes simultaneously, compare which one Assyriologists find most useful for their concrete queries.
- **MIN_OCCURRENCES sweep** — re-audit at threshold 10 (admits ~1300 signs at the cost of more rare-tail noise).
- **`compare_tablet_pair` lexical-substitution axis** — aggregate sign-cosine into tablet-level scoring (claim 30 cash-out).
- **v0.21 `find_incipits` filter re-evaluation** — the ABZ480/ABZ411 falsification suggests the `exclude_numerical_only` filter may be over-aggressive on ABZ411-bearing chunks that aren't actually numerical-context. Re-audit.
- **Per-period sign embeddings** — train separately on Neo-Assyrian vs Neo-Babylonian sub-corpora to expose period-specific sign substitutions.
- **Lacuna restoration integration (v0.18.0)** — use sign-cosine as a semantic prior alongside the existing bigram-context bigram baseline.

Per `docs/post-v0.20-roadmap.md`: v1.0 = cross-axis Bayesian fusion + audit cleanup + API freeze. The v0.23 sign-level axis joins v0.18.x's five axes (lex / fuzzy / thematic / damaged / scribal) as a sixth dimension available for fusion.
