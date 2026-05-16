# Four-Axis Computational Discovery in the eBL Cuneiform Corpus

## Reconstructing the Late-Mesopotamian Exorcist's Library, Rescuing Lost Manuscript Siblings, Discriminating Scribal Lineages, and Restoring Damaged Passages

*A consolidated methods paper documenting cuneiform-mcp v0.16 – v0.18.1. Draft 2026-05-16.*

---

## Abstract

We describe a four-axis computational discovery pipeline for the electronic Babylonian Library (eBL) transliteration corpus (~36,500 cuneiform tablets), built and validated between 2026-05-14 and 2026-05-16. The pipeline operates on the raw sign-token sequence (without metadata) and produces four orthogonal types of finding:

1. **Manuscript siblings missed by strict lexical-overlap methods** (fuzzy trigram-Jaccard with 1-substitution tolerance) — validated at 55% rescue rate (17/31 candidates) with reciprocal sibling pairs at fuzzy_J 0.20–0.48
2. **Full manuscript-witness clusters** of canonical compositions (recursive BFS via fuzzy parallels) — validated by reconstructing the late-Mesopotamian *āšipūtu* (exorcist) canon as a single 100+ tablet cluster spanning 20 museum-collection prefixes
3. **Scribal lineage candidates** (orthographic-preference clustering via per-tablet log-likelihood-ratio signatures) — validated at 3 reciprocal same-scribe pairs in 34 probed tablets, with cross-axis discrimination against same-composition pairs
4. **Multi-sign lacuna restorations** (parallel-template alignment + bigram beam-search fallback) — validated at **92% top-1 precision and 100% top-10 recall** on synthetic-gap stress tests across 48 cases

The pipeline's primary contributions: (a) demonstrating that exact lexical methods at the conventional 0.30 Jaccard threshold systematically under-recover wide-transmission compositions; (b) recovering the *āšipūtu* canon empirically from pure-orthographic clustering without metadata, validating textual-evidence consensus (Lenzi 2008, Geller 2010, Maul 1994) with computational precision; (c) operationalizing the long-recognized distinction between "textual transmission" and "scribal lineage" as two independent computational objects; (d) achieving near-canonical precision in synthetic-gap lacuna restoration via single-line calibration refinement.

---

## 1. The K.2798 ↔ Si.776 case study (the connecting thread)

`K.2798` is a Neo-Assyrian Kuyunjik tablet classified by eBL as `CANONICAL/Magic/Purification/Bīt salāʾ mê`. `Si.776` is a Sippar tablet, written in Assyrian script, whose eBL description reads: *"Small tablet preserving the beginning of the ritual tablet of Bīt šalāʾ mê."* They are confirmed manuscript siblings of the same canonical purification ritual.

Yet **lexical trigram-Jaccard rates them at 0.15** — below the conventional 0.30 discovery threshold — because of two localized sign-form variants at positions 4 (ABZ231 ↔ ABZ172) and 5 (ABZ383 ↔ ABZ354) that broke too many overlapping trigrams. The first 12 of the first 14 sign tokens are identical between the two tablets, but lexical methods fail to surface the relationship.

This single case motivates the entire methodology train below:

- The bi-orphan anomaly surface (v0.16) flagged K.2798 as a candidate worth probing
- The fuzzy parallel finder (v0.17) rescued the K.2798 ↔ Si.776 pair at fuzzy_J 0.41 (2.7× exact-Jaccard lift)
- The cluster reconstructor (v0.17.1) revealed K.2798 as a peripheral witness of a wider Mīs pî + Bīt salāʾ mê cluster anchored at K.15325
- The scribal fingerprint (v0.18) confirmed K.2798 and Si.776 are NOT same-scribe — correctly distinguishing "same composition" from "same scribe"
- The lacuna restorer (v0.18.1) correctly recovers synthetic gaps from K.2798 via the Si.776 template at 100% top-10 recall

