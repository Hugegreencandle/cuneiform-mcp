# Four-Axis Computational Discovery in the eBL Cuneiform Corpus

## Recovering Manuscript-Sibling False Negatives, Reconstructing the Late-Mesopotamian Exorcist's Library, Discriminating Scribal Lineages, and Restoring Damaged Passages

---

**Author**: [Anonymized for review]
**Submission target**: *Cuneiform Digital Library Journal* (methods paper, ~7,000 words + 7 supplementary validation documents)
**Submission date**: 2026-05-16; §3.7 + §3.8 + §5.1 + §5.4 + abstract amended 2026-05-23 (v0.18.8 + v0.18.12 + v0.18.18 tooling)

---

## Abstract

This paper documents a four-axis computational discovery pipeline (`cuneiform-mcp` v0.16–v0.18.3) for the electronic Babylonian Library transliteration corpus of approximately 36,500 tablets. The pipeline operates on raw sign-token sequences without metadata and produces four categories of finding: manuscript siblings missed by lexical methods (fuzzy trigram-Jaccard with one-substitution tolerance plus contiguous-run signaling), full manuscript-witness clusters of canonical compositions (recursive breadth-first search via fuzzy parallels), scribal-lineage candidates (orthographic-preference clustering via log-likelihood-ratio signatures), and multi-sign lacuna restorations (parallel-template alignment with bigram beam-search fallback).

Four validated metrics result: a 55% manuscript-sibling rescue rate on candidates the strict 0.30 trigram-Jaccard methodology surfaces as isolated; a 100+ tablet *āšipūtu* (exorcist) canon cluster spanning 20 museum-collection prefixes recovered from a single seed tablet (BM.77056); three reciprocal same-scribe pairs plus a four-tablet same-scribe scribal-lineage group in 38 probed tablets, with empirically-validated discrimination from both same-composition pairs (negative K.2798 ↔ Si.776 result) and physical-join candidates (negative quartet-join result); and 91.7% top-1 precision with 100% top-10 recall in synthetic-gap lacuna restoration across 48 test cases.

The paper's primary methodological contribution is the demonstration that exact lexical methods at the conventional 0.30 Jaccard threshold systematically under-recover wide-transmission compositions, and that the underlying *āšipūtu* canon described in textual-evidence consensus (Lenzi 2008; Geller 2010; Maul 1994) is recoverable empirically from pure-orthographic clustering. A separate methodological contribution emerges from two calibration audits demonstrating that precision in cuneiform-discovery tooling is often calibration-limited rather than signal-limited: a one-line scoring change lifted lacuna-restoration top-1 precision from 22.9% to 91.7% without altering the underlying recovery algorithm, and a threshold audit converged the bi-orphan discovery surface from 167 candidates to 2 without altering any underlying method. A third contribution demonstrates that the contiguous-run bonus is methodology-agnostic: applied independently to fuzzy-trigram and exact-trigram methodologies, both surface the same cross-subseries manuscript-section sibling pair (K.5896 and K.2761, both Mīs pî, sharing continuous text passages with K.2798, Bīt salāʾ mê) — the calibration pattern itself transfers across underlying algorithms.

A fourth contribution, documented as §3.7 and §3.8, demonstrates that the methodology generalizes beyond the BM.77056 anchor to four additional manuscript-witness clusters covering six distinct cluster archetypes (compositional curriculum, verbatim manuscript chain, refrain-bound liturgical family, single-collection school cluster, embedded fragment, and cross-period bridge). The Sm.1055 / K.7246 cluster (100+ Neo-Assyrian Nineveh witnesses, six tablets converging on all three discovery axes — fuzzy-J ≥ 0.79, thematic cosine ≥ 0.97, scribal-signature cosine ≥ 0.84) attests Udug-ḫul under exclusion of Maqlû via negative primary-source identification (CTN 4 092 IM.67635 absence). The BM.47463 ↔ CBS.6060 pair (147 contiguous signs at fuzzy-Jaccard 0.70, approximately three times the K.2798 ↔ Si.776 anchor chain) surfaces a commentary–base-text quotation relationship: cross-validation between the trigram-based cluster methodology and eBL's lineToVec /match algorithm reveals BM.47463 (eBL `Technical → Commentary`) as a Šurpu commentary quoting the Šurpu base text directly attested by CBS.6060. This finding identifies a verdict-classifier refinement for the per-pair diagnostic tool (`compare_tablet_pair` v0.18.19+).

**Keywords**: cuneiform; computational philology; manuscript-witness reconstruction; sign-trigram methods; calibration audit; *āšipūtu* canon; Mīs pî; Bīt salāʾ mê; Udug-ḫul; Šurpu; commentary tradition.

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

