# Panel-Response: cuneiform-mcp v0.37 → v0.41 sweep

Generated 2026-05-25 after the v0.36 → v0.41 burst, in response to the imagined-expert panel review session.

The panel had **6 voices** (Mertens / Al-Sayyid / Patel / Toussaint / Yamamoto / Lindqvist) and surfaced **15 distinct asks** across three rounds (likes / wants / concerns). This document tracks what shipped, what's gated externally, and what was deferred with explicit reasons.

---

## Summary

- **Shipped: 12 of 15 asks** across 5 versions (v0.37–v0.41)
- **Externally gated: 3 of 15** (held-out test set, web UI, Sippar enrichment) — all blocked on resources I cannot manufacture autonomously
- **Bonus finding from action:** v0.40 BLEU benchmark exposed massive overconfidence in `restore_lacuna_semantic` (top-1 16% vs mean confidence 80.9%, ECE=0.6490) — methods paper §3.25 records honestly

---

## Phase 1 (v0.37) — registry as versioned artifact + expansion

**Panelists:** Toussaint, Mertens

| Ask | Status | Where |
|---|---|---|
| Registry as separately-citable, versioned JSON artifact | ✅ SHIPPED | `data/compositions-v1.json`; registry_version="1.0.0"; CC-BY-4.0 license |
| Persistent URIs per composition | ✅ SHIPPED | `https://cuneiform-mcp.org/compositions/v1/{id}` URIs |
| Print-edition citations | ✅ SHIPPED | `print_editions[]` field per composition (Reiner 1958, Geller 2016, Walker & Dick 2001, etc.) |
| External IDs (eBL / OGSL / CAD) | ✅ SHIPPED | `external_ids` field per composition |
| Expand beyond *āšipūtu* | ✅ SHIPPED | 5 → 11 compositions; added Maqlû, EAE, Šumma izbu, Šumma ālu, Bārûtu, Diri/Aa |
| Registry introspection tool | ✅ SHIPPED | `list_compositions` (tool 89/92) |

**Audit:** Round 23, 20/20 PASS.
**Commit:** `5b28613`.

---

## Phase 2 (v0.38) — bootstrap-warning propagation

**Panelists:** Mertens, Lindqvist

| Ask | Status | Where |
|---|---|---|
| Prevent overconfidence-by-association via downstream tools | ✅ SHIPPED | `REGISTRY_BOOTSTRAP_NOTE_V1` surfaced in `warnings[]` for all 4 registry-dependent tools (`identify_composition`, `score_tablet_completeness`, `find_composition_lineage`, `damaged_passage_composition_probability`) |
| Cross-tool consistency tests | ✅ SHIPPED | Round 24 audit — verifies all 4 tools agree on K.5896 → mis_pi, BM.47463 → surpu |
| Shared provenance-tags module | ✅ SHIPPED | `src/provenanceTags.ts` with `BOOTSTRAP_WARNING_V029_TEMPLATE` + `REGISTRY_BOOTSTRAP_NOTE_V1` + `appendBootstrapWarnings()` helper |

**Audit:** Round 24, 10/10 PASS.
**Commit:** `8fa6d7a`.

---

## Phase 3 (v0.39) — IIIF imagery + ancient find-spot + stemma visualization

**Panelists:** Patel, Yamamoto

| Ask | Status | Where |
|---|---|---|
| Stemma visualization (tree picture, not just Newick string) | ✅ SHIPPED | `render_stemma_svg` tool — cladogram SVG, self-contained, no external deps |
| eBL/IIIF photo URL integration | ✅ SHIPPED | `getEblPhotoUrl` + `getEblFragmentUrl` accessors + `get_tablet_image_links` tool |
| Ancient find-spot vs modern collection prefix | ✅ SHIPPED | `getAncientFindSpot` accessor — uses provenance.region with site/string fallback; `get_tablet_image_links` surfaces both axes |

**Audit:** Round 25, 21/21 PASS.
**Commit:** `ae84405`.

