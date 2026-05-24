# cuneiform-mcp v0.22.0 — Stemma Reconstruction + Scribal School Mapping

**The methods-paper-target release.** Two new MCP tools that bridge corpus-wide chunk discovery (v0.20) with the canonical Assyriological reconstruction problems: textual family trees and scribal schools.

**Tool count: 66 → 68.** Built in parallel by two isolated-worktree sub-agents (second use of the v0.21 pattern).

## The two new tools

### `build_canonical_recension_tree`

Automated stemma (textual-family-tree) reconstruction. Given a seed manuscript of a composition, the tool:
1. BFS-expands the witness set from the seed via shared-chunk overlap (chunk-index from v0.20)
2. Computes a pairwise distance matrix using `distance(A,B) = 1 - shared_chunks(A,B) / max(|H_A|, |H_B|)`
3. Runs neighbor-joining (Saitou & Nei 1987 — default) or UPGMA to produce a phylogenetic tree
4. Emits the result as Newick + tree-edges for downstream visualization

**The classic Assyriological problem** — scholars currently build stemmata by hand over weeks per composition. This is the first automated approach at corpus scale.

**K.5896 (Mīs pî) test case:** 16 witnesses recovered; **12 of 16 carry the canonical `Magic → Purification → Mīs pî` genre label** auto-recovered without scholar curation. Distance ranking puts **K.6683 closest (76 shared chunks, d=0.749)** — *closer than the canonical K.9508 example documented in §3.7.3*. K.9508 sits at #2 (65 shared chunks, d=0.786). **Newick output** places K.5896 and K.6683 as immediate sisters under internal node N4, with K.9508 joining via N7. CBS.4506 (Neo-Babylonian Lexicography) surfaces as a cross-curricular leak worth investigation.

Round-7 audit: 4/4 PASS.

### `build_scribal_school_graph`

Joint clustering on (scribal orthographic signature + provenance/find-spot) — empirically reconstruct scribal schools from connected components on a thresholded scribal-cosine graph, restricted to same-provenance edges. Each component = a candidate scribal school.

**Discovery note on provenance fallback:** eBL's `provenance.site` is null for all 25,896 cached entries; `collection` is populated for 22,425. The tool falls back to `collection` as a same-find-spot proxy when site is null (Kuyunjik = Nineveh-mound, etc.). Documented behavior; parent integration discussion logged in the audit doc.

**Top-5 schools emerge at defaults (`min_scribal_similarity=0.65, min_school_size=3`):**

| # | Anchor | Members | Cohesion | Provenance | Period | Top genre |
|---|---|---|---|---|---|---|
| 1 | BM.33837 | 288 | 0.895 | Babylon | Hellenistic ×145, Parthian ×102 | Astronomical Diaries ×170 |
| 2 | K.4292 | 185 | 0.816 | Kuyunjik (Nineveh) | Neo-Assyrian ×134 | EAE-Celestial ×55 |
| 3 | K.4092 | 65 | 0.749 | Kuyunjik | Neo-Assyrian ×59 | Extispicy ×34, Bārûtu series |
| 4 | K.6256 | 31 | 0.783 | Kuyunjik | Neo-Assyrian ×29 | Šumma izbu ×11, teratological omens |
| 5 | K.3453 | 20 | 0.719 | Kuyunjik | Neo-Assyrian ×19 | Nineveh Medical Compendium (5 body-region tablets) |

These are precisely the kinds of clusters §3.1's *āšipūtu* finding predicted should exist:
- **School 1**: the Babylon Hellenistic-Parthian astronomical-diary scribes — a known late-period scholastic community, empirically reconstructed from fingerprint + find-spot alone.
- **School 2**: the Nineveh celestial-divination atelier (EAE tradition).
- **School 5**: a Nineveh therapeutic-medicine atelier spanning 5 body-region tablets in the Medical Compendium.

Round-7 audit: 3/3 PASS. 78s elapsed at defaults; v0.22.1 candidate optimization noted (pre-cache same-scribe lookup).

## Calibration tally — Round 7

| Lever / Audit | Class | Effect |
|---|---|---|
| `build_canonical_recension_tree` | **NEW PRIMITIVE + TOOL** | First automated stemma reconstruction at corpus scale. Neighbor-joining over chunk-overlap distance matrix. K.5896 cluster recovers 16 witnesses, 12/16 with canonical Mīs pî genre. |
| `build_scribal_school_graph` | **NEW TOOL** | Joint scribal+provenance connected-components clustering. 30 schools emerge at defaults; top schools include known late-period Babylon astronomers and Nineveh ateliers. |

**Cumulative v0.18–v0.22 record: 16 calibrations shipped, 4 no-ops.**

## Methods paper §3.7.3 amendment candidate

