# Post-v0.20 Roadmap

Recorded 2026-05-24. Tier-ordered, with rough cost estimates and explicit motivation per item. Subject to revision as v0.20 results come in.

## Tier 1 — Frontier moves (new analytical primitives, methods-paper potential)

### 1. `build_canonical_recension_tree` — automated stemma reconstruction

Given a composition with many manuscript witnesses (e.g., the 100+ Mīs pî copies in the BM.77056 cluster), automatically build the textual-family-tree showing which copy is descended from which. **The classic Assyriological problem** — scholars currently do this by hand over weeks-to-months per composition. With the v0.20 chunk-hash index already storing pairwise overlap data, the math (phylogenetic clustering algorithms like neighbor-joining or maximum-parsimony) is well-understood from comparative biology and bioinformatics.

**Motivating cases:** the BM.77056 *āšipūtu* cluster, the Sm.1055 Udug-ḫul 100+ member chain (methods paper §3.7.2), the K.5896 Mīs pî manuscript family (§3.7.3).

**Why it matters:** automating manuscript-family-tree construction would be a watershed contribution. Every philologist working on canonical texts builds stemmata; doing it computationally and reproducibly at corpus scale has no precedent in the field.

**Effort:** ~2-3 weeks. Risk: choice of phylogenetic algorithm + validation against hand-built stemmata.

**Target version:** v0.22 (after v0.21 workflow tools).

### 2. `sign2vec` — sign-level semantic embeddings

Train sign-level embeddings from corpus co-occurrence (skip-gram or PMI-based, modest scale). Current thematic embeddings (v0.15) operate at *tablet* level only. Sign-level embeddings would expose which signs MEAN the same thing — empirically discovering logogram substitutions (DINGIR ↔ AN), period-specific sign equivalences, and phonetic clusters.