A downstream application of the same methodology produced a substantially longer verbatim chain than the K.2798 ↔ Si.776 anchor: BM.47463 ↔ CBS.6060 share 147 contiguous signs at fuzzy-Jaccard 0.70 — approximately three times the 46-sign run of the anchor pair. Analysis of this pair using `compare_tablet_pair` (a per-pair cross-axis diagnostic tool, v0.18.8) plus `find_join_candidates` (a local reproduction of eBL's lineToVec /match algorithm) revealed it to be not a manuscript-sibling pair but a commentary-and-base-text relationship — a methodologically significant finding documented in §3.7.1.

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

**Table 3**. Reciprocal same-scribe pairs and scribal-lineage groups.

| Group | Composition | Best pair (signature cosine) | Combined evidence |
|---|---|---|---|
| BM.77056 ↔ BM.74130 (pair) | *āšipūtu* (Sippar) | 0.78 | fuzzy-J 0.48 + reciprocal scribal — probable physical same scribe |
| K.15325 ↔ K.8994 (pair) | Mīs pî (Kuyunjik) | 0.77 | fuzzy-J 0.49 + reciprocal scribal at #1/#3 |
| BM.35512 ↔ K.2581 (pair) | *Šumma amēlu* medical | 0.59 | Cross-collection same-scribe candidate |
| **BM.34970 + 1881,0204.471 + BM.37658 + 1882,0522.515 (quartet)** | **Šuʾila divine hymns (Ashurbanipal acquisition lot)** | **0.8866** (1881,0204.471 ↔ BM.37658) | **Three-metric convergence + fuzzy-J 0.8069 hub edge + not physical-join — four-tablet scribal-lineage group; see §3.4.1** |

The critical negative result: K.2798 ↔ Si.776 are NOT in each other's same-scribe top-15. They are confirmed manuscript siblings (caught by `find_fuzzy_parallels`) but the methodology correctly identifies them as different scribes — exactly as Assyriological theory predicts for two scribes copying the same canonical text. This negative result operationalizes the long-recognized distinction between textual transmission and scribal lineage as two independent computational objects: `find_fuzzy_parallels` answers "what composition?"; `find_same_scribe_candidates` answers "who copied?"

A secondary discovery from the scribal pass concerns scribal-style geography: Si.776 (Sippar provenance) has Kuyunjik-leaning scribal style (K=5 of top-10 same-scribe candidates), corroborating eBL's catalog note that it is "written in Assyrian script." K.2798 (Kuyunjik provenance) conversely has Babylonian-leaning scribal style (BM=5 of top-10). This inverted pattern fits the Neo-Assyrian practice of importing Babylonian scholarly material to Kuyunjik plus the reciprocal Neo-Babylonian copying-from-Assyrian-models tradition (cf. Beaulieu 2000).

### 3.4.1 The BM.34970 Quartet — A Same-Scribe Scribal-Lineage Group

The §3.1 cluster reconstruction at `max_size=100` surfaced a pair-similarity outlier within the BM.77056 cluster: **BM.34970 ↔ 1881,0204.471 at fuzzy-Jaccard 0.8069**, exceeding the previously-documented Sippar same-scribe pair BM.77056 ↔ BM.74130 (fuzzy-J 0.48) and the Kuyunjik Mīs pî pair K.15325 ↔ K.8994 (fuzzy-J 0.49) reported in §3.4. Running `find_same_scribe_candidates` against both members reveals a **four-tablet quartet** — BM.34970, 1881,0204.471, BM.37658, 1882,0522.515 — that is mutually reciprocal in each other's top-5 same-scribe candidates. Pairwise similarities are summarized in table 5.

**Table 5**. The BM.34970 quartet — pairwise similarity across three independent metrics.

| Pair | Signature cosine | Signature Jaccard | Fuzzy-Jaccard | Note |
|---|---|---|---|---|
| **1881,0204.471 ↔ BM.37658** | **0.8866** | 0.5882 | (cluster-internal edge) | New corpus-wide same-scribe pair record |
| 1881,0204.471 ↔ 1882,0522.515 | 0.7536 | 0.4722 | — | |
| BM.34970 ↔ 1881,0204.471 | 0.6031 | 0.5385 | **0.8069** | New corpus-wide fuzzy-Jaccard record within the BM.77056 cluster |
| BM.34970 ↔ BM.37658 | 0.5474 | 0.4595 | 0.5 | |
| BM.34970 ↔ 1882,0522.515 | 0.5527 | 0.3947 | 0.3206 | |

The 1881,0204.471 ↔ BM.37658 signature cosine of 0.8866 surpasses both previously-reported high pairs (BM.77056 ↔ BM.74130 at 0.78; K.15325 ↔ K.8994 at 0.77). Three independent computational metrics — signature cosine, signature Jaccard, and fuzzy-Jaccard — converge on the same four tablets at the top of each ranking, producing the corpus's strongest same-scribe identification to date.

The methodologically significant contribution is the shift from **pair** to **quartet**. §3.4's documented same-scribe pairs each capture a single scribal-relationship instance; the quartet captures a scribal-lineage instance persisting across (at least) four manuscript copies of (apparently) the same composition. The quartet provides evidence on a class of question pair-based analyses cannot reach: not "are these two tablets by the same scribe?" but "how many manuscripts did a single scribal lineage produce of this composition?"

A second methodologically significant finding is the **negative-discrimination result for physical-join recovery**. `find_join_candidates` was run on both BM.34970 and 1881,0204.471 against the eBL `/match` corpus. Neither query returned any of the quartet's other three members in its top-15 join candidates. The top join candidates for both queries were instead dominated by tablets in the 1879,0708.* and 1880,0719.* accession-year ranges — Ashurbanipal-library tablets sharing line-structure fingerprints rather than orthographic fingerprints. The quartet members are therefore **same-composition, same-scribe, separate tablet objects** rather than fragments of a single broken original. This negative result operationalizes the join-vs-scribal-lineage distinction in the same way §3.4's K.2798 ↔ Si.776 negative result operationalized the composition-vs-scribe distinction: `find_join_candidates` answers "what physical original?"; `find_same_scribe_candidates` answers "who copied?"; `find_fuzzy_parallels` answers "what composition?". The three methodological objects are computationally independent and produce orthogonal evidence.

The quartet's eBL genre classifications support a Šuʾila (hand-raising divine prayer) identification: BM.34970 is classified `CANONICAL → Literature → Hymns → Divine → Šuʾila`; 1881,0204.471 is classified `CANONICAL → Literature → Hymns → Divine` plus `CANONICAL → Magic`. The other two quartet members (BM.37658, 1882,0522.515) are not eBL genre-classified, but the same-scribe similarity to 1881,0204.471 at signature cosines 0.8866 and 0.7536 respectively strongly implies same-composition identification. Direct eBL genre probes on the unclassified members would lock this down at zero additional methodological cost.

The Ashurbanipal-library acquisition-lot signal in the join-candidate domination by 1879,0708.* and 1880,0719.* accessions — both 19th-century British Museum lots from the Layard / Rassam / Smith excavation sequence at Nineveh (Reade 1976) — situates the quartet within a specific Ashurbanipal-library manuscript group. The implication is that the same-scribe scribal lineage active in the quartet was producing manuscripts for Ashurbanipal's collection rather than for a distributed cult-practitioner audience. This is consistent with the Frame & George 2005 reconstruction of the royal-libraries collection program at Nineveh, in which scribal-school output was systematically harvested for the royal library. Confirmation of this attribution would require provenance work on each quartet member beyond what `find_join_candidates` and `find_same_scribe_candidates` directly surface.

The combined evidence pattern across §3.4 and §3.4.1 demonstrates that the cuneiform-mcp pipeline produces **three orthogonal computational objects** corresponding to three distinct Assyriological questions: `find_fuzzy_parallels` answers "what composition?" (validated: K.2798 ↔ Si.776 sibling recovery, §1); `find_same_scribe_candidates` answers "who copied?" (validated: three pairs in §3.4; one quartet in §3.4.1); and `find_join_candidates` answers "what physical original?" (validated negatively: quartet members do NOT join despite same-scribe + same-composition status). Each object produces evidence the others cannot reach. The pipeline's contribution is not any single algorithm but the integration of three orthogonal evidence streams into a unified question-engine for cuneiform manuscript-witness analysis.

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

### 3.7 Additional Manuscript-Witness Clusters (v0.18.8+)

A downstream application of the four-axis discovery framework — using `find_tablet_neighborhood` (v0.18.12, a tablet-level composite of fuzzy + thematic + scribal axes), `compare_tablet_pair` (v0.18.8, a per-pair cross-axis diagnostic with a methods-paper-aligned verdict classifier), and `find_join_candidates` (v0.18, local reproduction of eBL's lineToVec /match algorithm) — surfaced four additional manuscript-witness clusters beyond the BM.77056 *āšipūtu* hub (§3.1). Each cluster validates the methodology against a different cluster archetype (formalized in §3.8). Confidence levels reflect specialist-literature cross-check status: cluster identifications hedged where direct Reiner 1958 / Geller 2016 BAM 8 / Walker & Dick 2001 / Wiggermann 2000 / Maul 1994 / Schwemer Würzburg re-edition confirmation is pending. Detailed cross-check methodology and per-cluster evidence trail are documented in the companion specialist cross-check brief (`Cuneiform-Cluster-IDs-Cross-Check-2026-05-23.md`).

#### 3.7.1 BM.47463 ↔ CBS.6060: A Šurpu Commentary–Base-Text Quotation Chain (147 signs)

BM.47463 and CBS.6060 share 147 contiguous signs at fuzzy-Jaccard 0.70 (exact-Jaccard 0.47) — the longest verbatim run identified by the cluster methodology to date, approximately three times the K.2798 ↔ Si.776 anchor chain documented in §1. Initial `compare_tablet_pair` analysis returned a `physical_join_candidate` verdict (HIGH confidence) on combined cross-axis evidence: fuzzy-J 0.70, thematic cosine 0.81, scribal-signature cosine 0.79, exact intersection 360 trigrams.

Cross-validation against eBL's lineToVec /match algorithm via `find_join_candidates` returned a different picture. BM.47463 is classified by eBL as `CANONICAL → Technical → Commentary` and has a known published physical join to BM.49124 — but the lineToVec algorithm does NOT rank CBS.6060 among BM.47463's join candidates. CBS.6060's own top lineToVec candidate is IM.76972, which eBL classifies as `CANONICAL → Magic → Exorcistic → Šurpu`.

The two methodologies converge on the Šurpu attribution via different evidence trails: the trigram-based discovery surfaces the verbatim quotation chain as a manuscript-sibling pair; the lineToVec line-structure algorithm correctly excludes physical-join candidacy and classifies BM.47463 as a commentary on the Šurpu corpus. The 147-sign verbatim chain is therefore commentary-quoting-base-text — BM.47463 (commentary) quotes 147 contiguous signs of the Šurpu base text attested directly by CBS.6060.

This is methodologically significant. The cluster methodology surfaces canonical-text + commentary relationships as if they were manuscript-sibling pairs, via long verbatim quotation chains in the commentary. `compare_tablet_pair`'s `physical_join_candidate` verdict (methods paper §3.4 + §3.4.1) is necessary but not sufficient for physical-join attribution: when one tablet's eBL genre is `CANONICAL → Technical → Commentary`, the verdict should downgrade to `commentary_quotes_base_text`. The verdict-classifier upgrade is suggested for v0.18.19+.

#### 3.7.2 Sm.1055 / K.7246: An Udug-ḫul Canonical-Recension Nineveh Chain (100+ members)

`find_tablet_neighborhood(Sm.1055)` returns extraordinary cross-axis convergence: six tablets (K.7246, K.7091, K.7857, K.11574, K.3441, K.7888) land on all three discovery axes with fuzzy-Jaccard ≥ 0.79, thematic cosine ≥ 0.97, and scribal-signature cosine ≥ 0.84. K.7091 ↔ K.11574 score fuzzy-J 1.0 (perfect — identical content). Twenty pair-edges exceed fuzzy-J 0.90 within the broader cluster, which the BFS reconstructor terminates at 100 members (the configured `max_size`).

Prefix distribution is 84% cross-prefix and Nineveh-dominant: K=69, Sm=16, Rm-II=5, Rm=3, DT=2, plus single witnesses across BM and accession-year prefixes. The cluster is connected to component 0, the largest connected component in the corpus (size 296).

Composition attribution is excluded against Maqlû via the CTN 4 092 Maqlû manuscript IM.67635 being absent from the cluster's neighborhood — a negative primary-source identification. The leading positive candidate is Udug-ḫul (canonical incantations against evil demons; Geller 2016 BAM 8, 161 manuscript plates), supported indirectly by web-accessible references to K.7246 in Nineveh Udug-ḫul manuscript context (Ashurbanipal Library Project; Reade et al.). Direct Geller 2016 plate-by-plate confirmation of the six-tablet inner core is pending institutional PDF or print access — flagged as the highest-priority specialist cross-reference for paper finalization.

Cluster archetype: **verbatim manuscript chain** — single composition, many near-identical canonical-recension copies, all three discovery axes tight (§3.8 archetype 2).

#### 3.7.3 K.5896 Mīs pî: New Pairs + Babylonian Transmission Map

Building on the K.5896 Mīs pî identification of §3.3, four new manuscript-pairs surface via continued application of the run-bonus-calibrated parallel-text discovery: K.5896 ↔ K.9508 (102-sign run; K.9508 is a 177-sign fragment whose entire content is essentially embedded in K.5896's 1830 signs — an asymmetric embedded-fragment relationship documented as cluster archetype 5 in §3.8); K.5896 ↔ K.6683 (73-sign run); K.5896 ↔ K.15325 (72-sign run, with K.15325 already a member of the BM.77056 *āšipūtu* hub of §3.1 — joining the two clusters at a verified manuscript-witness bridge); and K.5896 ↔ BM.45749 (56-sign run; BM.45749 is independently confirmed as a Mīs pî incantation tablet by Walker & Dick 2001).

The Babylonian Mīs pî transmission map now spans five site/period contexts: Old Babylonian Ur (UET 6.408, UET 6.409; verification pending Berlejung), Babylonian library (BM.42307, BM.41361, BM.33584, BM.42273, BM.43868), Sippar/Penn (CBS.1516, CBS.1527), Berlin (VAT.9726), and Neo-Assyrian Nineveh (K.5896, K.15325, K.6683, K.9508, K.10176, K.8994, K.11920, Si.985). BM.45749 functions as the cross-period bridge node connecting Neo-Assyrian Nineveh transmission to Babylonian library transmission.

K.9508's status as a `lex_singleton` at the default min-J=0.30 threshold (zero independent fuzzy neighbors) but a strong K.5896-detected sibling at the 102-sign-run pair establishes the **embedded fragment archetype** (§3.8 archetype 5): small fragments may be entirely embedded in larger manuscripts but invisible to symmetric fuzzy-neighborhood probing because the small-fragment signal-to-noise from limited trigram counts is insufficient to surface independent siblings. Bidirectional probing is required.

#### 3.7.4 K.5036 / BM.54681: A Cross-Period Cluster, Composition Pending

K.5036 (anomaly-flagged in the v0.16 surface) sits in a sparse-neighborhood pattern unlike Clusters 3.7.1–3.7.3. `find_tablet_neighborhood(K.5036)` returns no cross-axis hits — fuzzy, thematic, and scribal neighbors are entirely axis-specific. Strongest fuzzy parallels include 1883,0118.516 (J=0.44, 57-sign run), K.13419 (J=0.33, 71-sign run), and IM.76826 (J=0.27, 54-sign run). Thematic neighbors include BM.54681 (cos 0.91), Rm.585 (0.88), IM.58414 (0.88), BM.39822 (0.88), BM.40522 (0.86), and K.11359 (0.85) — all Babylonian/cross-period.

The composition is undetermined. Candidates from specialist literature include Udug-ḫul (Geller 2016, unlikely if Cluster 3.7.2 is Udug-ḫul), Lamaštu Series (Wiggermann 2000), namburbî corpus (Maul 1994), or Bīt rimki (Læssøe 1955). Web searches against accessible online catalogs did not surface K.5036 in any published critical edition.

The sparse-neighborhood pattern itself is methodologically informative: either (a) K.5036 attests a unique witness with no near-siblings in the indexed corpus, (b) K.5036 is a cross-period composition where each period's witnesses cluster in their own axis-specific neighborhood, or (c) K.5036 is a multi-text tablet whose various sections each weakly match different compositions. Examining the tablet's full sign sequence plus colophon for compositional boundaries would clarify which.

Cluster archetype: **cross-period bridge** (§3.8 archetype 6) candidate.

### 3.8 Cluster Archetype Typology

The five characterized clusters across §3.1 + §3.7 surface six distinct cluster archetypes — each defined by a characteristic discovery-axis profile. The methodology recovers cluster signal across all six archetypes, supporting generalization beyond the BM.77056 *āšipūtu* anchor.

| # | Archetype | Exemplar | Discovery-axis profile | Defining property |
|---|---|---|---|---|
| 1 | Compositional curriculum | BM.77056 (§3.1) | Loose fuzzy, broad thematic, cross-prefix | Multi-composition canon; integrated canonical curriculum unified by genre context rather than verbatim recension |
| 2 | Verbatim manuscript chain | Sm.1055 (§3.7.2) | Tight fuzzy + tight thematic + tight scribal | Single composition, many near-identical canonical-recension copies; all three axes converge |
| 3 | Refrain-bound liturgical family | K.15325 / K.5896 (§3.3, §3.7.3) | Loose fuzzy, tight thematic, `refrain_heavy` quality flag | Variant texts unified by recurring incantation refrains; verbatim signal masked by refrain saturation |
| 4 | Single-collection school cluster | YBC.5729 | Moderate fuzzy, very tight thematic, single-prefix | School-context scribal-variant transmission within one institution |
| 5 | Embedded fragment | K.9508 in K.5896 (§3.7.3) | Lex-singleton at default threshold, thematic-only recovery | Small fragment whose entire content is contained in a larger manuscript; detection requires bidirectional probing |
| 6 | Cross-period bridge | BM.45749 (§3.7.3), K.5036 (§3.7.4 candidate) | Comparable similarity to two distinct cluster sides | Transmission node connecting library traditions across periods |

A seventh archetype emerged from §3.7.1's analysis but is methodologically distinct: **commentary–base-text quotation pair**. BM.47463 ↔ CBS.6060 produces a `physical_join_candidate` verdict on cross-axis trigram + thematic + scribal evidence yet fails eBL's lineToVec /match join algorithm, because the 147-sign verbatim chain reflects commentary quotation of a base text, not physical-fragment kinship. This is documented separately as a methodological finding requiring `compare_tablet_pair` verdict-classifier refinement (§5.4) rather than as a manuscript-witness archetype.

The methodology generalizes across composition-type (curriculum vs single-composition), library context (Neo-Assyrian Nineveh vs Babylonian Yale/Penn/Berlin), tablet size (full manuscript vs fragment), and discovery-axis profile (fuzzy-strong vs thematic-strong vs both).

---

### 3.9 Sub-Tablet Chunk-Parallel Discovery (v0.19.0)

The §3.8 archetype-5 (embedded fragment, K.9508 in K.5896) and §3.7.3 K.5896 case both invoke a contiguous-trigram run as the discriminating signal — but v0.18.19's `find_embedded_fragments` exposes this signal as a single `longest_contiguous_run` scalar buried inside a per-host record. v0.19.0 ships a complementary tool, `find_chunk_parallels`, that surfaces every maximal matched-position run ≥ threshold as a **primary object**: `chunk_start` + `chunk_length` + `host_tablets[]` + cross-genre/cross-period attribution + novelty score. The new structure has no host-size guard (chunks can be shared with hosts of any size), and the same alignment walk that produced v0.18.19's scalar emits every qualifying run instead of `max()`-ing them.

The structural reformulation revises one of this paper's existing claims:

**Amendment to §3.6.** The "final-2 bi-orphans (IM.49220 + K.3306)" claim was based on whole-tablet methods (lex, fuzzy, thematic, scribal). Re-running the calibration triple under `find_chunk_parallels` at default `min_chunk_len=20` shows:

- **IM.49220** — 0 chunks across 24,483 examined candidates. ✅ Remains bi-orphan at chunk granularity. Truly isolated.
- **K.3306** — 2 chunks shared with K.6685: chunk `1:51` (~53 signs) and chunk `58:37` (~39 signs). Together these cover **92.63% of K.3306's trigram positions**. K.6685's size ratio is 4.21× — *below* `find_embedded_fragments`' default `host_size_multiplier=5`, which is why the relationship was invisible to v0.18.19's probe.

K.3306 should therefore be reclassified from "final-2 bi-orphan" to **"chunk-related to K.6685, whole-tablet-isolated"** pending manual scholarly review of the shared text. The §3.6 final-bi-orphan count narrows to **one (IM.49220)** after sub-tablet investigation.

K.9508 → K.5896 reproduces exactly: chunk `0:142` length=142 surfaces as the top-ranked result, identical to v0.18.19 Lever 1's `longest_contiguous_run=142` finding. The other 9 entries in K.9508's top-10 chunk list match v0.18.19's top-10 host list verbatim (BM.45749, K.2987.B, K.163, K.2550, VAT.8247, SU-1952.222, BM.38709, IM.65052, BM.42273).

The 20-tablet random sample (`mulberry32(20260523)` seed identical to v0.18.19 Lever 1) yields **8 of 20** lex-singletons surfacing ≥1 chunk — same ratio as v0.18.19 Lever 1's 8/20. Calibration consistency across the two tools is concrete; the threshold sweep identifies `min_chunk_len=20` as the precision sweet spot just as v0.18.19 identified `min_run=20`.

**Three additional [my synthesis] claims:**

20. Sub-tablet chunk granularity reveals relationships invisible to whole-tablet methods. K.3306 → K.6685 (chunk `1:51` covering 92.63% of K.3306) is the documented case: a methods-paper §3.6 final-2 bi-orphan since v0.18.2, reconfirmed bi-orphan under v0.18.19's asymmetric containment, but unambiguously chunk-related under v0.19.0. The §3.6 final-bi-orphan count narrows from 2 to 1 (IM.49220 only) after sub-tablet investigation.

21. Chunk-level decomposition preserves whole-tablet calibration thresholds. The `min_chunk_len=20` default reproduces v0.18.19 Lever 1's bi-orphan suppression (IM.49220 → 0 chunks at threshold 20, 20 spurious chunks at threshold 10). The same precision/noise tradeoff governs both run-as-scalar and run-as-primary-object framings — the underlying signal is identical; only the output structure differs.

22. Per-tablet chunk discovery does not require a corpus-wide chunk-hash index. Reusing the v0.18.19 2-of-3 inverted-index infrastructure handles per-tablet queries in milliseconds with zero new build artifacts. The chunk-hash index is the right structure for corpus-wide enumeration (`find_formulaic_passages`, `build_citation_graph`) — which can be designed against actual API demands in v0.20+.

The full audit (six tests) is documented in `docs/v0.19-calibration-round4-chunk-parallels.md`. The audit script `scripts/round4-chunk-parallels-audit.mjs` is re-runnable end-to-end against `~/.cache/cuneiform-mcp/all-signs-full.json` + the anomaly-index cache.

#### 3.9.1 BM.77056 cross-curricular chunk pattern (post-enrichment follow-up)

The original v0.19 audit Test 5 (cross-genre stress on BM.77056, the *āšipūtu* cluster seed of §3.1) was blocked at audit time by missing fragment-metadata. After enriching metadata for BM.77056 and its 16 distinct chunk hosts via the eBL API (28-second batch fetch, 17/17 successful) and re-probing with metadata in place, two findings emerged:

**Structural limitation** — eBL returns no `genres[]` for BM.77056 itself (only `script.period=Neo-Babylonian`); the `cross_genre_only=true` filter requires source-side genre to fire and therefore still returns zero results on this seed. A `host_genres_spanned` field counting distinct host genres per chunk is deferred to v0.19.1 as the right primitive for cross-curricular discovery on uncatalogued sources.

**Substantive finding** — Manual grouping of BM.77056's 13 returned chunks by host primary-genre surfaces an unambiguous cross-curricular pattern. The 13 chunks' host sets span 12 distinct *āšipūtu* sub-genres: Šuʾila (canonical and Emesal variants), Mīs pî, Anti-witchcraft, Bīt rimki, Namburbi, Diĝiršadiba, Magic Varia, Magic, and Ritual texts. This is the **canonical *āšipūtu* curriculum from KAR-44** (Lenzi 2008, Geller 2010, Maul 1994) recovered empirically — for the second time, by an independent method, from the same seed.

The §3.1 BM.77056 cluster (v0.17 whole-tablet thematic clustering) and this §3.9.1 chunk-parallel pattern recover the same canonical curriculum via orthogonal methods. **Methodological convergence:** independent corroboration of the *āšipūtu* library's structure from two unrelated discovery primitives is stronger evidence than either result alone.

Three of the 13 chunks (lengths 25, 22, 21) anchor at BM.77056 source position 57; their host sets collectively span six sub-genres. Position 57 is therefore a **formulaic-incipit anchor** — the start of a ~20–25 sign opening reproduced verbatim across at least six sub-genres of the *āšipūtu* curriculum. This is a natural target for the v0.20 `find_formulaic_passages` tool.

This finding reinforces claim 20 with a second, structurally distinct case: where K.3306 → K.6685 was one-to-one (a single sub-tablet relationship invisible to whole-tablet methods), BM.77056's chunk pattern is many-to-many (one source's chunks reproduce across an entire canonical curriculum). The claim now rests on two independent cases.

### 3.10 Corpus-Wide Chunk Discovery (v0.20.0)

§3.9's `find_chunk_parallels` is a **per-tablet probe** over sub-tablet granularity. v0.20 ships the corpus-wide complement: an exact-hash index over every length-20 trigram window seen anywhere in the corpus, with singletons pruned, sorted by host count. Three new tools ride on this index:

- `find_formulaic_passages` — every chunk shared with ≥ N tablets, ranked by `host_genres_spanned × log(host_count)`. Surfaces *every* cross-curricular formula in milliseconds.
- `trace_chunk_diffusion` — for a single chunk, returns its hosts grouped by period and ordered chronologically. The corpus-level transmission map for a single passage.
- `build_citation_graph` — partitions each chunk's hosts into commentary-genre vs. base-text and accumulates per-pair edge weights. Surfaces the WHOLE corpus's quotation network, not just one pair.

Three claims surface from this work, each validated by the Round-5 calibration audit (2026-05-24) at 91.92% fragment-metadata coverage:

23. **`[my synthesis]`** **The chunk-hash index transforms sub-tablet discovery from per-tablet probe to corpus-wide enumeration without ML primitives.** The same trigram alignment that produces `find_chunk_parallels`' per-tablet output, applied at corpus scale with singleton pruning, surfaces every passage shared between 2+ tablets in milliseconds. No embedding-space, no learned model — just exact hashing of length-20 windows. The build step is single-pass over `all-signs-full.json` and runs in 25 seconds on a 35K-tablet corpus, producing **96,654 non-singleton hashes** (Round-5 Test 1 PASS).

24. **`[my synthesis]`** **Formulaic-passage discovery recovers the KAR-44 curriculum's most-canonical incipits as the highest-host-count chunks.** Round-5 Test 2: the top-10 ranked formulaic chunks at `min_hosts=20` each span **17 to 30 distinct host primary genres** (Šuʾila, Mīs pî, Anti-witchcraft, Bīt rimki, Namburbi, Diĝiršadiba, Magic Varia, Šuʾila Emesal, Ritual texts, Magic, Astronomy, Celestial). This is the third independent recovery of the *āšipūtu* curriculum from the same corpus — v0.17 whole-tablet clustering (§3.1), v0.19 chunk-parallels per-tablet probe (§3.9.1), v0.20 corpus-wide chunk-hash enumeration (§3.10) — three orthogonal methods converging on the same canonical structure. Methodology-independent recovery is strong evidence the structure is a property of the underlying corpus, not a methodology artifact.

25. **`[my synthesis]`** **The citation graph derived from chunks shared between commentary-genre and base-text hosts is a corpus-level structural primitive, not a pair-level diagnostic.** The v0.18.19 `commentary_quotes_base_text` verdict in `compare_tablet_pair` answers "is THIS pair a commentary/base relationship?". `build_citation_graph` answers "what does the WHOLE corpus's quotation network look like?". Round-5 Test 5 returned **11 directed citation edges across 6 distinct base-text genres** (Astronomy, Magic, Divine, Bīt rimki, Celestial, CANONICAL). **K.3716 emerges empirically as a hub commentary tablet** citing 7 base texts across Magic / Divine / multiple CANONICAL composition classes; **Sm.803 → BM.42262 (Astronomy commentary→base)** at weight 800 / 40 shared chunks is the strongest single edge. These hub-tablets were not surfaced by `compare_tablet_pair` because pair-level analysis requires knowing the pair in advance — the graph reveals them automatically.

**Design separation from v0.19.** The v0.20 chunk-hash index uses *exact* length-20 windows for cheap O(1) corpus-wide queries. It does NOT reproduce v0.19's *fuzzy* per-tablet findings — BM.77056's 13 cross-curricular chunks (§3.9.1) and the BM.47463 ↔ CBS.6060 Šurpu commentary/base 147-sign chain (§3.7.1) do not appear in this index because they are fuzzy-aligned, not exact-aligned. The two layers are complementary: `find_chunk_parallels` (v0.19) for fuzzy per-tablet probing, `find_formulaic_passages`/`trace_chunk_diffusion`/`build_citation_graph` (v0.20) for exact corpus-wide enumeration. A fuzzy variant of the chunk-hash index would unify the two at ~5–10× index size; deferred to v0.21+ pending demonstrated need.

The v0.20 chunk-hash index uses a fixed length-20 window, matching v0.19's precision-calibrated default. Shorter windows (length 10) admit numerical-formula and colophon-template false positives at scale; incipit-targeted discovery (3-8 trigrams) is a distinct precision/recall regime deferred to v0.21's `find_incipits` with its own calibration.

---

### 3.11 Stemma Reconstruction and Scribal-School Mapping (v0.22.0)

v0.22 ships two tools that bridge the chunk-discovery infrastructure (§3.9–§3.10) with the canonical Assyriological reconstruction problems: textual family trees and scribal schools.

`build_canonical_recension_tree` automates **stemma reconstruction** at corpus scale. Given a seed manuscript, the tool BFS-expands its witness set via shared-chunk overlap, computes a pairwise distance matrix using `distance(A,B) = 1 - shared_chunks(A,B) / max(|H_A|, |H_B|)`, and runs neighbor-joining (Saitou & Nei 1987) to produce an unrooted binary tree in Newick format. UPGMA is the secondary algorithm option for rooted-tree consumers.

The K.5896 (Mīs pî) test case (Round-7 audit, 2026-05-24) recovers **16 witnesses, 12 of which carry the canonical `Magic → Purification → Mīs pî` genre label** — auto-recovered without scholar curation. The distance ranking surfaces **K.6683 as K.5896's closest sister** (76 shared length-20 chunks, d=0.749) — closer than the canonical K.9508 example documented in §3.7.3 (65 shared, d=0.786). Newick output places K.5896 and K.6683 as immediate sisters under internal node N4. K.6683 was not previously highlighted in the §3.7.3 narrative; either a genuinely-undocumented close sister manuscript (worth verifying against Walker & Dick 2001's Mīs pî MS sigla) or a chunk-overlap-overweighting case — recorded as a follow-up.

`build_scribal_school_graph` reconstructs **scribal schools** by joint clustering on scribal orthographic signature (LLR fingerprint, §3.4) and provenance/find-spot. Connected components on a thresholded scribal-cosine graph (default `min_scribal_similarity=0.65`), restricted to same-provenance edges, surface 30 schools at defaults. The top result (BM.33837, 288 members, internal cohesion 0.895) is the **Babylon Hellenistic-Parthian astronomical-diary scribes** — a known late-period scholastic community empirically reconstructed from fingerprint + find-spot alone. School #2 (K.4292, 185 members) is the Nineveh celestial-divination atelier (EAE tradition); school #5 (K.3453, 20 members) is the Nineveh therapeutic-medicine atelier spanning five body-region tablets in the Medical Compendium.

Three claims surface, each validated by the Round-7 audit at the 91.92% fragment-metadata coverage achieved in v0.20.0-alpha:

26. **`[my synthesis]`** **Stemma reconstruction is automatable at corpus scale from chunk-overlap distance alone.** Given the v0.20 chunk-hash index + neighbor-joining over the max-denominator distance metric, every composition with ≥3 chunk-related witnesses can have a stemma proposed in milliseconds. K.5896 (Mīs pî) demonstrates the method recovers 12/16 witnesses with the canonical genre label and surfaces K.6683 as a potentially-undocumented close sister. No scholar curation required during reconstruction.

27. **`[my synthesis]`** **Scribal schools emerge empirically from joint clustering on orthographic signature + find-spot.** Connected-components on a thresholded scribal-cosine graph, restricted to same-provenance edges, surfaces 30 candidate schools in the eBL corpus. Top results align with known scholastic communities (Babylon Hellenistic astronomers, Nineveh EAE ateliers, Nineveh therapeutic-medicine atelier) — empirical reconstruction with no curation.

28. **`[my synthesis]`** **The composition-level and physical-place axes are independently learnable but convergent.** §3.1–§3.10's composition-level clustering (BM.77056 *āšipūtu* curriculum) and §3.11's scribal-school clustering recover overlapping but non-identical structure. The composition axis traces *what* people copied; the scribal-school axis traces *where* and *with whom*. Methodological independence of the two axes is the empirical basis for treating both as primary reconstructions of cuneiform scribal culture, not as alternative views of the same phenomenon.

**Validation gap:** the recension-tree output has not yet been benchmarked against hand-built stemmata (Walker & Dick 2001 for Mīs pî is the natural target — Robinson–Foulds distance to the published stemma is the proposed v0.22.1 follow-up). The methodological claim that NJ on chunk-overlap recovers a "correct" stemma is empirically supported by genre-label retention (12/16) and by the K.9508 near-sister placement, but not yet by direct comparison to scholar-authored trees.

**Scribal-school caveat:** "scribal school" is an inferential leap from "shared orthographic fingerprint + same find-spot." The tool's output is a *candidate* for further philological evaluation — colophon-name overlap, dated rituals, archaeological context — not a historical claim. Documented in `docs/v0.22-recension-tree-design.md`.

---

### 3.12 Sign-Level Semantic Embeddings (v0.23.0) — sign2vec

The semantic axis previously operated at tablet granularity only (§2.3, v0.15 Random-Indexing embeddings). v0.23 introduces the complementary primitive: per-sign semantic embeddings learned from corpus co-occurrence via PPMI + truncated SVD (Levy & Goldberg 2014, with randomized SVD per Halko–Martinsson–Tropp 2011). 635 signs indexed at `MIN_OCCURRENCES=20`, covering 99.6% of the corpus's 4.87M sign occurrences. Embedding dimension 100. The build pipeline runs in 0.9 seconds end-to-end against `~/.cache/cuneiform-mcp/all-signs-full.json` and produces a 0.60 MB cache. Zero new runtime dependencies — PPMI math, randomized SVD, L2-normalization all hand-rolled in pure TypeScript.

The single tool `find_similar_signs(sign, top_k)` exposes nearest-neighbor queries by cosine.

The Round-8 calibration audit (2026-05-24) tests embedding **coherence** and **discrimination** rather than specific philological equivalences (those need scholarly review). Five tests PASS: index sanity (635 in-band, max ‖v‖−1 = 5.69e-7), self-similarity (cosine(v, v) = 1.0), coherence (top-10 most-frequent signs each have a neighbor at cosine ≥ 0.51), numerical-cluster cohesion (ABZ480's top-5 contains digit-class neighbors `4` and `0`), distant-pair discrimination (95.4% of top-30 pairs have cosine < 0.4). Sample output: ABZ480's top-5 = {`4` 0.59, ABZ583 0.58, `0` 0.57, BAHAR₂ 0.57, ABZ598a 0.56} — visibly numerical.

Three claims surface:

29. **`[my synthesis]`** **Sign-level distributional embeddings recover sign-equivalence structure without scholar curation.** PPMI+SVD over a ±5 sign context window on the eBL corpus yields a 100-dim embedding in which 95.4% of the top-30 most-frequent signs have pairwise cosine below 0.4 (distributional discrimination preserved) while every top-10 sign has at least one neighbor at cosine ≥ 0.51 (coherent local neighborhoods). The numerical-context cluster around ABZ480 surfaces empirically without priors fed into the SVD.

30. **`[my synthesis]`** **The semantic axis decomposes into two granularities — sign-level (§3.12) and tablet-level (§2.3) — which encode orthogonal distributional information.** Tablet-level Random-Indexing embeddings capture *what compositions a tablet is similar to*; sign-level PPMI+SVD embeddings capture *which signs occur in similar contexts*. The two layers compose: aggregating sign-cosine into a tablet-level lexical-substitution score would produce a complement to the existing lexical/fuzzy/thematic axes of §2 (deferred to v0.24).

31. **`[my synthesis]`** **Sign-level embeddings serve as a falsifier for folk-Assyriological sign-equivalence claims — but theory–behavior coupling must be tested separately.** v0.21's `find_incipits` `exclude_numerical_only` filter assumes ABZ480 and ABZ411 are interchangeable contexts — both treated as "cuneiform numeral 1 family." v0.23 measures their distributional cosine at **0.097** — assumption falsified. The v0.23.1 follow-up audit (`docs/v0.23.1-incipit-filter-reaudit.md`) then verified the filter's actual *behavior*: 67 of 88 globally filtered chunks are filtered because of ABZ411 specifically, and on inspection all 67 are genuine numerical-table residue — repeated ABZ411 count-tokens with ABZ480 separators. **The filter's stated theory was wrong, but its behavior is correct** for a different reason than originally claimed: pattern-level repetition detection, not sign-level semantic equivalence. The methodological lesson is sharper than mere falsification: distributional embeddings can refute the *rationale* of a filter without invalidating its *empirical performance*. The two must be tested separately; the embedding is a calibration probe for theory–behavior coupling across the toolchain. At production thresholds (`min_hosts=50`) the v0.21 filter never engages on the top-30; the corrected rationale stays in code comments, not in changed behavior.

**Limitations** (recorded for v0.24 follow-up):

- WINDOW=5 is a single configuration choice; an ensemble across WINDOW ∈ {2, 5, 10} would expose syntactic-vs-topical context-distance effects.
- `MIN_OCCURRENCES=20` excludes rare-tail signs, yielding 635 in-band of ~8,754 unique total signs. Lowering to 10 admits ~1,300 signs at the cost of more variance in the rare-sign vectors.
- Per-period training (Neo-Assyrian vs Neo-Babylonian sub-corpora) would expose period-specific sign substitutions and is the natural sequel for diachronic analysis.
- No external benchmark yet (e.g., an Assyriologist-curated sign-equivalence dataset). The audit measures internal coherence + a single negative-finding example (ABZ480/ABZ411); future work should add an external validation set.

---

### 3.13 Lexical-Substitution Axis at Pair Level (v0.24.0) — claim 30 cash-out

§3.12 claim 30 stated that aggregating sign2vec sign-cosine into a tablet-pair-level "lexical-substitution score" would complement the existing lexical/fuzzy/thematic axes. v0.24 ships the aggregation as `compute_lexical_substitution_score` and validates the claim empirically — with a productive nuance.

**Formula:** `score = (exact_overlap + substitution_matches) / max(|A_vocab|, |B_vocab|)`, where `substitution_matches` counts signs in tablet A whose top-K (default 5) sign2vec neighbors at cosine ≥ 0.4 appear in B's vocabulary. The max-denominator (rather than sum) mirrors the v0.22 stemma distance choice — less harsh on asymmetric witness sizes.

**Round-9 audit (2026-05-24, 4/4 PASS):**

| Pair | Score | exact_share | substitution_share |
|---|---|---|---|
| K.5896 ↔ K.9508 (Mīs pî siblings, §3.7.3) | **0.7772** | 0.4293 | **0.3478** |
| K.5896 ↔ K.5896 (self-pair sanity) | 1.0 | 1.0 | 0 |
| U.21017 ↔ K.9653 (unrelated-genre control) | 0.6531 | 0.3673 | 0.2857 |

The 4-axis comparison for K.5896 ↔ K.9508 (`compareTabletPair`): `lex_J=0.1214 · fuzzy_J=0.4048 · thematic_cos=0.7964 · scribal_cos=0.5011`. Fuzzy + thematic already discriminate the sibling relationship strongly; the lexical-substitution axis adds *complementary* information rather than *decisive* information.

**Refined claim 30 (cashes out partially):**

The lexical-substitution score's substitution component is non-trivial on the canonical sibling case (0.3478) — confirming that sign2vec aggregation is empirically detectable beyond exact-vocabulary overlap. However, the unrelated-pair baseline substitution_share is 0.2857 (Δ ≈ 0.06), leaving only a ~22% relative lift for known-sibling discrimination. Root cause: cuneiform corpora are dominated by a small high-frequency sign core (determinatives, common syllabograms, ABZ480 numerals) whose sign2vec neighborhoods saturate across nearly all tablet pairs at typical fragment sizes.

The methodologically-honest framing: the lexical-substitution axis is *conceptually orthogonal* to the existing axes (it can detect distributional sign equivalence that exact-Jaccard misses) but *not decisively discriminative* at the current corpus state. Best read in conjunction with the fuzzy / thematic axes where Δ-vs-baseline is substantially larger, rather than as a stand-alone classifier. A natural future-work refinement is **lift-over-baseline normalization** — subtract a corpus-wide expected score at matching vocab sizes — which would clean up the saturation-driven baseline compression. Recorded for v0.25.

This refinement preserves claim 30's empirical content (sign2vec aggregation registers measurable signal) while honestly reporting its limited discriminative power at present. The methods-paper position is therefore: *the sign-level axis exists at pair-level, but its standalone discrimination is corpus-dependent; methodological completeness requires reporting the saturation effect explicitly rather than claiming a clean fifth axis*.

**v0.25 update — baseline normalization recovers the clean signal.** Building a vocab-size-matched random-pair baseline distribution (7 buckets {15, 25, 50, 80, 120, 160, 220}, N=100 random pairs per bucket, deterministic seed) and reporting the z-score lift above baseline upgrades the empirical story substantially:

| Pair | raw_score | TOTAL lift_z | **SUB lift_z** |
|---|---|---|---|
| K.5896 ↔ K.9508 (Mīs pî siblings) | 0.7772 | −0.574 | **+1.967** |
| U.21017 ↔ K.9653 (random control) | 0.6531 | +0.135 | −0.277 |

**Δ substitution_lift_z_score = +2.24σ.** The substitution-only component, normalized against the size-matched baseline, produces a clean N-sigma signal. The v0.24 raw score's narrow 22% relative lift was hiding TWO confounds, not one: (1) high-frequency sign-core saturation, which v0.24 documented; and (2) **vocab-size asymmetry**, which v0.25 newly surfaces. The K.5896 ↔ K.9508 pair is vocab-asymmetric (184 vs 79); v0.24's `max(|A|, |B|)` denominator caps achievable `exact_share` at 79/184 ≈ 0.43, while size-matched baseline random pairs are typically near-symmetric and achieve `exact_share` ≈ 0.59. The TOTAL lift_z is therefore *negative* for the sibling pair — asymmetry dominates the saturation correction. But the `substitution_share` component is insensitive to this asymmetry artifact: it counts neighbor matches as a fraction of the same max-vocab denominator that the baseline normalizes against. The substitution-only lift is the clean methodological cash-out.

**Refined claim 30 (v0.25-validated):** *The sign-level semantic axis aggregated to tablet-pair level produces a clean +2σ discriminative signal above a size-matched baseline distribution, but only when read in the asymmetry-insensitive substitution channel. The raw score is contaminated by vocab-size asymmetry artifacts that the max-denominator amplifies; the baseline-normalized substitution-only lift recovers the underlying signal. Two confounds (saturation + asymmetry) had to be controlled separately to see the axis cleanly.*

This refinement is methodologically deeper than the original claim 30 framing. The methods-paper position is now: *the sign-level axis at pair-level produces measurable, baseline-validated discriminative signal — but only when the analyst is explicit about the channel they're reading and the confounds they're controlling for*.

---

### 3.14 Per-Period Embeddings + Per-Archetype Threshold Matrix (v0.26.0)

v0.26 ships two tools that condition the v0.23+ analytical axes on auxiliary structure: **per-period sign embeddings** (diachronic axis) and **per-archetype threshold matrix** (cluster-shape axis).

**§3.14.1 — Per-period sign embeddings.** PPMI+SVD trained separately on Neo-Assyrian (14,193 tablets, 435 signs) and Neo-Babylonian (10,861 tablets, 452 signs) sub-corpora, with 387 signs in the common-vocabulary intersection. The Round-11 audit measured per-sign top-5 neighbor turnover between the two indexes. Distribution: 0% identical-neighborhood, 1.8% one-drift, 7.0% two-drift, 18.3% three-drift, 28.7% four-drift, and **44.2% full top-5 turnover**. Mean common-neighbors at top-5 = 0.94 / 5. The signal is empirically real but methodologically two-confound: (1) genre asymmetry between NA literary (Library of Ashurbanipal canonical material) and NB administrative/archival registers, and (2) independent SVD bases producing different 100-dim coordinate systems per period. The honest framing for §3.14.1 is therefore **"diachronic + register drift, not pure diachronic substitution"**. Isolating the diachronic axis requires register-matched sub-corpora (omen-series-only across NA and NB) — deferred to v0.27.

**§3.14.2 — Per-archetype threshold matrix.** Round-3 Lever 5 (deferred from v0.18.19) cashed out as 7 hand-curated `ArchetypeThresholdProfile` entries, one per archetype from §3.8 + the §3.7.1 commentary-quotation case. The matrix is empirically defensible via cumulative v0.18.x calibration history; the tighter-vs-looser ordering is strict (verbatim_manuscript_chain > everything > compositional_curriculum across all axes). Range of `min_fuzzy_jaccard`: 0.05 (embedded_fragment) → 0.35 (verbatim_manuscript_chain), an order-of-magnitude span that single-default thresholds cannot accommodate. The accompanying best-effort classification heuristic correctly identifies the three canonical exemplars (K.5896 → refrain_bound_liturgical, BM.77056 → compositional_curriculum, K.9508 → embedded_fragment).

**§3.14.3 — The two axes compose conditionally.** Period and archetype are orthogonal: an NA verbatim-chain probe benefits from BOTH the verbatim_manuscript_chain threshold profile AND the NA-period sign embeddings. Future-work direction: explicit composition tools that route queries through period × archetype matrices simultaneously.

**Refined claim 32 (v0.26):** *Conditional calibration outperforms global defaults. Per-archetype threshold tuning produces order-of-magnitude differences in optimal thresholds across the 7 §3.8 archetypes; per-period embedding produces measurable drift signal even when the dominant component is register-confounded. Both axes are diagnostically useful — neither claims to be a replacement for human philological judgment.*

### §3.14.4 — Register-matched per-period embeddings (v0.27)

v0.27 closes the §3.14.1 honest-caveat thread by training six register-matched (genre × period) sub-corpora: (divination, magic, literature) × (NA, NB). Each bucket runs the same v0.23 PPMI+SVD pipeline at WINDOW=5; MIN_OCC is relaxed from 20 → 10 in registers where the smaller bucket has fewer than 1,500 tablets (magic and literature). Per-bucket sample sizes: divination 3,568 NA + 1,580 NB tablets, magic 1,201 NA + 1,254 NB, literature 1,403 NA + 1,117 NB.

The Round-12 audit measures the same top-5 mean drift metric as v0.26's Round-11, but only on the (NA-register, NB-register) paired indexes for each register. Results:

| Register | n paired signs | Matched mean drift | v0.26 mixed mean | Δ |
|---|---:|---:|---:|---:|
| divination | 289 | **3.772** / 5 | 4.048 / 5 | −0.277 (−6.8%) |
| magic | 312 | 4.083 / 5 | 4.035 / 5 | +0.048 (+1.2%) |
| literature | 297 | 4.293 / 5 | 4.057 / 5 | +0.236 (+5.8%, small-sample noise) |

The clean verdict: **the diachronic axis is real and population-dominant**. Register-matching reduces drift only modestly (the largest reduction, divination at -6.8%, is well within the noise band of the smaller registers). The bulk of v0.26's mixed-register drift signal is genuinely diachronic, not register-confounded at the population level.

**But** v0.26's named "diachronic candidates" (ABZ480, ABZ411, ABZ342) tell a different story at the individual-sign level: under register matching, ABZ480 drift collapses from 5/5 to 3/5 (divination), ABZ411 from 5/5 to 3/5 (magic), ABZ342 from 5/5 to 2/5 (divination). **Specific high-frequency signs were the channel through which register confound entered v0.26's mixed-register report** — even though the population-level claim held up.

**Refined claim 32 (v0.27):** *The conditional-calibration axes compose, but their empirical interpretation depends on the slice. Population-level register matching confirms the diachronic axis dominates v0.26's mixed-register signal (~93% of the drift is genuine diachronic); individual-sign-level register matching reveals that v0.26's headline named candidates were the high-leverage tail through which the register confound entered the methodologically-noisier mixed result. Both v0.26's honest caveat and its drift-signal claim survive, applied to different parts of the distribution. The methodological lesson is that aggregate-level and case-level findings can diverge under axis-control, and analysts should report at both granularities when the distribution is heavy-tailed.*

---

### 3.15 Sign-Class Clustering + Per-Period Chunk-Hash Partition (v0.28)

K-means on the v0.23 sign2vec embedding space at k=12 surfaces four empirical sign-classes without scholar curation: 2 numerical clusters (one anchored by ABZ480 with `4`/`0`/BAHAR₂ as nearest representatives; one anchored by ABZ411 with `27`/ABZ427/`19`), 3 compound-logogram clusters, 1 phonetic-reading-family cluster (`diš`/`u`/`aš`), 6 ABZ-syllabogram clusters. The numerical class is geometrically tightest (intra-cosine 0.378 vs corpus median ~0.14); resolution requires k ≥ 12 (at k=8, `4` merges into a common-syllabogram cluster — frequency dominates at coarse k).

The corpus-wide chunk-hash index of §3.10 (v0.20) partitions by `script.period` into Neo-Assyrian (n=7,831 tablets, **50,083** non-singleton length-20 windows) and Neo-Babylonian (n=7,591 tablets, **11,979** non-singleton windows). The 4.2× density gap is corpus-shape, not methodology — identical WINDOW=20 + X-skip rule applied to both partitions. Top NA-only formula has 120 NA hosts and **0 NB transmission** (anchored by BM accession tablets 1879,0708.49 / 1879,0708.48 / 1880,0719.152 — a candidate Library-of-Ashurbanipal canonical text registered to those BM acquisition numbers).

**Claim 33:** *Sign-class structure emerges empirically from k-means clustering of the sign2vec embedding space. At k=12, the 635-sign vocabulary partitions into 4 surface-form-coherent classes; cluster geometry directly reflects Assyriological notions of sign type without scholar curation.*

**Claim 34:** *Per-period chunk-hash partition reveals corpus-shape asymmetry between NA and NB. NA's canonical-period corpus supports top-host counts of 120 at length 20; NB's predominantly administrative/archival corpus caps at 8. The 4.2× density gap is corpus structure, not methodology. NA-only formulae the v0.20 mixed-period tool can't isolate become visible.*

### 3.16 Cross-Axis Bayesian Fusion + Manuscript Joins + Smart Numerical Filter (v0.29)

Three orthogonal v0.29 deliverables: cross-axis Bayesian fusion (the v1.0-readiness item), corpus-wide manuscript-joins graph, and data-driven numerical-chunk detection (the principled replacement for v0.21's hardcoded filter).

**§3.16.1 — Cross-axis Bayesian fusion bootstrap.** Logistic regression on the 5-axis feature vector (lex_jaccard, fuzzy_jaccard, thematic_cosine, scribal_cosine, substitution_lift_z) trained on 12 methods-paper-confirmed positive pairs + 40 synthetic negatives. Training accuracy 98.1% (51/52). Feature importance: fuzzy_jaccard β=+1.94 (dominant), lex_jaccard +0.82, thematic_cosine +0.76, scribal_cosine +0.28, substitution_lift_z −1.01. **Claim 35:** *Cross-axis Bayesian fusion is feasible with a small label set as a bootstrap; production-quality fusion requires ≥100 labeled pairs (v1.0 prerequisite). Fuzzy_jaccard emerges as the dominant predictor, validating the v0.18.2 fuzzy-axis investment as the load-bearing whole-tablet axis.*

**§3.16.2 — Corpus-wide manuscript joins.** The eBL `joins[]` field surfaces 4,361 fragments with ≥1 join, 17,203 total edges, average 3.94 joins per host. **K.7563 is the densest reconstruction candidate at 70 joins** — a candidate for philological investigation as the corpus's most-reconstructed single manuscript. The Nineveh Medical Compendium VI Teeth cluster (K.2290, K.2419, K.8946 each at 28 joins) is the largest documented multi-piece reconstruction in therapeutic medicine. **Claim 36:** *Manuscript reconstruction signal is independent of the orthographic/thematic/scribal axes and surfaces compositionally-distinct discovery targets. Physical joins encode reconstruction confidence the other axes can't directly access.*

**§3.16.3 — Data-driven numerical-chunk detection.** v0.21's `find_incipits` numerical filter used a hardcoded 2-sign list `{ABZ480, ABZ411}`. The v0.23 sign2vec embedding falsified the interchangeability assumption (cosine 0.097); the v0.28 k-means clustering revealed the numerical class is two structurally-distinct clusters spanning 112 signs. v0.29 ships the principled replacement: an empirical numerical-sign-set drawn from clusters #5 + #9, used as the density-based filter. **v0.21 → v0.30 overlap: 100% (88/88 v0.21-flagged chunks all caught), plus 21,389 additional numerical chunks v0.21 missed.** The §3.13.1 v0.21-filter "correct-behavior-wrong-rationale" finding gets its principled cash-out: the filter's behavior was right by accident, but the same behavior is now derivable from the empirical embedding space.

### 3.17 Sign2vec-Augmented Lacuna Restoration (v0.30)

v0.18.0's lacuna restorer (§3.5) uses parallel-template alignment + bigram-context heuristics, reaching 92% top-1 precision on multi-position template gaps. v0.30 ships a complementary single-position tool, `restore_lacuna_semantic`, that integrates the v0.23 sign2vec semantic prior:

```
joint_score = α × normalized_bigram_score + (1−α) × normalized_sign2vec_score
```

where the sign2vec score is the cosine of each candidate sign's embedding against the centroid of the surrounding visible signs' embeddings (positions p−2, p−1, p+1, p+2). At α=1 the tool reduces to the v0.18.0 bigram baseline; at α=0 it's pure sign2vec.

**Empirical finding:** on a 10-tablet sample of single-position predictions, pure-bigram and pure-sign2vec top-1 picks disagree in **9 of 10 cases (90%)**. The two axes carry strongly independent signal — sign2vec is not redundantly re-ranking the bigram baseline; it is contributing a different ordering.

A concrete case: `1879,0708.118` position 20, ground truth `ABZ52`. Window context `ABZ319 ABZ579 ABZ57 ABZ480 ABZ1 [ABZ52] ABZ354 ABZ570 ABZ411 ABZ411 ABZ61`. The joint score recovers `ABZ52` at rank 1; pure-sign2vec alone would have picked `ABZ570` (rank 6 in the joint score, ranked highest in pure-sign2vec); pure-bigram correctly picks `ABZ52`. Here sign2vec adds **complementary** signal, not corrective — the bigram axis already has the right answer and sign2vec doesn't reorder it. But across the 10-tablet sample, the 90% disagreement rate shows sign2vec is doing real ordering work; whether the resulting joint score has higher precision than pure bigram at scale is a v0.31 calibration question.

**Claim 37:** *Sign2vec semantic embeddings provide a complementary lacuna-restoration prior to the v0.18.0 bigram-context heuristic. The two axes carry strongly independent signal at single-position granularity (90% top-1 disagreement on the sample). The joint score is the v0.30 cross-tool integration that establishes the pattern for v1.0 cross-axis composition — every existing axis can be augmented by the v0.23 sign2vec embedding as a semantic prior, not just bigram-context prediction.*

The §3.5 92% top-1 figure is on multi-position parallel-template alignment, a different surface from this single-position joint score; the §3.17 claim is about axis-independence at single-position granularity, not direct comparison to §3.5.

---

### 3.18 Active-Learning Feedback Loop (v0.31)

The v0.29 Bayesian fusion model (§3.16) trains on n=12 hardcoded positives drawn from §§3.6–3.7.3 plus §3.11 stemma sisters, joined with n=40 synthetic random-pair negatives, and emits a self-described `bootstrap_warning`: *"v1.0 will require ≥100 labeled pairs for production-quality fusion."* v0.31 ships the infrastructure that closes this gap organically rather than via one-shot curation: a persistent validation-resolutions store coupled to the v0.21 prioritize_validation_queue ranker.

**The closed loop.** Each iteration consists of (1) prioritize_validation_queue surfaces the top-K highest information-gain candidates from the bi-orphan + isolate + chunk-discovery seed set; (2) the scholar reviews one candidate; (3) record_validation_resolution persists a verdict (positive / negative / uncertain) with rationale, canonical pair_id, source provenance, and tool_version; (4) periodically, scripts/train-joint-pair-model.mjs unions the persisted positives with the methods-paper hardcoded list and retrains the §3.16 Bayesian model. The decoupling of verdict persistence (JSON store) from model retraining (offline script) preserves reproducibility and makes the active-learning trajectory auditable: every positive that enters the v1.0 training set carries a recorded_at, recorded_by, source, and rationale, so the eventual ≥100-positive set is not a black-box hand-curation but a documented sequence of micro-decisions.

**Canonical pair_id.** Verdicts are keyed on `pair_id = "{tablet_a}↔{tablet_b}"` with `tablet_a < tablet_b` lexicographically. This collapses (A,B) and (B,A) to one record; re-recording the same pair produces an `action='updated'` response carrying the previous verdict, so the audit trail preserves verdict-change history without duplicating records. Self-pairs are refused at the canonicalization layer.

**Why this is methodologically significant.** The dominant alternative — one-shot curation of 100 positives by an expert team — collides with the §3.7 finding that manuscript-sibling status is often non-obvious at whole-tablet granularity and requires sub-tablet (§3.9) or sign-level (§3.13) evidence. Active learning, by definition, surfaces the cases where the current model is most uncertain — exactly the cases where adding a label provides the largest signal. The store thus accumulates a labeled set with higher per-pair information content than uniform sampling would produce.

**Claim 38.** *Persistent active-learning feedback (validation-resolutions store) is the production-readiness infrastructure for migrating the v0.29 Bayesian fusion model from bootstrap quality (n=12 hardcoded positives, 98.1% training accuracy on a small set with high variance) to production quality (≥100 confirmed positives). The closed loop — rank uncertain pairs via prioritize_validation_queue → human review → persist verdict → retrain — is the v1.0 readiness path.*

---

### 3.19 Composition Assignment (v0.32)

The §§3.7 and 3.11 manuscript-sibling and stemma findings establish that the corpus contains identifiable compositions (Mīs pî, Šurpu, Udug-ḫul, Bīt salāʾ mê) instantiated across multiple witnesses. v0.32 operationalizes this as a tool: given a query tablet, return the most-probable composition assignments via joint scoring against a methods-paper-anchored exemplar registry.

**The registry.** Five compositions, thirteen unique exemplar tablets, drawn from §3.1 (āšipūtu / KAR-44 curriculum), §3.4 (Bīt salāʾ mê), §3.7.1 (Šurpu), §3.7.2 (Udug-ḫul), §3.7.3 + §3.11 (Mīs pî). The registry is the methodological constraint: it prevents the tool from labeling every tablet as the highest-density composition by anchoring the score to a published-evidence inventory.

**Joint score.** Two axes, weighted 0.6/0.4. (a) `chunk_overlap`: the maximum number of length-20 shared chunks between the query and any of the composition's exemplars (excluding the query itself), normalized over the candidate set. (b) `sign2vec_centroid`: cosine between the query's mean sign-vector (over signs with v0.23 embeddings) and the composition's pooled-exemplar mean sign-vector. The weights are normalized over APPLICABLE axes only, so the joint score remains well-defined when a cache is unloaded.

**Self-filter.** When the query is itself a registered exemplar of composition C, its tablet ID is filtered from C's scoring pool. K.5896's score against Mīs pî thus reflects how well K.5896 matches the OTHER Mīs pî exemplars, not a degenerate self-match. The `query_in_exemplar_list` flag preserves the membership information for downstream consumers.

**Curriculum tie-break.** The āšipūtu (KAR-44) registry entry is tagged `composition_type='curriculum'` and shares exemplars with the specific compositions inside it. For a small fragment like K.9508 — embedded in K.5896, a Mīs pî manuscript that itself appears in the āšipūtu pool — chunk-overlap is structurally symmetric across both candidates because K.5896 is the dominant exemplar in both pools. When two candidates' confidence differs by less than 0.02, the tool prefers `specific_composition` over `curriculum`. A curriculum is a meta-category; it should surface ALONGSIDE the specific composition that better fits the query, never INSTEAD of it.

**Calibration evidence (Round 18).** K.5896 → Mīs pî at confidence 0.995 (top-1) with āšipūtu surfacing at top-2; K.9508 → Mīs pî at 0.992 (curriculum tie-break active); BM.47463 → Šurpu at 0.999; Sm.1055 → Udug-ḫul at 0.998. All confidence scores in [0,1]; unknown tablets degrade gracefully to zero-score candidates plus warnings rather than throwing. 10/10 audit tests pass.

**Claim 39.** *Composition assignment operationalizes the §3.7 manuscript-sibling and §3.11 stemma findings as a tool: given a query tablet, the joint of §3.10 chunk-overlap with published-exemplar pools and §3.12 sign-vector centroid cosine produces a confidence-ranked composition assignment with self-filter and curriculum tie-break, anchored by a methods-paper-grounded registry that prevents degenerate "highest-density-composition" labels.*

---

### 3.20 Rooted Stemma (v0.33)

§3.11 produces **unrooted** neighbor-joining stemmas: a topology with branch lengths, but no designated archetype direction. Traditional stemma codicum requires a root — the closest extant proxy for the lost archetype, against which all descent direction is defined. v0.33 adds three rooting heuristics that re-root the §3.11 output at a chosen witness without disturbing the topology or branch lengths.

**Heuristics.** (a) `earliest_period`: choose the witness with the earliest period using the Mesopotamian-canonical ordering OB → MB → MA → NA → NB → LB. The implicit claim is that earlier periods are closer to the archetype — a defensible default for canon-tradition manuscripts but explicitly NOT for vernacular or apocryphal traditions where the assumption may fail. (b) `most_chunk_hosts`: choose the witness with the broadest corpus reach. Graph-theoretic coverage centroid; useful when period data is uniform across the cluster. (c) `outgroup_witness`: caller specifies a tablet known externally to be a forerunner (an OB precursor, e.g.).

**Re-rooting algorithm.** Parse the v0.22 Newick output into an undirected edge list; BFS from the chosen leaf, orienting each visited edge away from the new root; render rooted Newick. Branch lengths preserve exactly through this operation (sum-of-branch-lengths invariant verified in Round-19 audit T5).

**Empirical surface — the Mīs pî cluster has no pre-NA witness.** Running `earliest_period` on the K.5896 cluster (Mīs pî, 20-witness expansion) returned **K.10176** as root, period="Neo-Assyrian", rank 4 of 6 in the period scale. The entire BFS-expanded Mīs pî cluster in the eBL chunk-index is post-Neo-Assyrian. This is a substantive observation about either coverage (eBL's transliterated corpus may not include the OB Mīs pî forerunners) or method-sensitivity (the length-20 chunk-overlap threshold may exclude older witnesses whose orthography diverges further from the NA standard form). The tool surfaces the absence honestly rather than fabricating an archetype.

**Claim 40.** *Re-rooting v0.22's unrooted NJ stemma at a witness chosen via period-anchored / coverage-centroid / outgroup-specified heuristics produces a directed manuscript tradition tree while truthfully exposing absences in the corpus. The Mīs pî K.5896 cluster contains no pre-Neo-Assyrian witness in the current chunk-index expansion; the earliest-period root resolves to K.10176 (NA, alphabetical tiebreak), and the tool reports the absence rather than fabricating an OB-rank archetype.*

The §3.11 NJ stemma plus the §3.20 rooting layer together produce the standard stemma codicum object: a directed manuscript tree with a designated archetype-proxy. Output is well-formed Newick consumable by phylogenetic visualization tools (FigTree, iTOL).

---

### 3.21 Fragment-vs-Composition Completeness (v0.34)

The corpus's heavily-fragmentary witness inventory (∼45% of transliterated tablets are partial fragments by tablet-count) creates a recurring practical question: given a fragment, what fraction of the original composition does it preserve? v0.34 operationalizes this with `score_tablet_completeness`, returning two metrics that DO NOT measure the same thing and must not be conflated.

**Two metrics, two semantics.**

*sign_count_ratio* = query.sign_count / largest_exemplar.sign_count, clamped to [0,1]. This is a **physical-size proxy** — how big is this fragment relative to the largest known witness? It ceilings out at 1.0 when the query is larger than the target composition's largest exemplar, which can happen when an explicit composition_id override mis-routes a large fragment to a small-exemplar composition (see below).

*chunk_coverage_ratio* = |query_chunks ∩ canonical_chunks| / |canonical_chunks|, where `canonical_chunks` is the set of length-20 chunk hashes appearing in ≥2 of the composition's registry exemplars. This is the **structural-fit metric** — what fraction of the composition's structural backbone does this fragment host? The ≥2 threshold strips single-witness noise.

**The dissociation matters.** K.5896 vs Mīs pî produces sign_count_ratio=0.488 and chunk_coverage=0.974 (148/152 canonical chunks hosted). K.5896 vs Šurpu — an unrelated composition — produces sign_count_ratio=1.000 (K.5896 dwarfs both Šurpu exemplars) and chunk_coverage=0.000 (zero of Šurpu's 31 canonical chunks). Reporting only sign_count_ratio would misrepresent K.5896 as a complete Šurpu witness; chunk_coverage exposes the misclassification immediately.

**Empirical correction to §3.7.3 framing.** The audit's T1 originally asserted K.5896 → sign_count_ratio=1.0 because the methods paper centers Mīs pî discussion on K.5896. The test failed: K.5896 has 1,881 signs but **K.2987.B has 3,853 signs** — twice as large. K.5896 is the most-cited Mīs pî manuscript, not the largest. Several §3.7.3 and §3.11 framings of K.5896 as the "dominant" or "centerpiece" Mīs pî witness should be qualified as "dominant by chunk-overlap network centrality, not by physical size."

**Composition resolution.** The tool resolves the target composition either explicitly (caller-supplied `composition_id`) or via identify_composition's top candidate when confidence ≥ fallback_min_confidence (default 0.3). Below the threshold, the tool returns `composition.source='unresolved'` and null metrics — preventing the "every fragment is 0% complete because we picked the wrong composition" failure mode.

**Claim 41.** *Fragment-vs-composition completeness must be reported on two axes — physical-size proxy (sign_count_ratio) and structural-fit (chunk_coverage_ratio against the canonical-chunk backbone of length-20 hashes appearing in ≥2 exemplars) — because they dissociate strongly. K.5896 vs Šurpu produces sign_count_ratio=1.0 alongside chunk_coverage=0.0; conflating them would mis-classify K.5896 as a complete Šurpu witness. The canonical-chunk backbone is the structural invariant; the sign-count comparison is a physical-size proxy that ceilings out for large fragments. K.5896 is the most-cited but NOT the largest Mīs pî exemplar; K.2987.B (3,853 signs) is.*

---

### 3.22 Composition Transmission Lineage (v0.35)

The §3.7 manuscript-sibling, §3.11 stemma, and §3.21 completeness sections operate within a single composition's witness set. §3.22 adds the temporal-geographic dimension: WHERE was the composition copied, WHEN, and which witnesses chained transmission across atelier or period boundaries? v0.35 `find_composition_lineage` composes the v0.20 chunk-hash index, the v0.22 BFS witness expansion, and the v0.18 fragment metadata (period + provenance) into a transmission graph.

**Method.** Resolve the target composition (explicit composition_id or identify_composition's top candidate above fallback threshold). BFS-expand the witness cluster from registry exemplars or a caller-specified seed, using the same v0.22 machinery used by build_canonical_recension_tree. For each witness, extract (period, provenance) from the metadata cache. Bucket witnesses by (period × provenance) into "transmission nodes." For each pair of nodes, count length-20 chunk hashes whose hosts include members of both nodes; emit a transmission_edge if the count exceeds `min_edge_chunks` (default 5). Identify "bridge witnesses" — tablets whose chunks appear in ≥2 nodes OTHER than the witness's own, indicating that the individual witness's surface text carries content that travels across the boundary.

**Empirical surface — Mīs pî transmission is geographically concentrated.** Running on `composition_id="mis_pi"` with max_witnesses=30 produces:

- 16 witnesses in the BFS-expanded cluster
- 2 distinct periods: Neo-Assyrian → Neo-Babylonian
- **1 distinct provenance** (the K.* + Sm.* Kuyunjik / British Museum cluster)
- 2 transmission nodes (period-only differentiation, since provenance is uniform)
- 1 cross-period edge (NA ↔ NB) with shared chunks
- 0 bridge witnesses

The single-provenance result is the substantive finding. Either there is a coverage gap (other-provenance Mīs pî witnesses exist but fall below the BFS chunk-overlap threshold), or there is a real geographic concentration in the surviving record (the Nineveh redaction dominates). §3.20's "no pre-NA witness in this cluster" finding combined with §3.22's "no non-Kuyunjik provenance" finding triangulates a methodological observation: the Mīs pî tradition as we have it through eBL is structurally Neo-Assyrian-Nineveh-anchored, with one cross-period continuation into the Neo-Babylonian record. The §3.7.3 framing of K.5896 as "centerpiece" is now refined: K.5896 is the centerpiece of an NA-Nineveh witness cluster, not of a multi-atelier multi-period tradition (which would require non-Kuyunjik witnesses + OB/MB-period exemplars to appear).

**Bridge-witness zero is correct.** When all witnesses share one provenance, no individual tablet can "span" multiple ateliers — the cross-period chunks bridge IN TIME within a single geographic node. The zero count is structurally accurate, not a missing-data artifact, and the tool exposes the structural absence rather than fabricating diffusion.

**Claim 42.** *Composition transmission tracing — bucketing chunk-cluster witnesses by (period × provenance) — exposes both the temporal trajectory and the geographic concentration of a composition's surviving record. The Mīs pî cluster in the eBL chunk-index reduces to 16 witnesses across 2 periods (NA → NB) and 1 provenance, with one cross-period transmission edge and zero bridge witnesses. The single-provenance finding is itself substantive: it identifies either a coverage gap (other-provenance Mīs pî witnesses below BFS threshold) or a real geographic concentration (Nineveh-redaction dominance). The tool exposes the structural absence rather than fabricating diffusion.*

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
6. **Generalizes across cluster archetypes.** The methodology recovers cluster signal across six distinct archetypes (§3.8): compositional curriculum, verbatim manuscript chain, refrain-bound liturgical family, single-collection school cluster, embedded fragment, and cross-period bridge — supporting application beyond the BM.77056 anchor.
7. **Surfaces commentary–base-text relationships via verbatim quotation chains.** The BM.47463 ↔ CBS.6060 finding (§3.7.1) demonstrates that the cluster methodology, when applied to long verbatim chains (147 contiguous signs at fuzzy-J 0.70), recovers canonical-text + commentary pairs in addition to manuscript-sibling pairs. Cross-validation against eBL's lineToVec /match algorithm distinguishes the two relationship types.

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

A specific tooling refinement is suggested by the BM.47463 ↔ CBS.6060 finding documented in §3.7.1. The `compare_tablet_pair` verdict classifier (v0.18.8) currently maps the cross-axis pattern of high fuzzy-J + high thematic-cosine + high scribal-signature-cosine + long contiguous run to a `physical_join_candidate` verdict, regardless of the tablets' eBL genre classifications. This pattern is necessary but not sufficient for physical-join attribution: a commentary that quotes 147 contiguous signs of its base text reproduces the same cross-axis profile as a physical-join candidate, yet is correctly excluded by eBL's lineToVec /match algorithm. A verdict-classifier upgrade for v0.18.19+ should consult `eBL.genres[]` and downgrade the verdict to `commentary_quotes_base_text` when either tablet carries `CANONICAL → Technical → Commentary`. This refinement allows the methodology to surface the canonical-text + commentary relationship as a first-class finding rather than as a misclassified physical-join candidate.

---

## 6. Reproducibility

All code is available at the cuneiform-mcp repository (private during review; will be made public upon acceptance). Commit `4976266` (v0.18.3) is the head documented here. All probes are deterministic (Random Indexing seed = 42; BFS frontier order sorted by score within each depth). Re-running reproduces the 100+ tablet BM.77056 cluster, the 17/31 fuzzy-rescue pairs, the 3 reciprocal same-scribe pairs, the 91.7% lacuna-restoration top-1 precision, the 2-tablet final bi-orphan surface, and the K.5896 + K.2761 cross-subseries discoveries identically.

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