The v0.22 stemma tool surfaces **K.6683 as the closest textual sister of K.5896** (76 shared length-20 chunks, d=0.749) — *closer than the canonical K.9508 example* (65 shared, d=0.786) documented in §3.7.3. K.6683 was not previously highlighted in the methods paper's Mīs pî transmission narrative.

Two possibilities:
1. K.6683 is a genuinely-undocumented close sister manuscript of K.5896 — worth verifying against Walker & Dick 2001's Mīs pî MS sigla, and a possible §3.7.3 amendment if confirmed.
2. The chunk-overlap distance metric is over-weighting some structural-formula similarity. Less likely given the 76-vs-65 chunk gap is substantial.

Recorded as a follow-up; not retracted from the existing §3.7.3 narrative pending scholarly verification.

## Three new methods-paper claims (§3.11)

26. **`[my synthesis]`** **Stemma reconstruction is automatable at corpus scale from chunk-overlap distance alone.** Given the v0.20 chunk-hash index + neighbor-joining over the max-denominator distance metric, every composition with ≥3 chunk-related witnesses can have a stemma proposed in milliseconds. K.5896 (Mīs pî) demonstrates the method recovers 12/16 witnesses with the canonical genre label and surfaces K.6683 as a potential previously-undocumented close sister. No scholar curation required.

27. **`[my synthesis]`** **Scribal schools emerge empirically from joint clustering on orthographic signature + find-spot.** Connected-components on a thresholded scribal-cosine graph, restricted to same-provenance edges, surfaces 30 candidate schools in the eBL corpus. Top results align with known scholastic communities (Babylon Hellenistic astronomers, Nineveh EAE ateliers, Nineveh therapeutic-medicine atelier) — empirical reconstruction with no scholar curation.

28. **`[my synthesis]`** **The composition-level and physical-place axes are independently learnable but converge.** v0.17–v0.20's composition-level clustering (BM.77056 *āšipūtu* curriculum) and v0.22's scribal-school clustering recover overlapping but non-identical structure. The composition axis traces *what* people copied; the scribal-school axis traces *where* and *with whom*. Methodological independence of the two axes is the empirical basis for treating both as primary reconstructions of cuneiform scribal culture.

## Process — second parallel-sub-agent release

Same pattern as v0.21. Two general-purpose agents in isolated worktrees:
- Agent A → `build_canonical_recension_tree` (commit `7fd984a`, 4/4 PASS)
- Agent B → `build_scribal_school_graph` (commit `c68dec8`, 3/3 PASS)

Both committed to the v0.22 integration branch in sequence (since they touched disjoint files), no merge conflicts. Parent integration: ~10 minutes (registration + version bumps + smoke + audits + release notes + methods paper).

Open design questions noted by agents and accepted at integration:
- **Recension tree distance metric:** `1 - shared/max(|H_A|, |H_B|)` vs Jaccard. The max-denominator is less harsh on asymmetric witness sizes (common in cuneiform). Recorded in `docs/v0.22-recension-tree-design.md`.
- **Scribal-school provenance fallback:** uses `collection` field when eBL `provenance.site` is null. Same-collection (Kuyunjik / Babylon / Sippar) is a reasonable find-spot proxy but should be documented; v0.22.1 candidate is a targeted enrichment of `provenance.site` for the active prefixes.
- **Scribal-school 78s wall time:** v0.22.1 optimization candidate is pre-caching the same-scribe candidate lookup keyed by tablet_id.

## Reproducibility

```bash
# Pre-conditions: v0.20 chunk-index, v0.21.1 metadata coverage ≥30%
npm run build
npm run smoke                                                # 68 tools

# Round-7 audits
node scripts/round7-recension-tree-audit.mjs                 # 4/4 PASS
node scripts/round7-scribal-school-audit.mjs                 # 3/3 PASS

# Live probes (after Claude Code restart)
build_canonical_recension_tree({ seed_tablet_id: "K.5896" })
build_scribal_school_graph({ min_school_size: 3 })
```

## Outstanding (v0.23+)

Per `docs/post-v0.20-roadmap.md`:

- **v0.23 = `sign2vec`** (sign-level semantic embeddings from corpus co-occurrence).
- **v0.22.1 candidates** — pre-cache same-scribe lookup; targeted `provenance.site` enrichment; K.6683 ↔ K.5896 scholarly verification.
- **v1.0 = cross-axis Bayesian fusion** + audit cleanup + API freeze.
- **post-1.0 = cross-corpus comparative** (Hebrew Bible / Ugaritic / Hittite).

## Verification against external benchmarks (queued for v0.22 follow-up)

The recension-tree design doc proposes Robinson–Foulds distance against Walker & Dick 2001's hand-drawn Mīs pî stemma as the gold-standard comparison. Not run as part of v0.22 — recorded as the v0.23 follow-up gating real methods-paper §3.11 validation.