**Downstream impact:** semantic-aware lacuna restoration (predict what sign *fits the meaning*, not just what's *statistically likely* from bigram context); a new axis for `compare_tablet_pair`; richer cross-period sibling detection.

**Why it matters:** no Assyriological toolkit has sign-level semantic embeddings. Opens a new analytical axis (semantic) below the existing thematic axis. Calibratable against known logogram substitutions as positive ground truth.

**Effort:** ~1-2 weeks including evaluation suite.

**Target version:** v0.23.

### 3. Cross-corpus comparative — Hebrew Bible / Ugaritic / Hittite

Extend chunk-discovery beyond Mesopotamian. Find shared passages between cuneiform Akkadian and Hebrew Bible (already partially seeded by `find_biblical_parallel`), Ugaritic ritual texts, Hittite treaties. Methods paper §5.4 lists this as future work.

**Why it matters:** transformative for biblical-studies and ANE-comparative adjacency. Most cited papers in cuneiform studies are cross-corpus by nature; automating chunk-level cross-corpus discovery would land the methodology in adjacent fields.

**Effort:** ~1-2 months depending on corpus integration (tokenization for each script, alignment of sign vs. consonantal-text granularity, separate metadata layers).

**Target version:** post-v1.0. Too big a scope shift to land mid-version-cycle.

---

## Tier 2 — Practical workflow tools (less novel, daily-useful)

### 4. `prioritize_validation_queue` — active-learning ranker

Score each pending validation target (bi-orphans, secondary-literature candidates, every K.3306-style discovery surfaced by v0.19/v0.20) by **information gain from manual review**. Replaces ad-hoc judgment with a ranked queue: "30 min on tablet X resolves more uncertainty than 30 min on tablet Y."

**Inputs:** chunk-coverage gaps, cluster-edge uncertainty, metadata sparsity per candidate.

**Why it matters:** practical workflow tool. Most of Dane's audit-doc backlog is "manually review N candidates" with no priority signal. This builds the priority signal.

**Effort:** ~3-5 days.

**Target version:** v0.21.

### 5. `find_incipits` — short-window discovery

v0.20's `find_formulaic_passages` uses length=20 windows and misses 3-8 sign opening formulae (incipits), which scholars use to identify compositions ("EN₂ Šurpu-tu-šú", "i-nu Šamaš É u-pa-az-zar"). Build a separate length=10 chunk-hash index + tool, calibrated independently for the shorter-window precision/recall tradeoff.

**Why it matters:** complements `find_formulaic_passages` at the short end. Surfaces the most-canonical fragments (incipits ARE the names of compositions in scholarly practice).

**Effort:** ~1 week including separate Round-6 calibration.

**Target version:** v0.21.

### 6. `build_scribal_school_graph` — joint location + scribal-signature clustering

Joint cluster on (provenance + scribal signature) to reconstruct scribal schools empirically. Connects the v0.17 KAR-44 curriculum findings to physical training locations: "Sippar atelier 4 copied compositions A, B, C in late Neo-Babylonian period."

**Why it matters:** bridges the §3.1 BM.77056 *āšipūtu* finding (composition-level) with provenance data to produce a *physical* + *intellectual* map of cuneiform scribal culture. Useful for non-philological audiences (museums, historians).

**Effort:** ~1 week.

**Target version:** v0.22.

---

## Tier 3 — Polish & consolidation

### 7. Per-archetype threshold matrix (Round 3 Lever 5)

Deferred from v0.18.19 Round 3 audit. Different precision/recall threshold profiles for each of the 6 cluster archetypes documented in methods paper §3.8 (embedded fragment vs verbatim chain vs refrain-bound family etc.). Trades a single global threshold for per-archetype calibration.

**Effort:** ~3-5 days.

**Target version:** v0.21 or v0.22.

### 8. Cross-axis Bayesian fusion

Current `compare_tablet_pair` evaluates 4 axes independently (lex / fuzzy / thematic / scribal) and emits parallel verdicts. A unified probabilistic score across all axes would be statistically clean and expose per-axis calibration quality. Requires gold-standard labeled pairs (~50–100 manually-validated positives + negatives) before fitting.

**Why it matters:** imposes statistical discipline on the whole stack. Natural v1.0 release feature once labeled training data is gathered.

**Effort:** ~1-2 weeks once labels are available.

**Target version:** v1.0.

### 9. Sign-form variant normalization at query time

Shelved in v0.5 (zero rank changes from naive collapse rules) but methods paper §5.4 notes position-aware approaches remain unexplored. With the chunk-index now in place, position-aware variant normalization can be retested: does collapsing `ABZ231 ↔ ABZ172` improve specific-chunk recall in known sibling pairs without inflating false-positive rates?

**Effort:** ~1 week including experiment.

**Target version:** v0.22+ (revisit only if a concrete recall-gap surfaces).

---

## Recommended sequencing

| Version | Contents | Effort | Why this order |
|---|---|---|---|
| **v0.21** | #4 active-learning queue + #5 find_incipits | ~1 week total | Both extend v0.20 chunk-index foundation cheaply, both useful daily. |
| **v0.22** | #1 stemma reconstruction + #6 scribal-school graph | ~3-4 weeks | The methods-paper-target release. Stemma is the watershed claim. |
| **v0.23** | #2 sign2vec | ~1-2 weeks | Opens new analytical axis; pairs well with the corpus-wide chunk infrastructure. |
| **v1.0** | #8 Bayesian fusion (gates on label collection); audit cleanup; freeze public API | open | Stabilizes the platform for downstream researchers. |
| **post-1.0** | #3 cross-corpus comparative | ~1-2 months | Scope shift big enough to warrant a major release after stability. |

Items #7 and #9 fit opportunistically into v0.21–v0.22 sprints as calibration-audit cleanups.

## What this list deliberately excludes

- **UI / web frontend / dashboard** — the MCP server is the right interface for the tools' primary users (LLM agents + Dane via Claude Code). A web UI would be a separate project.
- **Hosted version / public deployment** — not a research priority; tied to Dane's "keep it private" default.
- **Sign-detection from images** — separate field (computer vision on tablet photos); covered by other projects like the de Gruyter 2024 work.
- **General LLM fine-tuning** — separate research thread (Gutherz 2023 baseline + successors); not a tooling priority.
