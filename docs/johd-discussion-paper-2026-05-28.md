# Building and Calibrating a Four-Axis Discovery Pipeline over the eBL Cuneiform Corpus

## Methods, Challenges, and Limitations

---

**Author**: Dane Brown — Independent researcher, Tokyo, Japan — `dane@kairovault.com` — ORCID `0009-0001-3874-3729`
**Code**: [github.com/Hugegreencandle/cuneiform-mcp](https://github.com/Hugegreencandle/cuneiform-mcp)
**Archive**: Zenodo DOI [`10.5281/zenodo.20250520`](https://doi.org/10.5281/zenodo.20250520)
**License**: CC-BY 4.0
**Submission**: *Journal of Open Humanities Data* — Discussion paper, 2026-05-28

---

## Abstract

This paper discusses the methodological choices, calibration challenges, and validation limitations that arise when building an automated discovery pipeline over the electronic Babylonian Library (eBL) transliterated cuneiform corpus of approximately 36,500 tablets. The pipeline integrates four orthogonal signal axes — exact and fuzzy lexical similarity over sign trigrams, distributional semantic embeddings (random indexing), and log-likelihood-ratio scribal-orthography signatures — into one tool surface accessible via the Model Context Protocol. Rather than presenting empirical findings about the corpus, the paper foregrounds the *engineering and calibration practices* that make such a pipeline reliable: a calibration-audit methodology that surfaces ranking-stage biases without altering underlying algorithms; held-out evaluation methodology adapted from machine-learning practice but constrained by the labeled-pair scarcity typical of Assyriology; honest reporting of null results, including a Platt-scaling experiment that revealed itself to be a degenerate amnesia-calibration solution rather than a genuine lift. We argue that for ancient-text discovery tooling — where ground truth is sparse, expensive, and contested — calibration discipline and honest negative-result reporting are more important than headline metric numbers, and that journal venues focused on data and methodology (rather than empirical claims) are the appropriate publication target for tools that occupy this middle ground between software and scholarship.

**Keywords**: cuneiform; computational philology; pipeline calibration; honest null results; held-out evaluation; methodology audit; eBL; Model Context Protocol.

---

## Data Accessibility Statement

All code, indices, and validation artifacts described in this paper are openly available. The cuneiform-mcp source repository is hosted at [github.com/Hugegreencandle/cuneiform-mcp](https://github.com/Hugegreencandle/cuneiform-mcp) under CC-BY 4.0. A versioned snapshot is archived at Zenodo (DOI `10.5281/zenodo.20250520`). The pipeline operates on the eBL `/api/fragments/all-signs` endpoint, which is itself openly licensed by the eBL project (Cobanoglu et al. 2024a). Derived caches — including thematic embeddings, scribal signatures, chunk indices, and the composition registry (`data/compositions-v1.json`) — are reproducible via the build scripts in `scripts/` and can be regenerated deterministically (Random Indexing seed=42, BFS frontier order sorted by score within each depth). All worked-example results in §3 reproduce identically from the archived commit.

## Reuse Considerations

This pipeline is intended for two reuse contexts. First, as a *direct query interface* over the eBL corpus for Assyriologists who want to surface manuscript-sibling candidates, scribal-lineage neighbors, or lacuna-restoration suggestions without writing pipeline code; the Model Context Protocol surface exposes 105+ tools callable from any MCP-compatible client. Second, as a *transferable methodology pattern* for similar discovery pipelines over other ancient-text corpora (Hebrew Bible, Ugaritic, Hittite, Egyptian hieratic). The calibration-audit framework documented in §4 is corpus-agnostic; the four-axis decomposition assumes only that the target corpus has sign- or grapheme-level tokenization, lemma-level metadata (optional), and some form of distributional semantic structure. Researchers reusing the pipeline should treat published metric numbers (e.g., 22.5% recall@15 for exact trigram-Jaccard, 91.7% top-1 lacuna restoration) as calibration-state-specific rather than algorithm-intrinsic, and should expect that re-calibration on a new corpus is a several-day rather than several-hour exercise. The labeled-pair store (`validation-resolutions.json`) is bootstrap-quality at the time of publication (n=29 confirmed positives toward a v1.0 target of n=100) and welcomes scholarly review of the candidate-exemplar surface documented in the repository.

---

## 1. Introduction: A Worked Example That Motivates the Method

Before describing the pipeline, we present a single confirmed-positive case that motivates every methodological choice that follows.

K.2798 is a Neo-Assyrian tablet from Kuyunjik classified by eBL as `CANONICAL/Magic/Purification/Bīt salāʾ mê`. Si.776 is a Sippar tablet whose eBL description reads "Small tablet preserving the beginning of the ritual tablet of Bīt šalāʾ mê. Written in Assyrian script." Independent textual scholarship (Walker and Dick 2001; Maul 1994) confirms these as manuscript siblings of the same canonical purification ritual.

Yet a standard sign-trigram Jaccard similarity rates this pair at 0.15 — below the conventional 0.30 discovery threshold used by eBL's hosted `LineToVecRanker` — because two localized sign-form variants at positions 4 and 5 break enough overlapping trigrams to depress the aggregate score. The first 12 of the first 14 sign tokens are identical between the two tablets, but the lexical method at conventional threshold fails to surface the relationship.

This is the paper's motivating challenge. The pipeline described below does not aim to *replace* the lexical method — recall@15 at 22.5% over 267 sibling pairs (combined seeds, 95% CI [17%, 28%]) is in the same ballpark as published benchmarks (Simonjetz et al. 2024). It aims to *complement* the lexical method via three additional axes (fuzzy, thematic, scribal) and a unifying calibration-audit framework that surfaces ranking-stage biases without altering underlying algorithms. The K.2798 ↔ Si.776 pair is the test case we will return to throughout the paper: each pipeline component must produce sensible behavior on this confirmed-positive while remaining honest about its failure modes.

---

## 2. The Four-Axis Pipeline

The pipeline operates on the eBL `/api/fragments/all-signs` endpoint dump (36,498 transliterated tablets, ~33 MB), filtered through a 20-record exclusion list of colophon-template prototype records that aggregate standardized Ashurbanipal-palace colophon vocabulary across hundreds of manuscripts each (Hunger 1968). After exclusion and per-tool minimum-size filters, the working indices contain 28,665 tablets (thematic embeddings), 19,787 (lexical graph), 35,308 (fuzzy parallels), and 25,150 (scribal fingerprint).

The four axes are intentionally orthogonal — each answers a different question about a tablet pair — and the pipeline is designed so that disagreement across axes is itself informative.

**Lexical axis.** Sign-trigram Jaccard similarity with X-token filtering (trigrams with ≥2 unreadable positions are skipped, per a 2026-05-14 calibration finding). The validation benchmark on 50 targets and 87 known siblings (N=267 across two seeds, 95% CI [17%, 28%]) places exact trigram-Jaccard at recall@15 of 22.5%. About 78% of known siblings score below top-15; most fall below 0.20 Jaccard. This is the axis where the K.2798 ↔ Si.776 pair fails to surface.

**Fuzzy lexical axis.** Two trigrams `(a, b, c)` and `(a', b', c')` are fuzzy 1-substitution neighbors iff exactly 2 of 3 positions match. For each tablet, three 2-of-3 inverted indices are built. Fuzzy intersection is the count of query trigrams with at least one fuzzy match in the target. A contiguous-run bonus multiplies the bare Jaccard score by up to 1.5 when matches form long aligned runs, on the principle that 100 contiguous matched positions is qualitatively different evidence from 100 scattered matches even when the aggregate scores are equal. The K.2798 ↔ Si.776 pair scores fuzzy-Jaccard 0.41 here — a 2.67× lift over the exact score.

**Thematic axis.** Distributional semantic embeddings via random indexing (Sahlgren 2005): 300-dimensional, ±3 sign window, k=8 sparse nonzeros per index vector, deterministic seed=42. Per-tablet vectors are inverse-document-frequency-weighted means of sign-context vectors, mean-centered following Mu, Bhat, and Viswanath (2018). Without mean-centering, random-pair cosine median was 0.97; after centering, 0.00 with full spread from −0.70 to +0.80. This is the axis that captures composition-family relatedness even when no specific text passages overlap.

**Scribal axis.** Per-tablet *scribal signature* = top-30 signs ranked by log-likelihood ratio of in-tablet versus corpus-baseline frequency, restricted to signs with corpus frequency ≥5 and in-tablet count ≥2. Comparison via signature cosine plus Jaccard. Because eBL transliterations normalize paleographic variation, this measure captures *orthographic-preference fingerprint* — variant-sign choices, logogram-vs-syllabic spelling habits — rather than handwriting paleography in the strict sense. The same scribe copying two different compositions will have correlated signatures; two different scribes copying the same composition will not.

The four axes feed three integrative tools. **Cluster reconstruction** performs breadth-first search from a seed tablet, accumulating frontier nodes via top-K fuzzy parallels above threshold. **Cross-axis pair comparison** queries all four axes for a given pair and emits a structured verdict (`same_composition_same_scribe` / `same_composition_different_scribe` / `same_scribe_different_composition` / `thematic_only` / `commentary_quotes_base_text` / `weak_relationship` / `unrelated`) based on a hand-coded decision tree. **Bayesian fusion** trains a logistic-regression model over a six-feature vector (lex, fuzzy, thematic, scribal, substitution-lift, composition-assignment-match) to emit a calibrated probability that a pair belongs to the positive class. The decision tree and the fusion model often agree, but their disagreements are themselves diagnostic (see §5).

---

## 3. Worked Examples Illustrating Pipeline Behavior

We present three worked examples illustrating how the pipeline behaves on cases of known difficulty. These are *methodological illustrations*, not empirical claims about corpus structure; their value is in showing what the calibration framework produces, not in cataloguing what was discovered.

**Example 1 — The K.2798 ↔ Si.776 chain.** Beginning with K.2798 as seed, the bi-orphan anomaly surface (lex-J = 0, thematic above-threshold-only) flags the tablet as worth probing. The fuzzy parallel finder rescues the Si.776 pair at fuzzy-Jaccard 0.41 (a 2.67× lift over exact). The cluster reconstructor reveals K.2798 as a peripheral witness of a wider purification-ritual cluster anchored at K.15325. The scribal fingerprint correctly reports K.2798 and Si.776 are *not* same-scribe — exactly as Assyriological theory predicts for two scribes copying the same canonical text. The lacuna restorer recovers synthetic gaps in K.2798 via the Si.776 template at 100% top-10 recall. Each tool produces a verdict consistent with independent textual scholarship; the pipeline behavior on this case is the validation baseline against which calibration changes are measured.

**Example 2 — The BM.77056 cluster reconstruction.** Seeded at BM.77056 with `min_fuzzy_jaccard = 0.20`, the cluster reconstructor at `max_depth = 4` and `max_size = 100` terminates at max-size with all 100 slots filled — meaning the underlying composition is wider than 100 manuscript witnesses. The cluster spans 20 museum-collection prefixes, with 69 of 100 members in a different prefix from the seed. eBL metadata pulls on the top-fuzzy-Jaccard cluster members reveal compositional content corresponding to the late-Mesopotamian *āšipūtu* (exorcist) curriculum (Lenzi 2008; Geller 2010; Maul 1994). This example illustrates that the pipeline's BFS-over-fuzzy-parallels strategy can recover wide-transmission compositions that exact-Jaccard methods miss because peripheral pair-similarities fall below the 0.30 threshold. It is *not* offered here as a substantive claim about the *āšipūtu* canon — that claim properly belongs to a separate empirical paper; here it is offered as an illustration of cluster-reconstruction methodology.

**Example 3 — Cross-axis disagreement as a diagnostic signal.** A pair `BM.38552 ↔ K.9270` surfaced by the active-learning queue had fuzzy_J=0.40, thematic=0.87, scribal=0.50 (just above the same-composition-different-scribe boundary), longest contiguous run = 102 trigrams, fuzzy_intersect = 591. The §3.4 decision tree returned `weak_relationship [low]` — falling through to the weakest classification because the scribal value sat three thousandths above the strict `<0.5` cutoff. The Bayesian fusion model, by contrast, emitted `P(positive) = 0.94`. The disagreement was diagnostic: the decision tree's hand-coded boundary missed a real positive at a calibration soft-spot the trained model handled correctly. We discuss this as a methodological challenge in §5.

A complementary cluster-archetype framework, presented in earlier work for this pipeline, distinguishes six recurring patterns observable in BFS-reconstructed clusters: compositional curriculum, verbatim chain, refrain-bound liturgical, single-collection school, embedded fragment, and cross-period bridge. We do not develop that framework here; it appears in the substantive paper that precedes this discussion paper (Brown, in preparation). The point for present purposes is that the cluster reconstructor's output is structured enough that secondary frameworks can be built on top of it — a property the methodology should preserve under any future re-calibration.

---

## 4. The Calibration-Audit Methodology

The paper's principal methodological contribution is a calibration-audit framework that we have applied across the pipeline at every release. The framework's premise is that *precision in cuneiform-discovery tooling is often calibration-limited rather than signal-limited* — and that this distinction matters because the remedies are completely different.

**The pattern.** For each tool's scoring heuristic, the audit follows five steps: (1) decompose the formula's component terms; (2) quantify per-component contribution on real outputs (if one term dominates >70%, investigate); (3) test edge cases against known-positive pairs; (4) test against synthetic ground truth where available; (5) ship empirically-validated fixes as one-line changes when possible.

**Illustration.** The clearest single application of this pattern was the lacuna-restorer length-factor calibration. The underlying parallel-template alignment had 100% top-10 recall in version v0.18.0 — the signal was present. Top-1 precision was 22.9% because longer-fill templates displaced exact-length matches to rank #2–#7. A single-line length-factor multiplier (1.0 for exact-length fills, 0.7 for off-by-one, 0.5 for off-by-two) lifted top-1 precision to 91.7% on identical inputs without changing the underlying alignment algorithm. The signal had been present all along; only the ranking heuristic had been miscalibrated.

A second application — the bi-orphan threshold audit — converged the bi-orphan discovery surface from 167 candidates to 11 by lowering the thematic-cosine threshold from 0.60 to 0.50 after observing that the K.2798 ↔ Si.776 confirmed-sibling pair was scoring at thematic cosine 0.56 and being misclassified as orphan. The threshold had been calibrated on assumptions about isolation strength that did not match observed corpus structure; recalibrating against confirmed positives corrected the surface without modifying the orphan-detection algorithm itself.

A third application — the methodology-agnostic run bonus — demonstrated that the calibration pattern itself can be more transferable than the underlying algorithm. The fuzzy-parallels run bonus, calibrated in v0.18.2 against confirmed-sibling continuous text-passage embeddings, ported cleanly to the exact-trigram method in v0.18.3 and independently surfaced the same K.5896 + K.2761 cross-subseries discovery from both algorithms. The calibration pattern (longer matched runs deserve score lift) transferred across fundamentally different scoring formulas — strong evidence that the calibration pattern, not the algorithm, was carrying the discovery weight.

**Generalization.** After two formal audit rounds, the cumulative tally was six fixes shipped and two no-ops confirmed. Confirmed no-ops are themselves valuable: the thematic-length-bias audit found no bias because mean-centering at index-build time had already corrected for it; the scribal-threshold tuning audit found the existing calibration optimal because looser thresholds hurt precision more than they helped recall. The audit methodology is not a recipe for finding bugs everywhere; it is a recipe for distinguishing places where the heuristic limits performance from places where the signal genuinely limits performance.

---

## 5. Challenges Surfaced by the Calibration Framework

Three challenges have emerged from sustained application of the calibration framework. Each is presented here as a documented difficulty rather than a solved problem.

**Challenge 1: Decision-tree boundaries do not exactly track the trained model.** The cross-axis pair-comparison tool uses a hand-coded decision tree to emit human-readable verdicts (`same_composition_different_scribe`, etc.). The Bayesian fusion model, trained on labeled pairs, occasionally disagrees with the tree on boundary cases. In active-learning labeling on 2026-05-28, two distinct soft-spots surfaced. The `BM.38552 ↔ K.9270` pair had scribal cosine 0.503 — three thousandths above the tree's strict `<0.5` cutoff for the same-composition-different-scribe branch — and fell through to `weak_relationship` despite fuzzy-J 0.40 + thematic 0.87 + a 102-position contiguous run. The Bayesian model emitted P=0.94 positive on the same pair. A second pair, `K.17494 ↔ K.47`, had scribal cosine 0.697 — three thousandths below the same-scribe threshold of 0.70 — and was classified `thematic_only`, despite the scribal signal being a hair below same-scribe and substitution-lift z-score being −8.76 (the strongest same-scriptorium signal observed in that session). The Bayesian model emitted P=0.96 positive. In both cases the decision tree's hand-coded boundary missed a real positive that the trained model handled. The remedy options — relaxing strict inequalities, widening cutoffs, or adding scribal-signal guards to branches that currently ignore it — are documented in the project's polish queue but not yet shipped; the methodologically interesting point is that the tree and the model are both producing useful but non-coincident signal, and the disagreement is itself a high-value diagnostic worth exposing to users.

**Challenge 2: Honest null results matter, and they have a particular failure mode.** A v0.50 calibration applied Platt scaling to the v0.30 lacuna-restoration fusion scores. The headline result was striking: expected calibration error (ECE) dropped from 0.6374 to 0.0011, a 587× improvement. Subsequent investigation (v0.58) revealed that the Platt fit had achieved this calibration by collapsing all predictions to the population-prior probability (0.183 ≈ top-1 accuracy 0.182). Aggregate calibration was perfect; ranking discriminability was zero. The Platt fit had found a degenerate solution — what we now call *amnesia calibration* — that satisfied the optimization target by abandoning the ranking signal entirely. Isotonic regression on the same data produced ECE 0.0174 (a 37× improvement) while preserving the limited monotone signal. The decision to publish the comparison honestly, rather than the original 587× ECE-lift number, is itself methodologically important: amnesia calibration is a real failure mode that a less critical reporting practice would miss.

**Challenge 3: Labeled-pair scarcity constrains held-out evaluation.** Held-out train/test evaluation of the Bayesian fusion model on n=10 test pairs yielded 90% accuracy with one misclassification (BM.77056 ↔ K.5896, predictable from independent §3.22 + §3.28 results indicating the pair is a curriculum-cluster-versus-centerpiece ambiguity rather than a clean positive or negative). The accuracy number is encouraging; the n=10 number is not. The v1.0 readiness gate for production fusion is ≥100 labeled positives; at the time of writing the labeled-positive count stands at 29 (12 hand-seeded methods-paper anchors plus 17 active-learning labels accumulated through 2026-05-28). Growth is slow because the pairs where human judgment matters most are the ones near the model's decision boundary, and reviewing each requires looking up genre, period, provenance, and the multi-axis signal vector — a several-minute exercise per pair. We treat the labeled-pair bottleneck as a *durable* property of computational Assyriology rather than a problem to be solved by clever sampling; the consequence for downstream papers should be permanent caution about over-interpreting fusion-model probabilities trained on tens to low hundreds of positives.

---

## 6. Limitations

The pipeline has four limitations that constrain reuse and interpretation.

First, the labeled-positive count is bootstrap-quality. Twenty-nine confirmed positives is sufficient to train a model that beats random baseline (98.1% training accuracy, 90% held-out on n=10) but insufficient for production-quality probability calibration. The model should be treated as a research signal, not a verdict, until n approaches 100.

Second, the corpus is eBL-only. Cross-corpus comparative tooling for Hebrew Bible, Ugaritic, or Hittite parallels would require a different sign-tokenization layer and a different metadata schema; the four-axis decomposition is corpus-agnostic in principle but corpus-specific in current implementation.

Third, the eBL transliteration substrate normalizes paleographic variation. Handwriting paleography in the strict sense is invisible to the scribal-signature method; what the method captures is orthographic-preference fingerprint. Researchers interested in true paleography should consult image-based methods (e.g., Cobanoglu et al. 2024b).

Fourth, the bigram beam-search fallback for lacuna restoration collapses to repetitive high-frequency-sign output when no parallel templates exist. The method has 91.7% top-1 precision on tablets with parallel templates and degrades sharply on truly-novel passages. The fallback is documented in the tool output to prevent silent degradation.

---

## 7. Discussion: Principles for Similar Pipelines

Five general principles emerge from the build-and-calibrate sequence documented above. They are offered as discussion points for similar pipelines over other ancient-text corpora, not as universal claims.

(1) **Lexical thresholds calibrated for nearby manuscripts systematically under-recover wide-transmission canonical compositions.** The 0.30 trigram-Jaccard convention works for joining adjacent fragments of one tablet; it fails for joining manuscripts of one canonical composition copied across centuries and cities.

(2) **Methodological precision is often calibration-limited rather than signal-limited.** Before adding new algorithms, audit the existing ranking heuristics for single-term dominance, boundary-off-by-one bugs, and threshold misalignment with confirmed positives.

(3) **Negative results are first-class outputs.** A confirmed no-op (such as the thematic length-bias audit) is as publishable as a confirmed fix. Amnesia calibration (Challenge 2 above) is reportable specifically because it is a failure.

(4) **Decision-tree verdicts and trained-model probabilities should be exposed together.** Their disagreements are diagnostic. A user who sees both `weak_relationship` and `P=0.94 positive` has more information than a user who sees either alone.

(5) **Labeled-pair scarcity is a durable property, not a temporary problem.** Pipeline design should assume that production-quality labeled sets will never grow beyond low hundreds in this domain; uncertainty quantification, honest probability reporting, and active-learning prioritization are the right tools for working under that constraint.

## 8. Conclusion

The cuneiform-mcp pipeline is a working instrument for surfacing manuscript siblings, scribal lineages, cluster relationships, and lacuna restorations over the eBL corpus. Its substantive findings belong to a separate empirical literature. Its methodological contribution — and the subject of this discussion paper — is the calibration-audit framework, the honest-null reporting practice, the held-out-evaluation discipline under labeled-pair scarcity, and the explicit exposure of decision-tree-versus-trained-model disagreement as user-facing signal. We argue these methodological choices are more important than any specific finding the pipeline has produced, and we offer them as discussion points for similar pipelines in the ancient-text discovery domain.

---

## Bibliography

Geller, M. J. 2010. *Ancient Babylonian Medicine: Theory and Practice*. Chichester: Wiley-Blackwell.

Hunger, H. 1968. *Babylonische und assyrische Kolophone*. Kevelaer / Neukirchen-Vluyn. (Alter Orient und Altes Testament 2.)

Cobanoglu, Y., Laasonen, J., Simonjetz, F., Khait, I., Cohen, S., Földi, Z., Hätinen, A., Heinrich, A., Mitto, T., Rozzi, G., Sáenz, L., and Jiménez, E. 2024a. "Transliterated Cuneiform Tablets of the Electronic Babylonian Library Platform." *Journal of Open Humanities Data* 10: 19. DOI: [10.5334/johd.148](https://doi.org/10.5334/johd.148). Dataset archive: [10.5281/zenodo.10018951](https://doi.org/10.5281/zenodo.10018951).

Cobanoglu, Y., Sáenz, L., Khait, I., and Jiménez, E. 2024b. "Sign detection for cuneiform tablets." *it — Information Technology* 66(1): 28–38. DOI: [10.1515/itit-2024-0028](https://doi.org/10.1515/itit-2024-0028).

Lenzi, A. 2008. *Secrecy and the Gods: Secret Knowledge in Ancient Mesopotamia and Biblical Israel*. Helsinki: Neo-Assyrian Text Corpus Project. (State Archives of Assyria Studies XIX.)

Maul, S. M. 1994. *Zukunftsbewältigung: Eine Untersuchung altorientalischen Denkens anhand der babylonisch-assyrischen Löserituale (Namburbi)*. Mainz: P. von Zabern. (Baghdader Forschungen 18.)

Mu, J., Bhat, S., and Viswanath, P. 2018. "All-but-the-Top: Simple and Effective Postprocessing for Word Representations." In *Proceedings of the International Conference on Learning Representations (ICLR)*.

Sahlgren, M. 2005. "An Introduction to Random Indexing." Paper presented at the Methods and Applications of Semantic Indexing Workshop at the 7th International Conference on Terminology and Knowledge Engineering (TKE).

Simonjetz, F., Laasonen, J., Cobanoglu, Y., Fraser, A., and Jiménez, E. 2024. "Reconstruction of Cuneiform Literary Texts as Text Matching." In *Proceedings of the 2024 Joint International Conference on Computational Linguistics, Language Resources and Evaluation (LREC-COLING)*, 13712–13721. [ACL Anthology](https://aclanthology.org/2024.lrec-main.1197/).

Walker, C., and Dick, M. 2001. *The Induction of the Cult Image in Ancient Mesopotamia: The Mesopotamian Mīs Pî Ritual*. Helsinki: Neo-Assyrian Text Corpus Project. (State Archives of Assyria Literary Texts 1.)
