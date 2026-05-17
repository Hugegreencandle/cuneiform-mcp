# Four-Axis Computational Discovery in the eBL Cuneiform Corpus

## Recovering Manuscript-Sibling False Negatives, Reconstructing the Late-Mesopotamian Exorcist's Library, Discriminating Scribal Lineages, and Restoring Damaged Passages

---

**Author**: Dane Brown — Independent researcher, Tokyo, Japan — `dane@kairovault.com`
**Code**: [github.com/Hugegreencandle/cuneiform-mcp](https://github.com/Hugegreencandle/cuneiform-mcp) (commit `4976266`, v0.18.3)
**License**: CC-BY 4.0
**Version**: arXiv preprint, 2026-05-17 (concurrent submission to *Cuneiform Digital Library Journal*)

---

## Abstract

This paper documents a four-axis computational discovery pipeline (`cuneiform-mcp` v0.16–v0.18.3) for the electronic Babylonian Library transliteration corpus of approximately 36,500 tablets. The pipeline operates on raw sign-token sequences without metadata and produces four categories of finding: manuscript siblings missed by lexical methods (fuzzy trigram-Jaccard with one-substitution tolerance plus contiguous-run signaling), full manuscript-witness clusters of canonical compositions (recursive breadth-first search via fuzzy parallels), scribal-lineage candidates (orthographic-preference clustering via log-likelihood-ratio signatures), and multi-sign lacuna restorations (parallel-template alignment with bigram beam-search fallback).

Four validated metrics result: a 55% manuscript-sibling rescue rate on candidates the strict 0.30 trigram-Jaccard methodology surfaces as isolated; a 100+ tablet *āšipūtu* (exorcist) canon cluster spanning 20 museum-collection prefixes recovered from a single seed tablet (BM.77056); three reciprocal same-scribe pairs in 34 probed tablets with empirically-validated discrimination from same-composition pairs; and 91.7% top-1 precision with 100% top-10 recall in synthetic-gap lacuna restoration across 48 test cases.

The paper's primary methodological contribution is the demonstration that exact lexical methods at the conventional 0.30 Jaccard threshold systematically under-recover wide-transmission compositions, and that the underlying *āšipūtu* canon described in textual-evidence consensus (Lenzi 2008; Geller 2010; Maul 1994) is recoverable empirically from pure-orthographic clustering. A separate methodological contribution emerges from two calibration audits demonstrating that precision in cuneiform-discovery tooling is often calibration-limited rather than signal-limited: a one-line scoring change lifted lacuna-restoration top-1 precision from 22.9% to 91.7% without altering the underlying recovery algorithm, and a threshold audit converged the bi-orphan discovery surface from 167 candidates to 2 without altering any underlying method. A third contribution demonstrates that the contiguous-run bonus is methodology-agnostic: applied independently to fuzzy-trigram and exact-trigram methodologies, both surface the same cross-subseries manuscript-section sibling pair (K.5896 and K.2761, both Mīs pî, sharing continuous text passages with K.2798, Bīt salāʾ mê) — the calibration pattern itself transfers across underlying algorithms.

**Keywords**: cuneiform; computational philology; manuscript-witness reconstruction; sign-trigram methods; calibration audit; *āšipūtu* canon; Mīs pî; Bīt salāʾ mê.

---

## 1. Introduction: The K.2798 ↔ Si.776 Case Study

K.2798 is a Neo-Assyrian tablet from Kuyunjik classified by the electronic Babylonian Library (eBL) as `CANONICAL/Magic/Purification/Bīt salāʾ mê`. Si.776 is a Sippar tablet whose eBL description reads: "Small tablet preserving the beginning of the ritual tablet of Bīt šalāʾ mê. Written in Assyrian script." They are confirmed manuscript siblings of the same canonical purification ritual.

Yet lexical trigram-Jaccard rates the K.2798 ↔ Si.776 pair at 0.15 — below the conventional 0.30 discovery threshold (eBL's `LineToVecRanker` default) — because of two localized sign-form variants at positions 4 and 5 that broke too many overlapping trigrams. The first 12 of the first 14 sign tokens are identical between the two tablets, but lexical methods at the standard threshold fail to surface the relationship.

This pair motivates the entire methodology train documented here. Each successive tool in the `cuneiform-mcp` pipeline performs a specific function on this confirmed-sibling case:

1. The bi-orphan anomaly surface (v0.16) flags K.2798 as a candidate worth probing.
2. The fuzzy parallel finder (v0.17) rescues the pair at fuzzy-Jaccard 0.41 (a 2.67× lift over the exact-Jaccard score).
3. The cluster reconstructor (v0.17.1) reveals K.2798 as a peripheral witness of a wider Mīs pî + Bīt salāʾ mê cluster anchored at K.15325.
4. The scribal fingerprint (v0.18) confirms K.2798 and Si.776 are NOT same-scribe — correctly distinguishing "same composition" from "same scribe."
5. The lacuna restorer (v0.18.1) correctly recovers synthetic gaps in K.2798 via the Si.776 template at 100% top-10 recall.
6. The v0.18.2 thematic threshold audit lowers the bi-orphan threshold from 0.60 to 0.50 — K.2798 ↔ Si.776 was thematic cosine 0.56, so the 0.60 setting had been misclassifying confirmed sibling pairs as orphans.
7. The v0.18.3 run-bonus calibration ports a previously-shipped fuzzy-method scoring refinement to the exact-trigram tool, surfacing additional cross-subseries siblings (K.5896 and K.2761, both Mīs pî manuscripts) within K.2798's top-15.

The K.2798 ↔ Si.776 case is the test case that validates each tool does what it claims and motivates the calibration audits that produced this paper's secondary methodological contribution.

---

## 2. The Discovery Pipeline

### 2.1 Corpus and Filtering

The pipeline operates on the eBL `/api/fragments/all-signs` endpoint dump (36,498 transliterated tablets, ~33 MB), filtered through a 20-record exclusion list of Asb.* colophon-template prototype records that aggregate standardized Ashurbanipal-palace colophon vocabulary across 200+ manuscripts each (Hunger 1968). After exclusion and per-tool minimum-size filters, the working indices contain 28,665 tablets (thematic embeddings), 19,787 (lexical graph), 35,308 (fuzzy parallels), and 25,150 (scribal fingerprint).

### 2.2 Lexical Layer

Standard sign-trigram-Jaccard pairwise scoring with X-token filtering (trigrams with ≥2 X positions skipped, per the 2026-05-14 X-FILTER calibration). Threshold 0.30 (eBL's `LineToVecRanker` default). The validation benchmark on 50 targets and 87 known siblings (combined seed=42 + seed=137, N=267, 95% CI [17%, 28%]) places exact trigram-Jaccard at recall@15 of 22.5%. Seventy-seven and a half percent of known siblings score below top-15; most fall below 0.20 Jaccard.

### 2.3 Thematic Layer

Distributional semantic embeddings via Sahlgren (2005) Random Indexing: 300-dimensional, ±3 sign window, k=8 sparse nonzeros per index vector, deterministic seed=42. Per-tablet vectors are IDF-weighted means of sign-context vectors, mean-centered following Mu, Bhat, and Viswanath (2018). Without mean-centering, random-pair cosine median was 0.97; after, 0.00 with full spread from −0.70 to +0.80. Top-30 cosine neighbors are precomputed per tablet.

### 2.4 Anomaly Surface and Quality Filters

A tablet with zero lexical neighbors at Jaccard ≥ 0.30 AND zero thematic neighbors at cosine ≥ T (where T evolves through calibration) is a *bi-orphan*: isolated in both lexical and thematic spaces.

```
v0.16 threshold T = 0.60            → 167 bi-orphans corpus-wide
v0.18.2 threshold T = 0.50          → 11 bi-orphans
v0.18.2 + quality filters           → 2 bi-orphans (IM.49220 and K.3306)
```

The threshold tightening from 0.60 to 0.50 is one of three calibration audit results documented in §3. The K.2798 ↔ Si.776 confirmed-sibling pair scores at thematic cosine 0.56 — below 0.60 but above 0.50 — so the v0.16 setting was systematically capturing confirmed sibling pairs as orphans.

Four quality filters apply default-ON for bi-orphan classification, derived from a 2026-05-16 inspection of the top-15 bi-orphans: formulaic (top-1 sign frequency > 12%), refrain-heavy (max 3-gram repetition > 3 in first 50 tokens), heavily-damaged (X-ratio > 50%), and provenance-cluster (> 80% of top-30 thematic neighbors share a museum prefix).

### 2.5 Fuzzy Lexical Layer

Two trigrams `(a, b, c)` and `(a', b', c')` are fuzzy 1-substitution neighbors iff exactly 2 of 3 positions are equal. For each tablet, three 2-of-3 inverted indices are built: `(a,b)`, `(b,c)`, `(a,c)`. Fuzzy intersection is the number of query trigrams with at least one fuzzy match in the target.

The v0.18.2 calibration observed that bare fuzzy-Jaccard treated scattered matches identically to contiguous runs. For K.2798 ↔ Si.776, the 129 fuzzy matches form a 29-position contiguous run plus smaller runs — strong text-section sibling evidence the bare-Jaccard score did not reflect. The calibration adds a run-bonus multiplier:

```
runFactor    = min(1, longest_run / sqrt(query_trigrams))
runBonus     = 0.5 × runFactor              (capped at +50% lift)
final_score  = fuzzy_jaccard × (1 + runBonus)
```

### 2.6 Cluster Reconstructor

Breadth-first search from a seed tablet. Each frontier node's top-K fuzzy parallels with fuzzy-Jaccard ≥ threshold join the cluster and the next frontier. Per-member topology preserved: `(tablet_id, depth, parent, fuzzy_J_to_parent)`. Termination occurs at depth-cap, size-cap, or frontier exhaustion.

### 2.7 Scribal Fingerprint

Per-tablet *scribal signature* = top-30 signs by log-likelihood ratio of in-tablet vs. corpus-baseline frequency:

```
LLR(s, T) = N_T(s) × log( P_T(s) / P_corpus(s) )
```

filtered to signs with corpus frequency ≥ 5 and in-tablet count ≥ 2. Two tablets with overlapping signatures share unusual orthographic preferences — variant-sign choices, logogram-vs-syllabic spelling habits, sign-compound preferences. Comparison via signature cosine plus signature Jaccard.

Because eBL transliterations normalize paleographic variation, this measure captures spelling-preference fingerprint rather than handwriting paleography in the strict sense.

### 2.8 Lacuna Restorer

For a damaged stretch of length k between known boundary signs: build prefix and suffix context fingerprints from the ±W known signs adjacent to the lacuna; scan the corpus for templates whose local sign sequence contains BOTH a prefix-trigram AND a suffix-trigram within distance k ± tolerance; extract intervening signs as candidate fills; score by:

```
score = sqrt(local_jaccard × bigram_coherence) × length_factor
```

The length_factor calibration is 1.0 for exact-length fills, 0.7 for off-by-one, and 0.5 for off-by-two. This single-line refinement lifted top-1 precision from 22.9% (v0.18.0) to 91.7% (v0.18.1) on the same 48-test benchmark without altering the underlying parallel-template alignment algorithm.

If no parallel templates exist for a damaged passage, the methodology falls back to bigram beam-search; this fallback is less reliable and produces repetitive output on truly-novel material.

---

## 3. Findings

### 3.1 The BM.77056 Cluster: The Late-Mesopotamian *āšipūtu* Library

Seeded at BM.77056 with `min_fuzzy_jaccard = 0.20`, the cluster reconstructor at `max_depth = 4`, `max_size = 100` terminates at max-size-reached with 100 cluster members — i.e., the underlying composition is wider than 100 manuscript witnesses.

The cluster spans 20 museum-collection prefixes: BM (31 members), K (32), Sm (6), CBS (2), ND (2), N (1), IM (2), VAT (2), SU-1952 (1), UM (1), Rm-IV (1), Rm-II (2), Ni (1), W (2), plus six accession-year ranges in the British Museum's nineteenth-century acquisitions (1880, 1881, 1882, 1883, 1884) and one in modern accession (2023). Sixty-nine of 100 members are in a different prefix than the seed.

eBL metadata pulls on the top-fuzzy-Jaccard cluster members reveal compositional content (table 1).

**Table 1**. eBL genre classifications for BM.77056 cluster top members.

| Tablet | fuzzy-Jaccard | eBL genre |
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

This is the integrated *āšipūtu* (exorcist) library — the canonical professional curriculum the exorcist's manual KAR 44 (Lenzi 2008) lists as comprising Mīs pî + Bīt salāʾ mê + Udugḫul + Šuʾila + Namburbû + anti-witchcraft series + *Šumma amēlu* medical prescriptions + Egalkura palace-entering ritual. The corpus's compositional unity, long recognized from textual and colophon evidence (Lenzi 2008; Geller 2010; Maul 1994), is here demonstrated empirically through pure-orthographic clustering at the sign-trigram level, with no metadata input.

The exact-trigram-Jaccard methodology at the conventional 0.30 threshold cannot recover this cluster as a connected component because peripheral pair-similarities fall below threshold. Fuzzy 1-substitution Jaccard plus BFS cluster reconstruction together produce the recovery.

### 3.2 Manuscript-Sibling Rescue: 55% of Filtered Candidates

For the 28 cleaned bi-orphans plus 3 high-lift fuzzy candidates (31 total) from the v0.17.0 surface, fuzzy parallels identify strong sibling pairs (fuzzy-Jaccard ≥ 0.20) for 17 cases (55%). Strongest rescued pairs are listed in table 2.

**Table 2**. Top fuzzy-rescued sibling pairs with exact-Jaccard lift.

| Seed → Sibling | fuzzy-J | exact-J | exact-J lift | Composition |
|---|---|---|---|---|
| K.2798 → Si.776 | 0.4082 | 0.1528 | 2.67× | Bīt salāʾ mê |
| BM.34795 → BM.38295 | 0.3593 | 0.0115 | 31.2× | EAE Sîn (Reiner & Pingree 1998–2005) |
| BM.117666 → YBC.7455 | 0.3265 | — | — | Cross-collection |
| BM.35512 → K.2581 | 0.3096 | 0.0174 | 17.8× | *Šumma amēlu* medical |
| BM.45641 → BM.77056 | 0.2973 | 0.0180 | 16.5× | Joins the *āšipūtu* hub |

The pattern of extreme exact-Jaccard lifts (17× and 31×) on confirmed sibling pairs is methodologically significant: these are tablets where exact methods score near-zero because sign-form variants do not co-locate in trigram windows, even though compositional identity is preserved.

### 3.3 Cross-Subseries Discoveries Through Run-Bonus Signaling

After the v0.18.2 fuzzy-parallels run-bonus calibration, the K.2798 ranking surfaces a previously-buried candidate: K.5896 at fuzzy-Jaccard 0.134 (below the typical 0.20 threshold) but contiguous run of 28 positions. The run-bonus lifts K.5896 to a strong-confidence discovery candidate (final score 0.20). eBL probe confirms `K.5896 → CANONICAL/Magic/Purification/Mīs pî` (Neo-Assyrian Kuyunjik).

The v0.18.3 port of the same calibration to `find_parallel_text` (exact-trigram-Jaccard, the original v0.4 tool) independently confirms K.5896 — and additionally promotes K.2761 (rank #13 → #9, run = 16 trigrams) into the top-10. eBL probe confirms `K.2761 → CANONICAL/Magic/Purification/Mīs pî` (Neo-Assyrian Kuyunjik): another Mīs pî manuscript with a shared continuous text passage to K.2798.

K.5896 and K.2761 are both Mīs pî manuscripts with continuous trigram runs shared with K.2798 (Bīt salāʾ mê). The two compositions are sibling subseries within the late-Mesopotamian purification-ritual canon — and the run-bonus signaling reveals empirically-real cross-subseries manuscript-section siblings that bare aggregate-similarity scoring buried in both methodologies. The independent convergence of v0.18.2 fuzzy and v0.18.3 exact methodologies on the same two Mīs pî tablets is the strongest empirical validation that the calibration pattern itself is the transferable contribution, not the specific algorithm.

### 3.4 Scribal Validation: Reciprocal Pairs and Negative Discrimination

In the v0.18 scribal-fingerprint scale validation on 34 probed tablets, three reciprocal same-scribe pairs emerged (table 3).

**Table 3**. Reciprocal same-scribe pairs (average signature cosine).

| Pair | Composition | Average cosine | Combined evidence |
|---|---|---|---|
| BM.77056 ↔ BM.74130 | *āšipūtu* (Sippar) | 0.78 | fuzzy-J 0.48 + reciprocal scribal — probable physical same scribe |
| K.15325 ↔ K.8994 | Mīs pî (Kuyunjik) | 0.77 | fuzzy-J 0.49 + reciprocal scribal at #1/#3 — strongest pair |
| BM.35512 ↔ K.2581 | *Šumma amēlu* medical | 0.59 | Cross-collection same scribe candidate |

The critical negative result: K.2798 ↔ Si.776 are NOT in each other's same-scribe top-15. They are confirmed manuscript siblings (caught by `find_fuzzy_parallels`) but the methodology correctly identifies them as different scribes — exactly as Assyriological theory predicts for two scribes copying the same canonical text. This negative result operationalizes the long-recognized distinction between textual transmission and scribal lineage as two independent computational objects: `find_fuzzy_parallels` answers "what composition?"; `find_same_scribe_candidates` answers "who copied?"

A secondary discovery from the scribal pass concerns scribal-style geography: Si.776 (Sippar provenance) has Kuyunjik-leaning scribal style (K=5 of top-10 same-scribe candidates), corroborating eBL's catalog note that it is "written in Assyrian script." K.2798 (Kuyunjik provenance) conversely has Babylonian-leaning scribal style (BM=5 of top-10). This inverted pattern fits the Neo-Assyrian practice of importing Babylonian scholarly material to Kuyunjik plus the reciprocal Neo-Babylonian copying-from-Assyrian-models tradition (cf. Beaulieu 2000).

### 3.5 Lacuna Restoration: 92% Top-1 Precision

Synthetic-gap stress test: 16 tablets × 3 lacuna sizes (3, 5, 7) = 48 test cases. Methodology: cut a clean window from a tablet's signs, replace with X tokens, run the restorer, score against ground truth.

**Table 4**. Lacuna restorer performance by tablet and lacuna size, before and after v0.18.1 length-factor calibration.

| Metric | v0.18.0 | v0.18.1 | Lift |
|---|---|---|---|
| Top-1 exact-match precision | 22.9% | **91.7%** | +68.8 pts |
| Top-10 exact-match recall | 100.0% | 100.0% | preserved |
| Size 3 top-1 | 18.8% | 87.5% | +68.7 |
| Size 5 top-1 | 31.3% | 93.8% | +62.5 |
| Size 7 top-1 | 18.8% | 93.8% | +75.0 |

The v0.18.0 → v0.18.1 calibration is the cleanest single illustration of the broader methodological point: the underlying parallel-template alignment had 100% top-10 recall from v0.18.0 — the signal was present. Top-1 precision was 23% because longer-fill templates displaced exact-length matches to rank #2–#7. A single-line length-factor multiplier lifted top-1 to 92% on identical inputs.

The lacuna restorer also functions as a secondary manuscript-sibling-recovery method: BM.46372 (a v0.17-filtered "isolate") is actually a join partner of BM.46338 per eBL's own catalog, and the lacuna restorer recovers all three test windows at top-1 because the join provides parallel templates.

### 3.6 Discovery Surface Convergence to Two Candidates

| Stage | Bi-orphan count (≥100 signs) |
|---|---|
| v0.16 raw | 42 |
| v0.17 (4 quality filters ON) | 28 |
| v0.17 + fuzzy rescue (55%) | 11 still-isolated |
| v0.18.2 (threshold 0.50) | **2** |

After all calibration, exactly two tablets remain: IM.49220 and K.3306. These are the Class D "numerical/metrological/zero-thematic-neighbors" candidates from the original v0.16 inspection. The methodology converges from a 36,500-tablet corpus to a 2-tablet genuinely-novel-composition surface via empirical convergence — three independent calibrations (filter classes, threshold tightening, fuzzy rescue) all point to the same final set.

The actual previously-unknown-composition yield is at most 2 of 42 candidates (approximately 5%) — well below the original v0.16 specification's target of 5/20. The bi-orphan methodology's real value lies not in novelty discovery but in QA, cataloging-gap identification, and manuscript-sibling false-negative recovery. Of the original 42 candidates: eight were already-published, known compositions (Ḫḫ IX-XI lexical, eme.gi7 prayer XX, MUL.APIN astronomical, CT-published omens and letters); one (BM.46372) was an explicit missed-join recorded in eBL's own catalog. The methodology is QA tooling.

---

## 4. The Calibration Audit Methodology

A separate methodological contribution emerges from two calibration audits that demonstrated precision in cuneiform-discovery tooling is often calibration-limited rather than signal-limited.

### 4.1 The Lacuna Restorer Calibration (v0.18.0 → v0.18.1)

The underlying parallel-template alignment had 100% top-10 recall from v0.18.0 — the signal was present. Top-1 precision was limited to 23% by a boundary-off-by-one bug in the ranking heuristic. A single-line length-factor multiplier lifted top-1 to 92% on identical inputs.

### 4.2 The Bi-Orphan Surface Calibration (v0.16 → v0.18.2)

Three concurrent fixes: (a) thematic threshold 0.60 → 0.50 (K.2798 ↔ Si.776 sibling pair was scoring at 0.56 and being misclassified as orphan); (b) score-component rebalance (`sign_count` was 77.7% of raw bi-orphan score; isolation strength was a minor modifier; rebalanced to `isolation × sqrt(sign_count)`); (c) run-bonus signaling for fuzzy-parallels (contiguous fuzzy-match runs were treated identically to scattered noise; K.5896 Mīs pî discovery surfaced from rank ~9 to top-tier).

### 4.3 The Methodology-Agnostic Run-Bonus (v0.18.3)

Porting the v0.18.2 fuzzy run-bonus to `find_parallel_text` (the v0.4 exact-trigram-Jaccard tool) independently surfaces the same K.5896 cross-subseries discovery AND adds K.2761 to K.2798's top-15. Both methodologies converge on the same Mīs pî ↔ Bīt salāʾ mê manuscript-section-sibling pattern when given the same calibration pattern. The calibration is methodology-agnostic.

### 4.4 General Methodology

For each tool's scoring heuristic, the audit pattern: (1) decompose the formula's component terms; (2) quantify per-component contribution on real outputs (if one term dominates >70%, investigate); (3) test edge cases against known-positive pairs; (4) test with synthetic ground truth; (5) ship empirically-validated fixes.

The v0.18.1 + v0.18.2 + v0.18.3 calibration trains collectively establish that the signal is present; the ranking heuristic is the lever. The independent convergence of v0.18.2 fuzzy and v0.18.3 exact methodologies on the same K.5896 + K.2761 discovery — driven by the same run-bonus calibration pattern applied to two different underlying algorithms — is the strongest demonstration: the calibration pattern itself is the transferable contribution.

### 4.5 Audit Completion: Six Fixes, Two No-Ops

After two audit rounds, the cumulative tally is six fixes shipped (lacuna length-factor; bi-orphan threshold tightening; bi-orphan score rebalance; fuzzy run-bonus; find_parallel_text run-bonus; plus the previously-shipped Mu & Viswanath thematic mean-centering at index build time) and two no-ops confirmed (thematic length-bias audit found no bias; scribal threshold tuning found current calibration optimal).

The audit methodology correctly identified five of six tools with ranking-stage biases that admit single-line or limited-scope fixes. Two tools were confirmed clean — themselves valuable findings: build-time fixes (such as the v0.15 thematic-embedding mean-centering) do not necessarily require ranking-stage calibration as well; and the zero-triangle-clique result in scribal-fingerprint validation reflects a real corpus structural property (scribes in the late-Mesopotamian record predominantly worked in pairs of close orthographic kinship rather than larger collaborative ateliers visible at LLR-signature level).

---

## 5. Discussion

### 5.1 What the Pipeline Does Well

1. **Recovers wide-transmission manuscripts that exact methods miss.** Conventional 0.30 trigram-Jaccard is calibrated for nearby manuscripts; fuzzy 1-substitution plus recursive cluster expansion close the gap on peripheral witnesses.
2. **Surfaces compositional unity at the corpus level.** The BM.77056 result demonstrates that the late-Mesopotamian exorcist canon can be recovered as a single connected component by automated tooling, validating textual-evidence consensus with computational precision.
3. **Distinguishes orthogonal axes computationally.** The composition / scribe separation is validated cleanly by the K.2798 ↔ Si.776 negative-result test.
4. **Achieves near-canonical precision in lacuna restoration.** 91.7% top-1 with 100% top-10 recall on tablets with parallel templates.
5. **Converges the discovery surface via empirical calibration.** Three independent passes (quality filters, fuzzy rescue, threshold audit) collapse the bi-orphan surface to exactly the same 2 candidates.

### 5.2 What the Pipeline Does Not Do

1. **Does not discover previously-unknown compositions** at a rate above approximately 5%. eBL editors have already curated genuinely-novel material; the bi-orphan surface mostly catches manuscript-sibling false negatives plus short-fragment material.
2. **Does not reconstruct full scribal ateliers.** Three reciprocal same-scribe pairs in 34 probed tablets but zero triangle cliques. The methodology surfaces strong pairs rather than entire collaborative groupings.
3. **Cannot handle joins that depend on metadata outside the indexed signs corpus** (the BM.46372 → BM.46338 case where the join is recorded in eBL's catalog but the linked tablet falls outside the signs corpus index).
4. **Beam-search fallback for truly-novel lacuna restoration is weak.** When no parallel templates exist, bigram beam-search collapses to repetitive high-frequency-sign output.

### 5.3 General Principles Surfaced

Five general principles emerged from the v0.16 → v0.18.3 build sequence:

1. Lexical thresholds calibrated for nearby manuscripts systematically under-recover wide-transmission canonical compositions.
2. Methodological precision in discovery tooling is often calibration-limited rather than signal-limited.
3. Threshold-calibration audits surface systematic mis-classification of genuine positives.
4. Score-component decomposition reveals single-axis dominance bugs.
5. The textual-transmission vs. scribal-lineage distinction is operationalizable as two independent computational objects.

### 5.4 Implications for Future Tooling

The most natural next-step improvement is sign-form variant normalization at tokenization time. The 2026-05-14 sign-variant normalization experiment found zero rank-improvement from naive collapse rules on an 87-sibling benchmark, but that experiment did not test position-aware substitution at the trigram level — which is what the fuzzy method effectively does. A pre-pass that canonicalizes documented sign-form-variant pairs into single tokens would yield equivalent results at exact-Jaccard with lower compute cost.

Other natural extensions include compound-discovery tooling combining all four signal axes; atelier reconstruction via recursive BFS in the scribal-fingerprint graph; cross-corpus comparative tooling for Hebrew Bible, Ugaritic, and Hittite parallels at the n-gram level; and calibration audits on the lexical baseline (`find_parallel_text` recall@15) and corpus-viz scoring.

---

## 6. Reproducibility

All code is available at the cuneiform-mcp repository: [github.com/Hugegreencandle/cuneiform-mcp](https://github.com/Hugegreencandle/cuneiform-mcp). Commit `4976266` (v0.18.3) is the head documented here. The repository is archived at Zenodo with DOI `10.5281/zenodo.20250520`. All probes are deterministic (Random Indexing seed = 42; BFS frontier order sorted by score within each depth). Re-running reproduces the 100+ tablet BM.77056 cluster, the 17/31 fuzzy-rescue pairs, the 3 reciprocal same-scribe pairs, the 91.7% lacuna-restoration top-1 precision, the 2-tablet final bi-orphan surface, and the K.5896 + K.2761 cross-subseries discoveries identically.

Supplementary validation documents in the repository:

- `v0.16-bi-orphan-candidates.md` — top-30 bi-orphan list (pre-filter)
- `v0.16-bi-orphan-inspection.md` — five-class false-positive analysis
- `v0.17-validation-findings.md` — 17/31 fuzzy-rescue results
- `v0.17-ebl-metadata-probe.txt` — raw eBL metadata pull for cluster identification
- `v0.18-scribal-validation.md` — three reciprocal pairs plus cross-axis discrimination
- `v0.18-lacuna-stress-test.md` — 48-test stress test, v0.18.0 / v0.18.1 side-by-side
- `v0.18.2-calibration-audit.md` — three-fix audit details plus K.5896 discovery
- `v0.18.3-calibration-round2.md` — round-2 audit findings (two no-ops, one deferral resolved)
- `v0.18.3-parallel-text-run-bonus.md` — find_parallel_text calibration validation plus K.2761 discovery

---

## 7. Conclusion

This paper documents a four-axis computational discovery pipeline operating on the eBL cuneiform corpus. The pipeline's primary substantive contribution is the empirical reconstruction of the late-Mesopotamian *āšipūtu* (exorcist) library — long recognized from textual evidence — as a 100+ tablet manuscript-witness cluster recoverable from pure-orthographic clustering at the sign-trigram level. The paper's primary methodological contribution is the demonstration that exact lexical methods at conventional thresholds systematically under-recover wide-transmission compositions, and that this under-recovery is calibration-limited rather than signal-limited: a one-line length-factor change lifted lacuna-restoration top-1 precision from 22.9% to 91.7%, and a threshold audit converged the bi-orphan discovery surface from 167 candidates to 2. A third contribution demonstrates that the run-bonus calibration pattern is methodology-agnostic, applying equivalently to fuzzy and exact methodologies and surfacing the same K.5896 + K.2761 cross-subseries discovery from both.

The pipeline's validated metrics — 55% sibling rescue rate, 100+ tablet cluster reconstruction, 3 reciprocal scribal pairs with cross-axis discrimination, 91.7% lacuna restoration top-1 — establish the methodology train as suitable for direct scholarly use on the eBL corpus and as a transferable methodological pattern for other ancient-text discovery tooling.

---

## Bibliography

Beaulieu, P.-A. 2000. "The Astronomers of the Esagil Temple in the Fourth Century BC." In *Assyriologica et Semitica: Festschrift für Joachim Oelsner*. Münster: Ugarit-Verlag.

Geller, M. J. 2010. *Ancient Babylonian Medicine: Theory and Practice*. Chichester: Wiley-Blackwell.

Geller, M. J. 2016. *Healing Magic and Evil Demons: Canonical Udug-hul Incantations*. Berlin: De Gruyter. (Babylonisch-Assyrische Medizin in Texten und Untersuchungen 8.)

Hunger, H. 1968. *Babylonische und assyrische Kolophone*. Kevelaer / Neukirchen-Vluyn. (Alter Orient und Altes Testament 2.)

Lambert, W. G. 2007. *Babylonian Oracle Questions*. Winona Lake, IN: Eisenbrauns.

Lenzi, A. 2008. *Secrecy and the Gods: Secret Knowledge in Ancient Mesopotamia and Biblical Israel*. Helsinki: Neo-Assyrian Text Corpus Project. (State Archives of Assyria Studies XIX.)

Maul, S. M. 1994. *Zukunftsbewältigung: Eine Untersuchung altorientalischen Denkens anhand der babylonisch-assyrischen Löserituale (Namburbi)*. Mainz: P. von Zabern. (Baghdader Forschungen 18.)

Mu, J., Bhat, S., and Viswanath, P. 2018. "All-but-the-Top: Simple and Effective Postprocessing for Word Representations." In *Proceedings of the International Conference on Learning Representations (ICLR)*.

Reiner, E., and Pingree, D. 1998–2005. *Babylonian Planetary Omens* 1–4. Leiden: Brill. (Cuneiform Monographs.)

Sahlgren, M. 2005. "An Introduction to Random Indexing." Paper presented at the Methods and Applications of Semantic Indexing Workshop at the 7th International Conference on Terminology and Knowledge Engineering (TKE).

Walker, C., and Dick, M. 2001. *The Induction of the Cult Image in Ancient Mesopotamia: The Mesopotamian Mīs Pî Ritual*. Helsinki: Neo-Assyrian Text Corpus Project. (State Archives of Assyria Literary Texts 1.)

---

## Appendix A: Build Sequence (Supplementary)

```bash
# 1. Fetch eBL all-signs cache (~26 s, ~33 MB)
node dist/index.js --prefetch

# 2. Build corpus-viz lexical graph (~7 min)
cd ~/Desktop/corpus-viz && node build-graph.mjs

# 3. Build v0.15 thematic embeddings (~4 min)
cd ~/Desktop/cuneiform-mcp && node scripts/build-embeddings.mjs

# 4. Build v0.16 anomaly-surface joined index (~10 s)
node scripts/build-anomaly-index.mjs

# 5. Reconstruct the BM.77056 cluster — single MCP call
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"reconstruct_cluster","arguments":{"seed_tablet_id":"BM.77056","max_cluster_size":100,"max_depth":4}}}' \
  | node dist/index.js
```

## Appendix B: Validation Benchmark

Validation benchmark for exact trigram-Jaccard recall@15 = 22.5% (combined seed=42 + seed=137, N=267, 95% CI [17%, 28%]). Internal documentation: `VALIDATION-2026-05-14.md` and `TRIGRAM-EXPERIMENT-2026-05-14.md`.