**Substantive finding from this phase:** K.5896 has no `provenance.region` populated in the cached metadata despite known Kuyunjik origin. eBL's metadata schema sometimes carries bare-string provenance for older records — gaps the panel asked about exist in the source data itself, not just in our parsing.

---

## Phase 4 (v0.40) — confidence calibration + lacuna BLEU benchmark

**Panelists:** Lindqvist, Al-Sayyid

| Ask | Status | Where |
|---|---|---|
| Reliability diagram / confidence calibration | ✅ SHIPPED | `compute_confidence_calibration` tool — Brier + ECE + MCE + verdict |
| BLEU/CHRF comparable with Gutherz 2023 | ✅ SHIPPED (with framing caveat) | `scripts/benchmark-lacuna-bleu.mjs` — explicit note that single-sign top-1 ≠ multi-token translation BLEU |
| Train/test split methodology | ⏳ GATED — see §"Externally gated" |

**Audit:** Round 26, 12/12 PASS.
**Commit:** `b58d280`.

### Substantive finding (the panel's worst-case made concrete)

The 50-sample synthetic-gap BLEU benchmark on `restore_lacuna_semantic` produced:

| Metric | Value |
|---|---|
| Top-1 accuracy | **16.0%** |
| Mean top-1 confidence | **80.9%** |
| Calibration gap | **-64.9 percentage points** |
| ECE | **0.6490** (13× the well-calibrated threshold of 0.05) |
| MCE | 0.7886 |
| Brier score | 0.5575 |
| Verdict | **OVERCONFIDENT** |

Even in the [0.90, 1.00) confidence bin (n=12 samples, mean predicted 0.955), observed accuracy is only **16.7%** — confidence of "almost certain" yields ~1-in-6 accuracy on bare-context single-sign prediction.

**Mertens's flagged concern is empirically vindicated:** the published §3.5 92% top-1 figure was on parallel-template-aligned positions with structural context, NOT on bare-context restoration. The joint_score returned by `restore_lacuna_semantic` is a ranking signal in [0,1], not P(correct).

Methods paper amendment in progress (§3.25 — "Calibration of single-sign restoration on bare context: a finding"). v0.41+ may rename `joint_score` → `ranking_score` or recalibrate via isotonic regression once a held-out calibration set exists.

---

## Phase 5 (v0.41) — API stability + this document

**Panelists:** Al-Sayyid, Toussaint

| Ask | Status | Where |
|---|---|---|
| Tool-surface consolidation / canonical 10 | ✅ SHIPPED | `docs/API-STABILITY-v1.0.md` — 92 tools classified into canonical (10) / stable (50) / experimental (24) / specialized (16) tiers |
| API freeze decisions for v1.0 | ✅ SHIPPED (decisions documented; freeze applied at v1.0) | Same document |
| Panel-response synthesis | ✅ SHIPPED | This document |

---

## Externally gated (3 of 15 panel asks)

These asks I CANNOT autonomously complete in this session. Each is documented here with the specific blocker.

### G1. Held-out test set (Lindqvist, Al-Sayyid, Yamamoto)

**Blocker:** ≥100 labeled pairs are required for a meaningful out-of-sample evaluation. As of v0.40, the active-learning store has 0 user-recorded resolutions (the loop was just shipped in v0.31). The panel's request is structurally correct, but the labels must accumulate through actual scholarly use — they cannot be manufactured.

**Path forward:**
1. Dane and collaborators use `prioritize_validation_queue` + `record_validation_resolution` regularly
2. When store reaches ≥100 positive resolutions, freeze the methods-paper hardcoded 12-pair set as the "training" set and use the persistent store as the "held-out test" set
3. Retrain v0.29 Bayesian fusion on the union; report out-of-sample metrics in a methods-paper update

**Estimated time-to-completion:** months, gated on scholarly use, not on engineering.

### G2. Web interface (Yamamoto)

**Blocker:** Hosted deployment is gated on methods-paper acceptance per `docs/v1.0-cloudflare-hosting-plan.md`. The "keep it private" policy from the user's `feedback_keep_it_private.md` memory remains the default until acceptance lands.

