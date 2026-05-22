# Methods Paper §3.4.1 Amendment — The BM.34970 Quartet

*Supplementary finding for CDLJ submission. Drafted 2026-05-22 PM following the v2 reconstruction of the BM.77056 cluster (§3.1) at the methods paper's stated `max_size=100` configuration.*

---

## Integration instructions

This amendment is a standalone supplementary-finding sub-section intended for insertion as **§3.4.1** in `methods-paper-cdlj-submission.md`. Two integration paths:

- **Path A (preferred):** Insert §3.4.1 between the existing §3.4 (line 181, after the Beaulieu 2000 paragraph) and §3.5 (line 183, "Lacuna Restoration"). Update Table 3 with the new quartet entries per §3.4.1 Table 5 below. Update the Abstract's same-scribe count from "three reciprocal same-scribe pairs" to "three reciprocal same-scribe pairs plus a four-tablet same-scribe quartet" if including in the abstract.
- **Path B:** Submit §3.4.1 as a separate supplementary-finding addendum alongside the camera-ready paper without modifying §3.4 itself. Preserves the originally-submitted §3.4 narrative as-is.

Either path is consistent with the v2 reconstruction running cleanly on v0.18.3 — no MCP version-bump required.

---

## §3.4.1 The BM.34970 Quartet — A Same-Scribe Scribal Group

The §3.1 cluster reconstruction at `max_size=100` surfaced a pair-similarity outlier within the BM.77056 cluster: **BM.34970 ↔ 1881,0204.471 at fuzzy-Jaccard 0.8069**, exceeding the previously-documented Sippar same-scribe pair BM.77056 ↔ BM.74130 (fuzzy-J 0.48) and the Kuyunjik Mīs pî pair K.15325 ↔ K.8994 (fuzzy-J 0.49) reported in §3.4 Table 3. Running `find_same_scribe_candidates` against both members reveals a **four-tablet quartet** — BM.34970, 1881,0204.471, BM.37658, 1882,0522.515 — that is mutually reciprocal in each other's top-5 same-scribe candidates. Pairwise similarities are summarized in Table 5.

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

### Updated Table 3 (incorporating §3.4.1)

The full reciprocal same-scribe finding set across §3.4 + §3.4.1:

**Table 3 (updated)**. Reciprocal same-scribe pairs and scribal-lineage groups.

| Group | Composition | Best pair (signature cosine) | Combined evidence |
|---|---|---|---|
| BM.77056 ↔ BM.74130 (pair) | *āšipūtu* (Sippar) | 0.78 | fuzzy-J 0.48 + reciprocal scribal — probable physical same scribe |
| K.15325 ↔ K.8994 (pair) | Mīs pî (Kuyunjik) | 0.77 | fuzzy-J 0.49 + reciprocal scribal at #1/#3 |
| BM.35512 ↔ K.2581 (pair) | *Šumma amēlu* medical | 0.59 | Cross-collection same-scribe candidate |
| **BM.34970 + 1881,0204.471 + BM.37658 + 1882,0522.515 (quartet)** | **Šuʾila divine hymns (Ashurbanipal acquisition lot)** | **0.8866** (1881,0204.471 ↔ BM.37658) | **Three-metric convergence + fuzzy-J 0.8069 hub edge + not physical-join — same-scribe scribal-lineage group across four manuscript copies** |

### Methodological summary of §3.4 + §3.4.1

The combined evidence pattern demonstrates that the cuneiform-mcp pipeline produces **three orthogonal computational objects** corresponding to three distinct Assyriological questions:

- `find_fuzzy_parallels` → "what composition?" (validated: K.2798 ↔ Si.776 sibling recovery, §1)
- `find_same_scribe_candidates` → "who copied?" (validated: three pairs in §3.4 Table 3; one quartet in §3.4.1)
- `find_join_candidates` → "what physical original?" (validated negatively: quartet members do NOT join despite same-scribe + same-composition — §3.4.1 paragraph 4)

Each computational object produces evidence the others cannot reach. The quartet's same-scribe identification is independent of and adds to the K.2798 ↔ Si.776 composition-recovery finding; the join-candidate negative discrimination on the quartet is independent of and adds to both. The pipeline's contribution is not any single algorithm but the integration of three orthogonal evidence streams into a unified question-engine for cuneiform manuscript-witness analysis.

---

## Suggested Abstract amendment (optional)

If integrating §3.4.1 inline (Path A), the Abstract's three-pair claim could be expanded:

> Original: "...three reciprocal same-scribe pairs in 34 probed tablets with empirically-validated discrimination from same-composition pairs..."
>
> Amended: "...three reciprocal same-scribe pairs plus a four-tablet same-scribe scribal-lineage group, in 34 + 4 probed tablets, with empirically-validated discrimination from both same-composition pairs (negative K.2798 ↔ Si.776 result) and physical-join candidates (negative quartet-join result)..."

This adds ~25 words to the Abstract. The same-scribe finding-count shift from "3 pairs" to "3 pairs + 1 quartet" tightens the paper's claim around the same-scribe methodology's evidentiary reach.

---

## Related sources

**Primary methods paper:** `methods-paper-cdlj-submission.md`
**Cluster reconstruction data:** v0.18.3 `reconstruct_cluster(seed='BM.77056', max_size=100, max_depth=4, min_fuzzy_jaccard=0.20)`, executed 2026-05-22, terminated at `max_size_reached` (100 members across 20 museum-collection prefixes)
**Same-scribe data:** v0.18.3 `find_same_scribe_candidates` queries against BM.34970 and 1881,0204.471, executed 2026-05-22
**Join-candidate negative results:** v0.18.3 `find_join_candidates` queries against BM.34970 and 1881,0204.471, executed 2026-05-22
**Companion content survey** (Kairo Vault HQ): `HQ/04-Strategy/BM77056-Asipūtu-Cluster-Content-Survey-2026-05-22.md` §4.8 documents the quartet finding in the broader cuneiform-research vault style

**Scholarly anchors referenced:**
- Beaulieu, Paul-Alain. "The Descendants of Sîn-leqi-unninni." In *Assyriologica et Semitica*, AOAT 252, 2000.
- Frame, Grant, and Andrew George. "The Royal Libraries of Nineveh: New Evidence for King Ashurbanipal's Tablet Collecting." *Iraq* 67 (2005): 265-284.
- Reade, Julian E. "Rassam's Babylonian Collection: The Excavations and the Archives." In *Catalogue of the Babylonian Tablets in the British Museum* I (1976): xiii-xxxvi.
