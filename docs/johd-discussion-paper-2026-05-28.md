# Building and Calibrating a Four-Axis Discovery Pipeline over the eBL Cuneiform Corpus: Methods, Challenges, and Limitations

---

**Author**: Dane Brown<sup>a</sup>\*

<sup>a</sup>Independent researcher, Tokyo, Japan

\*Corresponding author: Dane Brown — `dane@kairovault.com` — ORCID [`0009-0001-3874-3729`](https://orcid.org/0009-0001-3874-3729)

## Author roles

Per the CRediT taxonomy (https://credit.niso.org/), the sole author contributed in the following roles: Conceptualization; Methodology; Software; Validation; Formal analysis; Investigation; Data curation; Writing – original draft; Writing – review & editing; Visualization; Project administration.

---

## Abstract

This paper discusses the methodological choices, calibration challenges, and validation limitations that arise when building an automated discovery pipeline over the electronic Babylonian Library (eBL) transliterated cuneiform corpus of approximately 36,500 tablets. The pipeline integrates four orthogonal signal axes — exact and fuzzy lexical similarity over sign trigrams, distributional semantic embeddings via random indexing, and log-likelihood-ratio scribal-orthography signatures — into one tool surface accessible via the Model Context Protocol. Rather than presenting empirical findings about the corpus, the paper foregrounds the engineering and calibration practices that make such a pipeline reliable: a calibration-audit methodology that surfaces ranking-stage biases without altering underlying algorithms; held-out evaluation methodology adapted from machine-learning practice but constrained by the labeled-pair scarcity typical of Assyriology; honest reporting of null results, including a Platt-scaling experiment that revealed itself to be a degenerate amnesia-calibration solution rather than a genuine lift. We argue that for ancient-text discovery tooling — where ground truth is sparse, expensive, and contested — calibration discipline and honest negative-result reporting are more important than headline metric numbers, and that venues focused on data and methodology rather than empirical claims are the appropriate publication target for tools that occupy this middle ground between software and scholarship.

**Keywords**: cuneiform; computational philology; pipeline calibration; honest null results; held-out evaluation; methodology audit

---

## (1) Context and motivation

Before describing the pipeline, we present a single confirmed-positive case that motivates every methodological choice that follows.

K.2798 is a Neo-Assyrian tablet from Kuyunjik classified by eBL as `CANONICAL/Magic/Purification/Bīt salāʾ mê`. Si.776 is a Sippar tablet whose eBL description reads "Small tablet preserving the beginning of the ritual tablet of Bīt šalāʾ mê. Written in Assyrian script." Independent textual scholarship (Walker & Dick, 2001; Maul, 1994) confirms these as manuscript siblings of the same canonical purification ritual.

Yet a standard sign-trigram Jaccard similarity rates this pair at 0.15 — below the conventional 0.30 discovery threshold used by eBL's hosted line-to-vec ranker — because two localized sign-form variants at positions 4 and 5 break enough overlapping trigrams to depress the aggregate score. The first 12 of the first 14 sign tokens are identical between the two tablets, but the lexical method at conventional threshold fails to surface the relationship.

This is the paper's motivating challenge. The pipeline described below does not aim to *replace* the lexical method — recall@15 at 22.5% over 267 sibling pairs (combined seeds, 95% CI [17%, 28%]) is in the same ballpark as published benchmarks (Simonjetz et al., 2024). It aims to *complement* the lexical method via three additional axes (fuzzy, thematic, scribal) and a unifying calibration-audit framework that surfaces ranking-stage biases without altering underlying algorithms. The K.2798 ↔ Si.776 pair is the test case we return to throughout the paper: each pipeline component must produce sensible behavior on this confirmed-positive while remaining honest about its failure modes.

---

## (2) Dataset description

The pipeline operates on the openly licensed eBL transliterated corpus and produces derived caches that are themselves openly licensed.

- **Repository location**: Software archive at Zenodo, [https://doi.org/10.5281/zenodo.20250520](https://doi.org/10.5281/zenodo.20250520). Source code at [github.com/Hugegreencandle/cuneiform-mcp](https://github.com/Hugegreencandle/cuneiform-mcp).
- **Repository name**: Zenodo (archive); GitHub (development).
- **Object name**: `cuneiform-mcp` — Model Context Protocol server exposing four-axis discovery tools, plus the build scripts, schemas, and derived-cache producers under `scripts/`.
- **Format names and versions**: Source code in TypeScript (Node ≥20). Derived caches in JSON (UTF-8). Composition registry at `data/compositions-v1.json`. Tool input/output envelopes follow JSON Schema 2020-12 with per-tool schemas under `schemas/`.
- **Creation dates**: 2026-05-13 (initial commit) through 2026-05-28 (this submission).
- **Dataset creators**: Dane Brown, sole author and developer.
- **Language**: Source code in English. Transliterated cuneiform substrate follows eBL Assyriological transliteration convention.
- **License**: CC-BY 4.0 (software and derived caches). MIT (for any vendored helper code). The underlying eBL transliteration corpus is openly licensed by the eBL project (Cobanoglu et al., 2024a).
- **Publication date**: 2026-05-17 (Zenodo software archive, v0.18.3 snapshot).

The eBL corpus substrate (Cobanoglu et al., 2024a) is itself published at JOHD with DOI [https://doi.org/10.5334/johd.148](https://doi.org/10.5334/johd.148). Derived caches — thematic random-indexing embeddings, scribal signatures, chunk indices, composition assignments — are reproducible from the eBL substrate via the build scripts in `scripts/` and can be regenerated deterministically (Random Indexing seed=42, breadth-first frontier order sorted by score within each depth). All worked-example results below reproduce identically from the archived commit.

The pipeline is intended for two reuse contexts. First, as a direct query interface over the eBL corpus, exposing 105 tools via the Model Context Protocol callable from any MCP-compatible client. Second, as a transferable methodology pattern for similar discovery pipelines over other ancient-text corpora; the calibration-audit framework documented in section 3 is corpus-agnostic.

---

## (3) Method

The pipeline operates on the eBL `/api/fragments/all-signs` endpoint dump (36,498 transliterated tablets, ~33 MB), filtered through a 20-record exclusion list of colophon-template prototype records that aggregate standardized Ashurbanipal-palace colophon vocabulary across hundreds of manuscripts each (Hunger, 1968). After exclusion and per-tool minimum-size filters, the working indices contain 28,665 tablets (thematic embeddings), 19,787 (lexical graph), 35,308 (fuzzy parallels), and 25,150 (scribal fingerprint).

### (3.1) The four axes

The four axes are intentionally orthogonal — each answers a different question about a tablet pair — and the pipeline is designed so that disagreement across axes is itself informative.

The **lexical axis** computes sign-trigram Jaccard similarity with X-token filtering (trigrams with two or more unreadable positions are skipped, per a 2026-05-14 calibration finding). The validation benchmark on 50 targets and 87 known siblings (N=267 across two seeds, 95% CI [17%, 28%]) places exact trigram-Jaccard at recall@15 of 22.5%. About 78% of known siblings score below top-15; most fall below 0.20 Jaccard. This is the axis where the K.2798 ↔ Si.776 pair fails to surface.

The **fuzzy lexical axis** counts 1-substitution trigram matches: two trigrams `(a, b, c)` and `(a', b', c')` are fuzzy neighbors iff exactly 2 of 3 positions match. For each tablet, three 2-of-3 inverted indices are built. A contiguous-run bonus multiplies the bare Jaccard score by up to 1.5 when matches form long aligned runs, on the principle that 100 contiguous matched positions is qualitatively different evidence from 100 scattered matches. The K.2798 ↔ Si.776 pair scores fuzzy-Jaccard 0.41 on this axis — a 2.67× lift over the exact score.

The **thematic axis** computes distributional semantic embeddings via random indexing (Sahlgren, 2005): 300-dimensional, ±3 sign window, k=8 sparse nonzeros per index vector, deterministic seed=42. Per-tablet vectors are inverse-document-frequency-weighted means of sign-context vectors, mean-centered following Mu, Bhat, and Viswanath (2018). Without mean-centering, random-pair cosine median was 0.97; after centering, 0.00 with full spread from −0.70 to +0.80. This axis captures composition-family relatedness even when no specific text passages overlap.

The **scribal axis** computes a per-tablet *scribal signature* as the top-30 signs ranked by log-likelihood ratio of in-tablet versus corpus-baseline frequency, restricted to signs with corpus frequency ≥5 and in-tablet count ≥2. Because eBL transliterations normalize paleographic variation, this measure captures *orthographic-preference fingerprint* — variant-sign choices, logogram-vs-syllabic spelling habits — rather than handwriting paleography in the strict sense.

### (3.2) Integrative tools

The four axes feed three integrative tools. **Cluster reconstruction** performs breadth-first search from a seed tablet, accumulating frontier nodes via top-K fuzzy parallels above threshold. **Cross-axis pair comparison** queries all four axes for a given pair and emits a hand-coded decision-tree verdict. **Bayesian fusion** trains a logistic-regression model over a six-feature vector (lex, fuzzy, thematic, scribal, substitution-lift, composition-assignment-match) to emit a calibrated probability that a pair belongs to the positive class. The decision tree and the fusion model often agree, but their disagreements are themselves diagnostic.

### (3.3) The calibration-audit framework

The paper's principal methodological contribution is a calibration-audit framework applied across the pipeline at every release. The framework's premise is that *precision in cuneiform-discovery tooling is often calibration-limited rather than signal-limited* — and the remedies for each case are completely different.

For each tool's scoring heuristic, the audit follows five steps: (i) decompose the formula's component terms; (ii) quantify per-component contribution on real outputs (if one term dominates >70%, investigate); (iii) test edge cases against known-positive pairs; (iv) test against synthetic ground truth where available; (v) ship empirically-validated fixes as one-line changes when possible.

The clearest single application was the lacuna-restorer length-factor calibration. The underlying parallel-template alignment had 100% top-10 recall in version v0.18.0 — the signal was present. Top-1 precision was 22.9% because longer-fill templates displaced exact-length matches. A single-line length-factor multiplier (1.0 for exact-length fills, 0.7 for off-by-one, 0.5 for off-by-two) lifted top-1 precision to 91.7% on identical inputs without changing the underlying alignment algorithm.

A second application — the bi-orphan threshold audit — converged the bi-orphan discovery surface from 167 candidates to 11 by lowering the thematic-cosine threshold from 0.60 to 0.50 after observing that the K.2798 ↔ Si.776 confirmed-sibling pair was scoring at 0.56 and being misclassified as orphan. A third application — the methodology-agnostic run bonus — demonstrated that the calibration pattern itself can transfer across algorithms. The fuzzy-parallels run bonus, calibrated against confirmed-sibling continuous text passages, ported cleanly to the exact-trigram method and independently surfaced the same cross-subseries discovery from both algorithms.

After two formal audit rounds, the cumulative tally was six fixes shipped and two no-ops confirmed. Confirmed no-ops are themselves valuable: the thematic-length-bias audit found no bias because mean-centering at index-build time had already corrected for it. The audit methodology is not a recipe for finding bugs everywhere; it is a recipe for distinguishing places where the heuristic limits performance from places where the signal genuinely limits performance.

---

## (4) Results and discussion

This section presents worked examples that illustrate the pipeline's behavior and the challenges that have arisen during sustained calibration. The examples are *methodological illustrations*, not empirical claims; their value is in showing what the calibration framework produces, not in cataloguing what was discovered.

### (4.1) Worked example — the K.2798 ↔ Si.776 chain

Beginning with K.2798 as seed, the bi-orphan anomaly surface flags the tablet as worth probing. The fuzzy parallel finder rescues the Si.776 pair at fuzzy-Jaccard 0.41 (a 2.67× lift over exact). The cluster reconstructor reveals K.2798 as a peripheral witness of a wider purification-ritual cluster anchored at K.15325. The scribal fingerprint correctly reports K.2798 and Si.776 are *not* same-scribe — as Assyriological theory predicts for two scribes copying the same canonical text. The lacuna restorer recovers synthetic gaps in K.2798 via the Si.776 template at 100% top-10 recall. Each tool produces a verdict consistent with independent textual scholarship; the pipeline behavior on this case is the validation baseline against which calibration changes are measured.

### (4.2) Worked example — cross-axis disagreement as a diagnostic signal

A pair `BM.38552 ↔ K.9270`, surfaced by the active-learning queue during the 2026-05-28 review session, had fuzzy-J=0.40, thematic=0.87, scribal=0.50 (just above the same-composition-different-scribe boundary), longest contiguous run = 102 trigrams, fuzzy intersect = 591. The hand-coded decision tree returned `weak_relationship`, falling through to the weakest classification because the scribal value sat three thousandths above a strict `<0.5` cutoff. The Bayesian fusion model, by contrast, emitted *P*(positive) = 0.94. The disagreement was diagnostic: the decision tree's hand-coded boundary missed a real positive at a calibration soft-spot that the trained model handled correctly. We treat this disagreement structure as a feature of the pipeline rather than a bug to be resolved, and discuss its implications below.

### (4.3) Challenge — decision-tree boundaries do not exactly track the trained model

The cross-axis pair-comparison tool uses a hand-coded decision tree to emit human-readable verdicts. The Bayesian fusion model, trained on labeled pairs, occasionally disagrees with the tree on boundary cases. During active-learning labeling on 2026-05-28, two distinct soft-spots surfaced. The `BM.38552 ↔ K.9270` pair fell through to `weak_relationship` despite overwhelming positive evidence, because scribal_cos = 0.503 sat three thousandths above a strict cutoff. A second pair, `K.17494 ↔ K.47`, was classified `thematic_only` because the thematic_only branch ignores the scribal axis entirely, missing a near-same-scribe signal (scribal=0.697, substitution-lift z-score=−8.76). In both cases the decision tree missed a positive that the Bayesian model handled. The remedy options — relaxing strict inequalities, widening cutoffs, or adding scribal-signal guards to branches that currently ignore it — are documented in the project's polish queue. The methodologically interesting point is that both the tree and the model produce useful but non-coincident signal, and the disagreement is itself a high-value diagnostic worth exposing to users.

### (4.4) Challenge — honest null results, and a particular failure mode

A v0.50 calibration applied Platt scaling to the v0.30 lacuna-restoration fusion scores. The headline result was striking: expected calibration error dropped from 0.6374 to 0.0011, a 587× improvement. Subsequent investigation (v0.58) revealed that the Platt fit had achieved this calibration by collapsing all predictions to the population-prior probability (0.183 ≈ top-1 accuracy 0.182). Aggregate calibration was perfect; ranking discriminability was zero. The Platt fit had found a degenerate solution — *amnesia calibration* — that satisfied the optimization target by abandoning the ranking signal entirely. Isotonic regression on the same data produced ECE 0.0174 (a 37× improvement) while preserving the limited monotone signal. Publishing the comparison honestly rather than the headline 587× ECE-lift number is itself methodologically important: amnesia calibration is a real failure mode that a less critical reporting practice would miss.

### (4.5) Challenge — labeled-pair scarcity constrains held-out evaluation

Held-out train/test evaluation of the Bayesian fusion model on n=10 test pairs yielded 90% accuracy with one predictable misclassification (a curriculum-cluster-versus-centerpiece ambiguity). The accuracy number is encouraging; the n=10 number is not. The v1.0 readiness gate for production fusion is ≥100 labeled positives; at the time of writing, the count stands at 29 (12 hand-seeded methods-paper anchors plus 17 active-learning labels). Growth is slow because the pairs where human judgment matters most are the ones near the model's decision boundary, and reviewing each requires looking up genre, period, provenance, and the multi-axis signal vector — a several-minute exercise per pair. We treat the labeled-pair bottleneck as a *durable* property of computational Assyriology rather than a problem to be solved by clever sampling; the consequence for downstream papers should be permanent caution about over-interpreting fusion-model probabilities trained on tens to low hundreds of positives.

### (4.6) Limitations

The pipeline has four limitations that constrain reuse and interpretation. First, the labeled-positive count is bootstrap-quality. Twenty-nine confirmed positives is sufficient to train a model that beats random baseline (98.1% training accuracy, 90% held-out on n=10) but insufficient for production-quality probability calibration. The model should be treated as a research signal, not a verdict, until n approaches 100. Second, the corpus is eBL-only; cross-corpus comparative tooling for Hebrew Bible, Ugaritic, or Hittite parallels would require a different sign-tokenization layer and a different metadata schema. Third, the eBL transliteration substrate normalizes paleographic variation; handwriting paleography in the strict sense is invisible to the scribal-signature method, and researchers interested in true paleography should consult image-based methods (e.g., Cobanoglu et al., 2024b). Fourth, the bigram beam-search fallback for lacuna restoration collapses to repetitive high-frequency-sign output when no parallel templates exist; the method has 91.7% top-1 precision on tablets with parallel templates and degrades sharply on truly-novel passages.

---

## (5) Implications and applications

Five general principles emerge from the build-and-calibrate sequence documented above. They are offered as discussion points for similar pipelines over other ancient-text corpora, not as universal claims.

First, lexical thresholds calibrated for nearby manuscripts systematically under-recover wide-transmission canonical compositions. The 0.30 trigram-Jaccard convention works for joining adjacent fragments of one tablet; it fails for joining manuscripts of one canonical composition copied across centuries and cities. Second, methodological precision is often calibration-limited rather than signal-limited. Before adding new algorithms, audit the existing ranking heuristics for single-term dominance, boundary-off-by-one bugs, and threshold misalignment with confirmed positives. Third, negative results are first-class outputs; a confirmed no-op (such as a calibration-audit that finds no improvement available) is as publishable as a confirmed fix, and amnesia calibration is reportable specifically because it is a failure. Fourth, decision-tree verdicts and trained-model probabilities should be exposed together — their disagreements are diagnostic. A user who sees both `weak_relationship` and *P*=0.94 positive has more information than a user who sees either alone. Fifth, labeled-pair scarcity is a durable property, not a temporary problem; pipeline design should assume that production-quality labeled sets will never grow beyond low hundreds in this domain, and uncertainty quantification, honest probability reporting, and active-learning prioritization are the right tools for working under that constraint.

The cuneiform-mcp pipeline is a working instrument for surfacing manuscript siblings, scribal lineages, cluster relationships, and lacuna restorations over the eBL corpus. Its substantive findings belong to a separate empirical literature. Its methodological contribution — and the subject of this discussion paper — is the calibration-audit framework, the honest-null reporting practice, the held-out-evaluation discipline under labeled-pair scarcity, and the explicit exposure of decision-tree-versus-trained-model disagreement as user-facing signal. We argue these methodological choices are more important than any specific finding the pipeline has produced, and we offer them as discussion points for similar pipelines in the ancient-text discovery domain.

---

## Acknowledgements

The author thanks the electronic Babylonian Library project team for maintaining the openly licensed transliteration corpus that underpins this work, and Prof. Enrique Jiménez (Ludwig-Maximilians-Universität München) for ongoing methodological correspondence and referrals.

## Funding statement

This research received no external funding. The author conducted the work as an independent researcher.

## Competing interests

The author has no competing interests to declare.

## References

Cobanoglu, Y., Laasonen, J., Simonjetz, F., Khait, I., Cohen, S., Földi, Z., Hätinen, A., Heinrich, A., Mitto, T., Rozzi, G., Sáenz, L., & Jiménez, E. (2024a). Transliterated cuneiform tablets of the electronic Babylonian Library platform. *Journal of Open Humanities Data*, 10, 19. [https://doi.org/10.5334/johd.148](https://doi.org/10.5334/johd.148)

Cobanoglu, Y., Sáenz, L., Khait, I., & Jiménez, E. (2024b). Sign detection for cuneiform tablets. *it — Information Technology*, 66(1), 28–38. [https://doi.org/10.1515/itit-2024-0028](https://doi.org/10.1515/itit-2024-0028)

Geller, M. J. (2010). *Ancient Babylonian medicine: Theory and practice*. Wiley-Blackwell.

Hunger, H. (1968). *Babylonische und assyrische Kolophone* [Alter Orient und Altes Testament 2]. Kevelaer / Neukirchen-Vluyn.

Lenzi, A. (2008). *Secrecy and the gods: Secret knowledge in ancient Mesopotamia and biblical Israel* [State Archives of Assyria Studies XIX]. Neo-Assyrian Text Corpus Project.

Maul, S. M. (1994). *Zukunftsbewältigung: Eine Untersuchung altorientalischen Denkens anhand der babylonisch-assyrischen Löserituale (Namburbi)* [Baghdader Forschungen 18]. P. von Zabern.

Mu, J., Bhat, S., & Viswanath, P. (2018). All-but-the-top: Simple and effective postprocessing for word representations. In *Proceedings of the International Conference on Learning Representations (ICLR)*. [https://openreview.net/forum?id=HkuGJ3kCb](https://openreview.net/forum?id=HkuGJ3kCb)

Sahlgren, M. (2005). An introduction to random indexing. In *Methods and Applications of Semantic Indexing Workshop at the 7th International Conference on Terminology and Knowledge Engineering (TKE)*. Copenhagen, Denmark.

Simonjetz, F., Laasonen, J., Cobanoglu, Y., Fraser, A., & Jiménez, E. (2024). Reconstruction of cuneiform literary texts as text matching. In *Proceedings of the 2024 Joint International Conference on Computational Linguistics, Language Resources and Evaluation (LREC-COLING)* (pp. 13712–13721). [https://aclanthology.org/2024.lrec-main.1197/](https://aclanthology.org/2024.lrec-main.1197/)

Walker, C., & Dick, M. (2001). *The induction of the cult image in ancient Mesopotamia: The Mesopotamian Mīs Pî ritual* [State Archives of Assyria Literary Texts 1]. Neo-Assyrian Text Corpus Project.

## AI declaration

The author used Anthropic's Claude (model: Claude Opus 4.7, 1M-context variant) as an editorial and drafting assistant throughout the preparation of this manuscript. Specifically, Claude was used to draft section text from prior author-authored materials (an earlier preprint and a longer manuscript declined by this journal on scope/format grounds), to verify bibliographic details through public web sources, to convert references between citation styles, and to restructure section ordering to match the journal's template. All claims, citations, and interpretations were reviewed and approved by the author, and the author retains full responsibility for the manuscript's content. Generative AI tools were not used for primary data acquisition or for the empirical analysis underlying the discussed pipeline; all software described in section 3 was author-authored and is publicly archived under the DOI listed in section 2. This declaration conforms to the publisher's AI policy (https://ubiquitypress.com/ai-policy).