**Path forward:**
1. Methods paper acceptance (CDLJ declined; JOHD next; arXiv endorsement still pending from Jiménez)
2. Once accepted, execute the Cloudflare hosting plan (~1-2 weeks engineering)
3. Web UI lands at that point

**Estimated time-to-completion:** weeks once paper acceptance lands; indefinite until then.

### G3. Sippar / non-Kuyunjik enrichment burst (Yamamoto, Patel)

**Blocker:** eBL is a small academic research resource at LMU Munich. The user's stated rule (memory: `reference_xrpl_audit_mcp` — paraphrased from the Jiménez email context) is "polite consumer of eBL." Rate-limit bypassing via multi-IP is explicitly rejected as ethically wrong. The current enrichment cache (36,317 entries) was built with respectful pacing and is largely Kuyunjik-dominated.

**Path forward:**
1. Await Jiménez's response to the 2026-05-24 rate-limit email (the second of the thread)
2. If granted higher rate-limit tier or Auth0 service-account access: targeted Sippar enrichment becomes feasible (~1-2 day burst)
3. If not granted: continue at current pace; Sippar coverage grows organically with normal usage

**Estimated time-to-completion:** dependent on Jiménez reply; 1-3 weeks expected.

---

## Asks shipped beyond the panel list

A few items came up during execution that weren't on the original panel list but were natural extensions:

| Item | Where | Note |
|---|---|---|
| Composition curriculum tagging | `compositions-v1.json` | `composition_type: 'curriculum'` distinguishes āšipūtu KAR-44 from specific compositions |
| Bootstrap-warning shared module | `src/provenanceTags.ts` | Reusable utility for future v0.29-dependent tools |
| Auto-fit branch-length scaling in SVG | `renderStemmaSvg` | Adapts to tree size without manual tuning |
| Calibration data harvesting script | `benchmark-lacuna-bleu.mjs` | Auto-writes calibration_samples.json for downstream use |

---

## Methods paper amendments queued (§3.24, §3.25)

### §3.24 — Panel review and registry expansion (new section, post-§3.23)

Records the panel review process + registry expansion 5 → 11 + the citability refactor + the API stability tiering. Anchors the "canonical 10" claim for v1.0.

### §3.25 — Calibration of single-sign restoration on bare context (new section, post-§3.17 amendment)

Records the v0.40 finding:
- 16% top-1 accuracy on bare-context synthetic gaps
- Mean predicted joint_score 80.9% → calibration gap −64.9 pp
- ECE 0.6490 — overconfident classifier by 13× the threshold
- The §3.5 92% figure is on parallel-template-aligned positions with structural context; NOT comparable to bare-context restoration

This is exactly the kind of substantive finding the panel asked for ("until there's a held-out test set, the published numbers can't be trusted as out-of-sample"). The panel warned about it abstractly; v0.40's benchmark + calibration tool quantified it.

---

## Verdict

**Panel asks ratio: 12/15 shipped autonomously, 3/15 externally gated with explicit reasons.**

The 12 shipped asks were the in-tool / in-codebase items. The 3 gated asks require resources I don't control (labeled-pair accumulation through scholarly use, paper acceptance, eBL rate-limit grant). All 3 are documented with specific paths-forward and time-to-completion estimates.

The v0.40 BLEU + calibration discovery validates the panel's framework: **a panel that demands out-of-sample evaluation and reliability diagrams produces concrete, publishable findings within hours when those tools are built**. The pattern (panel → tools → diagnostic finding) is one I'd recommend repeating periodically — Mertens at month 6, Lindqvist at month 12, etc.

For Tier-2+ planning, see the next round of the `docs/v0.31-plus-upgrade-ideas.md` queue. After v0.41 ships, the natural next item is Tier-2 #8 `bayesian_fusion_at_scale` (depends on G1 above) or Tier-3 #11 `find_sign_glyph` (Unicode glyph lookup, 1-day pure-data item).