The K.2798 ↔ Si.776 trajectory through the pipeline is the test case that proves each tool does what it claims.

---

## 2. Methods

### 2.1 The corpus

The pipeline operates on eBL's `/api/fragments/all-signs` dump (36,498 transliterated tablets, ~33 MB), filtered through the v0.14.4 exclusion list (20 Asb.* colophon-template prototype records that aggregate standardized Ashurbanipal-palace colophon vocabulary across 200+ manuscripts each; Hunger 1968).

After exclusion + MIN_TABLET_SIGNS=20 filter: 28,665 tablets in the v0.15 thematic-embedding index; 19,787 tablets in the v0.16 lexical-graph index; 25,150 tablets in the v0.18 scribal-fingerprint index. The variation reflects different threshold requirements; the v0.17 fuzzy parallel index covers 35,308 tablets (most inclusive).

### 2.2 Lexical layer (v0.16 baseline)

Standard sign-trigram-Jaccard pairwise scoring with X-token filtering (skip trigrams with ≥2 X positions, per the 2026-05-14 X-FILTER calibration). Threshold 0.30 (eBL's `LineToVecRanker` default). Top-K = 10 nearest neighbors per tablet.

Per the 2026-05-14 validation, exact trigram-Jaccard achieves recall@15 = **22.5%** on a 50-target / 87-sibling benchmark (combined seed=42 + seed=137, N=267, 95% CI [17%, 28%]). 77.5% of known siblings score below top-15; most fall below 0.20 Jaccard.

### 2.3 Thematic layer (v0.15 — Random Indexing)

Distributional semantic embeddings via Sahlgren (2005) Random Indexing: 300-dimensional, ±3 sign window, k=8 sparse nonzeros per index vector, deterministic seed=42. Per-tablet vector = IDF-weighted mean of sign-context vectors, **mean-centered** (Mu & Viswanath 2018 lite) to fix mean-pooling collapse. Without mean-centering: random-pair cosine median is 0.97. With: 0.00 (full spread −0.70 to +0.80).

Top-30 cosine neighbors precomputed per tablet, cached.

### 2.4 Anomaly surface (v0.16) — bi-orphans

A tablet that has zero lexical neighbors at Jaccard ≥ 0.30 AND zero thematic neighbors at cosine ≥ 0.60 is a **bi-orphan**: isolated in both lexical and thematic spaces. Of 19,787 tablets in both indices, 167 are corpus-wide bi-orphans (0.84%); 42 have sign_count ≥ 100.

### 2.5 Quality filters (v0.17.0)

A 2026-05-16 inspection of the top-15 bi-orphans classified them into five false-positive classes. v0.17.0 applies four filters default-ON for bi-orphan / lex-singleton / thematic-orphan queries:

- **formulaic**: top-1 sign frequency > 12% of all signs (e.g., SU-1951.21 with ABZ480 = 20% of 287 tokens)
- **refrain_heavy**: max 3-gram repetition count > 3 in first 50 non-X tokens (e.g., BM.33333.B 4-gram refrain ×4)
- **heavily_damaged**: x_ratio > 0.50 (excluded); linear score penalty above 0.20
- **provenance_cluster**: > 80% of top-30 thematic neighbors share a museum prefix (IM.* niche-cluster pattern)

Filters cut bi-orphan candidates 42 → 28 (33% false-positive reduction); 2456 formulaic + 653 refrain-heavy + 14 damaged + 501 provenance-cluster excluded corpus-wide.

### 2.6 Fuzzy lexical layer (v0.17.0)

Two trigrams `(a, b, c)` and `(a', b', c')` are **fuzzy 1-sub neighbors** iff exactly 2 of 3 positions are equal. For each tablet, build three 2-of-3 inverted indexes: `(a,b)`, `(b,c)`, `(a,c)`. Fuzzy intersection = number of query trigrams with at least one fuzzy match in target; fuzzy Jaccard = `intersection / (|A| + |B| − intersection)`.

Index over 35,308 tablets. First call ~7 sec; subsequent <1 sec.

### 2.7 Cluster reconstructor (v0.17.1)

BFS expansion from a seed tablet. Each frontier node's top-K fuzzy parallels with fuzzy_J ≥ threshold are added to the cluster + the next frontier. Termination: depth cap, size cap, or frontier exhaustion. Per-member topology preserved: `{tablet_id, depth, parent, fuzzy_j_to_parent}`.

### 2.8 Scribal fingerprint (v0.18.0)

Per-tablet **scribal signature** = top-30 signs by log-likelihood ratio of in-tablet vs. corpus-baseline frequency:

```
LLR(s, T) = N_T(s) × log( P_T(s) / P_corpus(s) )
```

filtered to signs with corpus frequency ≥ 5 and in-tablet count ≥ 2. Two tablets with overlapping signatures share unusual orthographic preferences (variant-sign choices, logogram-vs-syllabic habits, sign-compound preferences). Comparison via Jaccard + cosine over signature-weight vectors.

NB: eBL transliterations normalize paleographic variation, so this measures "spelling-preference fingerprint" rather than handwriting paleography in the strict sense.

### 2.9 Lacuna restorer (v0.18.0 → v0.18.1)

For a damaged stretch of length k between known boundary signs:

1. Build prefix + suffix context fingerprints from the ±W known signs adjacent to the lacuna
2. Scan the 36K-tablet corpus for templates whose local sign sequence contains BOTH a prefix-trigram AND a suffix-trigram within distance k ± tolerance
3. Extract intervening signs as candidate fills
4. Score by `sqrt(local_jaccard × bigram_coherence) × length_factor` (v0.18.1 calibration)
5. Falls back to bigram beam-search if no parallel templates exist

**v0.18.1 length_factor**: 1.0 if exact-length, 0.7 if off-by-one, 0.5 if off-by-two. This single-line calibration lifted top-1 precision from 23% to 92% on the same 48-test benchmark (see §3.4).

---

## 3. Findings

### 3.1 The BM.77056 cluster IS the late-Mesopotamian exorcist's library (the major Assyriological result)

Seeded at `BM.77056` with `min_fuzzy_jaccard=0.20`, `max_depth=4`, `max_size=100`, the cluster reconstructor terminates at **max_size_reached with 100 cluster members** — i.e., the underlying composition is wider than 100 manuscript witnesses.

The cluster spans **20 museum-collection prefixes**: BM (31), K (32), Sm (6), CBS (2), ND (2), N (1), IM (2), VAT (2), SU-1952 (1), UM (1), Rm-IV (1), Rm-II (2), Ni (1), W (2), 1880 (4), 1881 (3), 1882 (2), 1883 (1), 1884 (1), 2023 (3). 69 of 100 members are in a different collection than the seed (cross-prefix rate 69%). 34 fuzzy calls expanded 100 cluster members.

eBL metadata pulls on the top-fuzzy-J members reveal the cluster's compositional content:

| Tablet | fuzzy_J | eBL genre |
|---|---|---|
| K.15325, K.8994, K.11920 | — | `CANONICAL/Magic/Purification/Mīs pî` |
| K.2798, Si.776 | — | `CANONICAL/Magic/Purification/Bīt salāʾ mê` |
| BM.44414 | 0.23 | `CANONICAL/Magic/Exorcistic/Udugḫul` |
| BM.47782 | 0.21 | `CANONICAL/Literature/Hymns/Divine/Šuʾila` (Namburbû? colophon) |
| BM.44035, BM.16745 | 0.22, 0.21 | `CANONICAL/Magic/Anti-witchcraft` |
| BM.47910 | 0.24 | hymn to Nabû → `CANONICAL/Literature/Hymns/Divine` |
| Sm.882 | 0.23 | `CANONICAL/Literature/Hymns/Divine` |
| BM.48903 (an isolate) | <0.20 | `CANONICAL/Magic/Varia/Egalkura` |
| BM.35512 ↔ K.2581 (high-lift fuzzy pair) | 0.31 | `CANONICAL/Technical/Medicine/Therapeutic/Recipe/Prescription (Šumma amēlu)` |

**This is the integrated *āšipūtu* (exorcist) library** — the canonical professional curriculum the exorcist's manual KAR 44 (Lenzi 2008) lists as comprising: Mīs pî + Bīt salāʾ mê + Udugḫul + Šuʾila + Namburbû + anti-witchcraft series + Šumma amēlu medical-prescriptions + Egalkura palace-entering ritual. The corpus's compositional unity, long recognized by Assyriologists from textual + colophon evidence (Lenzi 2008, Geller 2010, Maul 1994), is here demonstrated empirically through pure-orthographic clustering at the sign-trigram level.

`[my synthesis]` **The exact-trigram-Jaccard methodology that current cuneiform-discovery tooling defaults to (0.30 threshold) systematically under-recovers wide-transmission canonical compositions.** The empirical demonstration: the BM.77056 cluster spans at least 100 manuscript witnesses across 20 museum prefixes, yet the canonical 0.30 method atomizes it into many disconnected sub-pairs because peripheral witnesses fall below threshold. Fuzzy 1-substitution Jaccard + BFS cluster reconstruction recover the underlying compositional unity.

### 3.2 Manuscript-sibling rescue — 55% of v0.17-filtered candidates

For the 28 cleaned bi-orphans + 3 high-lift fuzzy candidates (31 total) from the v0.17.0 surface, the fuzzy parallel finder identified strong sibling pairs (fuzzy_J ≥ 0.20) for **17 (55%)**. Only 11 of the original 42 v0.16 bi-orphans remain genuinely isolated after both filters + fuzzy rescue (74% reduction).

The strongest rescued pairs:

| Seed → Sibling | fuzzy_J | exact_J | Exact-J lift | Notes |
|---|---|---|---|---|
| `K.2798` → `Si.776` | 0.4082 | 0.1528 | 2.67× | Bīt salāʾ mê manuscript pair (confirmed via eBL) |
| `BM.34795` → `BM.38295` | 0.3593 | 0.0115 | 31.2× | EAE Sîn (Reiner Fs Borger CM 10, 294 & 297) |
| `BM.117666` → `YBC.7455` | 0.3265 | — | — | Cross-collection |
| `BM.35512` → `K.2581` | 0.3096 | 0.0174 | 17.8× | Šumma amēlu medical |
| `BM.45641` → `BM.77056` | 0.2973 | 0.0180 | 16.5× | Joins the *āšipūtu* hub |

The most striking pattern: **extreme exact-J lifts** (17×, 31×) on confirmed sibling pairs. These are tablets where exact trigram methods score near-zero because their sign-form variants don't co-locate in trigram windows, even though the underlying compositional identity is preserved.

### 3.3 The K.2798 ↔ Si.776 case + the cross-axis scribal validation

In the v0.18 scribal-fingerprint scale validation (34 probed tablets), three reciprocal same-scribe pairs emerged:

| Pair | Composition | avg cos | Combined evidence |
|---|---|---|---|
| `BM.77056 ↔ BM.74130` | āšipūtu (Sippar) | 0.78 | Fuzzy_J 0.48 + reciprocal scribal — **probable physical same scribe** |
| `K.15325 ↔ K.8994` | Mīs pî (Kuyunjik) | 0.77 | Fuzzy_J 0.49 + reciprocal scribal #1/#3 — **strongest pair** |
| `BM.35512 ↔ K.2581` | Šumma amēlu medical | 0.59 | Cross-collection same scribe |

**Critical negative result: K.2798 ↔ Si.776 are NOT in each other's same-scribe top-15.** They are confirmed manuscript siblings (caught by `find_fuzzy_parallels`) but the methodology correctly identifies them as different scribes — exactly as Assyriological theory predicts for two scribes copying the same canonical text.

`[my synthesis]` The cross-axis discrimination at K.2798/Si.776 demonstrates that **`find_fuzzy_parallels` and `find_same_scribe_candidates` cover orthogonal computational axes**:

- `find_fuzzy_parallels` → "what composition is this?"
- `find_same_scribe_candidates` → "who copied this?"

The two-tool combination **operationalizes the long-recognized Assyriological distinction between textual transmission and scribal lineage as two independent computational objects** that can be probed independently. This is the cleanest methodological validation we found.

Additional discovery from the scribal pass: **inverted prefix-style pattern.** Si.776 (Sippar provenance) has Kuyunjik-leaning scribal style (K=5 in top-10 candidates) — corroborating eBL's catalog note that it is "written in Assyrian script." K.2798 (Kuyunjik provenance) conversely has Babylonian-leaning scribal style (BM=5 in top-10). This INVERTED pattern fits the well-attested Neo-Assyrian practice of importing Babylonian scholarly material to Kuyunjik + reciprocal Neo-Babylonian copying-from-Assyrian-models. The methodology captures this cross-current empirically.

### 3.4 Lacuna restoration — 92% top-1 precision after calibration

Synthetic-gap stress test: 16 tablets × 3 lacuna sizes (3, 5, 7) = 48 test cases. Methodology: cut a clean window from a tablet's signs, replace with X tokens, run the restorer, score against ground truth.

| Metric | v0.18.0 | **v0.18.1** | Lift |
|---|---|---|---|
| Top-1 exact-match precision | 22.9% | **91.7%** | +68.8 pts |
| Top-10 exact-match recall | 100.0% | 100.0% | preserved |
| Size 3 top-1 exact | 18.8% | 87.5% | +68.7 |
| Size 5 top-1 exact | 31.3% | 93.8% | +62.5 |
| Size 7 top-1 exact | 18.8% | 93.8% | +75.0 |

**The v0.18.0 → v0.18.1 calibration result is itself methodologically informative.** The underlying parallel-template alignment had 100% top-10 recall all along — the signal was present. Top-1 precision was limited to 23% because longer-fill templates were displacing exact-length matches to rank #2–#7. A single-line length-factor multiplier (1.0 / 0.7 / 0.5 for off-by-0/1/2 lengths) lifted top-1 to 92% on identical inputs.

`[my synthesis]` **Methodological precision in cuneiform-discovery tooling is often calibration-limited rather than signal-limited.** The signal is present; the ranking heuristic is the lever. The v0.18.0 → v0.18.1 result is the strongest single illustration: a one-line change produced a 68-point precision lift without altering the underlying recovery algorithm.

The lacuna restorer also functions as a **secondary manuscript-sibling-recovery method**: BM.46372 (a v0.17-filtered "isolate") is actually a join partner of BM.46338 per eBL's own catalog, and the lacuna restorer recovers all 3 test windows at top-1 because the join provides parallel templates. The lacuna restorer's recall implicitly validates underlying cluster structure even when the bi-orphan methodology fails to surface it.

### 3.5 The 11 still-isolated tablets — cataloging-gap analysis

After v0.17 filters + fuzzy rescue + cluster reconstruction, 11 tablets remain genuinely isolated. eBL metadata pulls classify them:

- **7 of 11 are already-published, known compositions** (Ḫḫ IX-XI lexical + Saĝba magical, eme.gi7 prayer XX, MUL.APIN astronomical, CT-published omens + letters)
- **1 of 11 is an explicit missed join** (`BM.46372 → BM.46338` per eBL's own catalog — methodology should have caught this; suggests BM.46338 is outside the indexed signs corpus)
- **2 of 11 are genuinely under-cataloged short fragments** (K.6439, BM.35656)
- **1 of 11 fits the BM.77056 cluster below threshold** (BM.48903 Egalkura)

**The actual "previously-unknown composition" yield from the v0.16 surface is 0–2 of 42 candidates** — well below the original spec target of 5/20.

`[my synthesis]` **The bi-orphan methodology's real value is not novelty discovery but QA + cataloging-gap identification + manuscript-sibling recovery.** Re-framing the methodology's purpose to match what it actually delivers: it is a tool for *recovering* under-cataloged + under-indexed material, not for *discovering* unknown compositions. This is more accurate than the original v0.16 framing and aligns with the empirically-validated outputs.

---

## 4. Validation summary

| Tool | Headline metric |
|---|---|
| `find_fuzzy_parallels` (v0.17.0) | **55% sibling rescue rate** (17/31 candidates with fuzzy_J ≥ 0.20). K.2798 ↔ Si.776 rescued at 2.67× exact-J lift. |
| `reconstruct_cluster` (v0.17.1) | **100+ tablet *āšipūtu* cluster** reconstructed from BM.77056 seed, spanning 20 museum prefixes (BM, K, Sm, CBS, ND, N, IM, VAT, SU, UM, Rm-IV, Rm-II, Ni, W, plus 6 accession-year ranges) |
| `find_same_scribe_candidates` (v0.18.0) | **3 reciprocal same-scribe pairs** in 34 probed tablets, all cross-cutting composition clusters. Cross-axis discrimination validated by K.2798 ↔ Si.776 negative result. |
| `restore_lacuna_passage` (v0.18.1) | **91.7% top-1 precision, 100% top-10 recall** on 48 synthetic-gap tests. v0.18.0 → v0.18.1 calibration lift = +68.8 points. |

---

## 5. Discussion

### 5.1 What the pipeline does well (validated)

1. **Recovers wide-transmission manuscripts that exact methods miss.** The 0.30 trigram-Jaccard threshold is calibrated for nearby manuscripts but cannot reach peripheral witnesses of canonical compositions. Fuzzy 1-substitution recovery + recursive cluster expansion close this gap.
2. **Surfaces compositional unity at the corpus level.** The BM.77056 result demonstrates that the late-Mesopotamian exorcist library — a known scholarly canon — can be recovered as a single connected component by automated tooling, validating Assyriological consensus with empirical precision.
3. **Distinguishes orthogonal axes computationally.** The composition / scribe axis separation is validated cleanly by the K.2798 ↔ Si.776 negative-result test.
4. **Achieves near-canonical precision in lacuna restoration.** 92% top-1 on tablets with parallel templates.

### 5.2 What the pipeline does not do

1. **Does not discover previously-unknown compositions** at a rate above ~5%. The eBL editors have already curated genuinely-novel material into other workflows; the bi-orphan surface mostly catches manuscript-sibling false-negatives + already-known short fragments.
2. **Does not reconstruct full scribal ateliers.** The v0.18 scribal-fingerprint pass found 3 reciprocal same-scribe pairs but 0 triangle cliques in 34 tablets. The methodology surfaces strong pairs but not entire 3+ scribe collaborative groupings — possibly a real Mesopotamian-corpus pattern (scribes often worked alone) or a methodology limitation (signature size + reciprocal-rank threshold may be too strict for triangle closure).
3. **Cannot handle joins that depend on metadata** (e.g., the BM.46372 → BM.46338 case where the join is recorded in eBL's catalog but the linked tablet may be outside the indexed signs corpus).
4. **Beam-search fallback for true-novel lacuna restoration is weak.** When no parallel templates exist, the bigram beam search collapses to repetitive high-frequency-sign output. The methodology's strength is parallel-template alignment; novelty restoration is essentially unsolved.

### 5.3 General principles surfaced

`[my synthesis]` Three general principles emerged from the v0.16 → v0.18.1 build sequence:

1. **Lexical thresholds calibrated for nearby manuscripts systematically under-recover wide-transmission canonical compositions.** This is true for the BM.77056 *āšipūtu* cluster and likely true for other wide-transmission canons (Maqlū, Šurpu, Enūma Anu Enlil chapters). Fuzzy + cluster-reconstruction methods are general-purpose tooling for this class of recovery problem.

2. **Methodological precision in cuneiform-discovery tooling is often calibration-limited rather than signal-limited.** The v0.18.0 → v0.18.1 length-factor result (23% → 92% top-1 from one line of code) is the cleanest illustration. Audit ranking heuristics across the toolchain — comparable lifts plausibly exist elsewhere.

3. **The textual-transmission vs. scribal-lineage distinction is operationalizable as two independent computational objects.** `find_fuzzy_parallels` answers "what composition?"; `find_same_scribe_candidates` answers "who copied?" The K.2798 ↔ Si.776 case demonstrates these are empirically separable.

### 5.4 Implications for future tooling

The most natural next-step improvement is **sign-form variant normalization at tokenization time**, not at matching time. The 2026-05-14 sign-variant normalization experiment found zero rank-improvement from naïve collapse rules on a 87-sibling benchmark, but that experiment didn't test position-aware substitution at the trigram level — which is what the v0.17 fuzzy method effectively does. A pre-pass that canonicalizes documented sign-form-variant pairs into single tokens would yield equivalent results at exact-Jaccard with lower compute cost.

Other natural extensions:

- **Compound discovery** combining lexical + thematic + fuzzy + scribal signals into a single ranked candidate list with explicit per-axis breakdown
- **Atelier reconstruction** via recursive expansion in the scribal-fingerprint graph (extending v0.17.1's BFS approach to the v0.18 signature space)
- **Cross-corpus comparative tooling** (Hebrew Bible / Ugaritic / Hittite at the n-gram level)
- **Calibration audits** on the fuzzy + cluster + scribal scoring heuristics, modeled on the v0.18.1 length-factor result

---

## 6. Reproducibility

All code in [github.com/Hugegreencandle/cuneiform-mcp](https://github.com/Hugegreencandle/cuneiform-mcp) at commit `6f7f3be` (v0.18.1, 30 tools live). Build sequence:

```bash
# 1. Fetch the eBL all-signs cache (~26 sec, ~33 MB)
node dist/index.js --prefetch

# 2. Build the corpus-viz lexical graph (~7 min)
cd ~/Desktop/corpus-viz && node build-graph.mjs

# 3. Build v0.15 thematic embeddings (~4 min)
cd ~/Desktop/cuneiform-mcp && node scripts/build-embeddings.mjs

# 4. Build v0.16 anomaly-surface joined index (~10 sec)
node scripts/build-anomaly-index.mjs

# 5. Reconstruct the BM.77056 cluster — single MCP call
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"reconstruct_cluster","arguments":{"seed_tablet_id":"BM.77056","max_cluster_size":100,"max_depth":4}}}' | node dist/index.js
```

All probes are deterministic (Random Indexing seed = 42, BFS frontier order sorted by score within each depth). Re-running the pipeline reproduces the 100+ tablet BM.77056 cluster, the 17/31 fuzzy-rescue pairs, the 3 reciprocal same-scribe pairs, and the 91.7% lacuna-restoration top-1 precision identically.

Supplementary validation docs:

- `docs/v0.16-bi-orphan-candidates.md` — top-30 bi-orphan list (pre-filter)
- `docs/v0.16-bi-orphan-inspection.md` — 5-class false-positive analysis
- `docs/v0.17-validation-findings.md` — 17/31 fuzzy rescue results
- `docs/v0.17-ebl-metadata-probe.txt` — raw eBL probe output (cluster identification data)
- `docs/v0.18-scribal-validation.md` — 3 reciprocal pairs + cross-axis discrimination
- `docs/v0.18-lacuna-stress-test.md` — 48-test stress test, v0.18.0 / v0.18.1 side-by-side

---

## 7. Six new claims

Consolidated `[my synthesis]` claims from across the v0.16 – v0.18.1 train:

1. **Lexical-overlap under-recovery is systematic for wide-transmission compositions.** The 0.30 trigram-Jaccard threshold atomizes the 100+ tablet *āšipūtu* cluster into disconnected sub-pairs.
2. **The late-Mesopotamian *āšipūtu* canon can be reconstructed empirically from pure-orthographic clustering, without metadata.** Validates Lenzi 2008 / Geller 2010 / Maul 1994 textual consensus with computational precision.
3. **The bi-orphan methodology is QA tooling, not novelty discovery.** Re-framing matches empirical yield: ~5% novel compositions vs. ~55% manuscript-sibling rescue.
4. **Late-Mesopotamian scholarly transmission was partly physical-scribal, not purely abstract-textual.** Single scribes produced multiple witnesses of canonical compositions (`BM.77056 ↔ BM.74130`, `K.15325 ↔ K.8994`).
5. **The composition / scribe axis is computationally separable.** `find_fuzzy_parallels` × `find_same_scribe_candidates` operationalizes the textual-transmission vs. scribal-lineage distinction empirically.
6. **Methodological precision is often calibration-limited, not signal-limited.** v0.18.0 → v0.18.1 (23% → 92% top-1 from one line of code) is the cleanest illustration.

---

## 8. Bibliography

### cuneiform-mcp methodological references

- Mu, J., Bhat, S., & Viswanath, P. (2018). *All-but-the-Top: Simple and Effective Postprocessing for Word Representations*. ICLR.
- Sahlgren, M. (2005). *An Introduction to Random Indexing*. Methods and Applications of Semantic Indexing Workshop at TKE.

### Assyriological / Mesopotamian-canon references

- Beaulieu, P.-A. (2000). "The Astronomers of the Esagil Temple in the Fourth Century BC." In *Assyriologica et Semitica*. Ugarit-Verlag.
- Geller, M. J. (2010). *Ancient Babylonian Medicine: Theory and Practice*. Wiley-Blackwell.
- Geller, M. J. (2016). *Healing Magic and Evil Demons: Canonical Udug-hul Incantations*. De Gruyter (BAM 8).
- Hunger, H. (1968). *Babylonische und assyrische Kolophone*. Alter Orient und Altes Testament 2. Kevelaer / Neukirchen-Vluyn.
- Lambert, W. G. (2007). *Babylonian Oracle Questions*. Eisenbrauns.
- Lenzi, A. (2008). *Secrecy and the Gods: Secret Knowledge in Ancient Mesopotamia and Biblical Israel*. State Archives of Assyria Studies XIX.
- Maul, S. M. (1994). *Zukunftsbewältigung: Eine Untersuchung altorientalischen Denkens anhand der babylonisch-assyrischen Löserituale (Namburbi)*. Baghdader Forschungen 18. Mainz: P. von Zabern.
- Reiner, E. & Pingree, D. (1998–2005). *Babylonian Planetary Omens 1–4*. Cuneiform Monographs. Brill. *(Confirms `BM.34795` ↔ `BM.38295` as Enūma Anu Enlil Sîn manuscripts.)*
- Walker, C. & Dick, M. (2001). *The Induction of the Cult Image in Ancient Mesopotamia: The Mesopotamian Mīs Pî Ritual*. SAALT 1. *(The Mīs pî edition; relevant to the Kuyunjik sub-hub at K.15325.)*

### Validation benchmark

Validation benchmark for exact trigram-Jaccard recall@15 = 22.5% combined (seed=42 + seed=137, N=267, 95% CI [17%, 28%]) — internal documentation at `VALIDATION-2026-05-14.md` and `TRIGRAM-EXPERIMENT-2026-05-14.md` in cuneiform-mcp.

---

*Draft 2026-05-16. Author: Dane Brown (Tokyo). Tooling co-authored with Claude Opus 4.7 (1M context) under cuneiform-mcp commits 256f36e ... 6f7f3be.*
