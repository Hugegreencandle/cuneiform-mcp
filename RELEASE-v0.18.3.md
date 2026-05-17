# cuneiform-mcp v0.18.3 — Release Notes

*Released 2026-05-17. Paper companion release — arXiv preprint concurrent.*

---

## TL;DR

**v0.18.3 is the camera-ready release for the methods paper** [*Four-Axis Computational Discovery in the eBL Cuneiform Corpus*](docs/methods-paper-arxiv.md). Every claim in the paper is reproducible from this commit (`4976266`, head of the `main` branch as of release). All four discovery axes — lexical, thematic, fuzzy, and scribal — plus the lacuna restorer ship in this build, alongside the two calibration audits that produced 4× precision lifts without changing any underlying algorithm.

This release closes the v0.16 → v0.18.3 arc. The pipeline is feature-frozen for the paper's reproducibility window.

**Headline findings reproducible from this commit:**

- **55% manuscript-sibling rescue rate** on candidates that lexical methods at the conventional 0.30 Jaccard threshold rate as isolated (17 of 31 probed pairs validated)
- **100+ tablet *āšipūtu* (exorcist) library cluster** reconstructed from a single seed tablet (BM.77056) across 20 museum-collection prefixes
- **3 reciprocal same-scribe pairs** in 34 probed tablets, with empirically validated cross-axis discrimination from same-composition pairs
- **91.7% top-1 precision** + **100% top-10 recall** in synthetic-gap lacuna restoration across 48 test cases
- **Bi-orphan discovery surface** converged from 167 candidates to 2 (`IM.49220` + `K.3306`) without altering any underlying algorithm — calibration only
- **K.5896 + K.2761 Mīs pî / Bīt salāʾ mê cross-subseries discoveries** surfaced from the methodology-agnostic run-bonus calibration in `find_parallel_text`

---

## What ships in v0.18.3

### Tools (30 MCP tools across four discovery axes)

| Axis | Key tool | What it does |
|---|---|---|
| Lexical | `find_parallel_text` | Exact sign-trigram-Jaccard with X-token filter + run-bonus (v0.18.3) |
| Thematic | `find_thematic_parallel` | Random-Indexing 300d embeddings, mean-centered |
| Fuzzy | `find_fuzzy_parallel` | One-substitution-tolerant trigram with contiguous-run signaling |
| Scribal | `find_scribal_lineage` | LLR signature on sign-form preferences |
| Anomaly | `surface_bi_orphans` | Joined lex + thematic surface, two-class filter |
| Reconstruction | `reconstruct_cluster` | Recursive BFS via fuzzy parallels |
| Restoration | `restore_lacuna` | Parallel-template alignment + bigram beam-search fallback |
| Inference | `infer_damaged_sign` | Single-sign best-guess from neighborhood context |
| RAG | `find_biblical_parallel`, `find_antediluvian_parallel`, `find_mesopotamian_parallel` | Curated comparative-religion retrieval (v0.6–v0.14) |
| Plus | 20 lookup, search, and metadata tools | (`get_tablet`, `lookup_sign`, `search_oracc`, `get_fragment`, etc.) |

### The two calibration audits

The paper's secondary contribution. Both shipped in this release:

- **v0.18.2 calibration audit** (three fixes): thematic-cosine threshold 0.60 → 0.50, X-token filter on lexical layer, anchor-pair sorting. Bi-orphan surface 167 → 2, K.5896 surfaced.
- **v0.18.3 calibration round-2** (one fix, two no-ops, one deferral resolved): run-bonus ported from fuzzy to exact `find_parallel_text`. K.2761 surfaced. Calibration pattern proven methodology-agnostic.

---

## Reproducibility

Every figure and claim in the paper is reproducible from this commit. From a fresh clone:

```bash
git clone https://github.com/Hugegreencandle/cuneiform-mcp.git
cd cuneiform-mcp
git checkout 4976266
npm install
npm run build

# 1. Fetch the eBL all-signs cache (~26 s, ~33 MB)
node dist/index.js --prefetch

# 2. Build the corpus-viz lexical graph (~7 min) — separate repo
cd ~/Desktop/corpus-viz && node build-graph.mjs

# 3. Build v0.15 thematic embeddings (~4 min)
cd - && node scripts/build-embeddings.mjs

# 4. Build the v0.16 anomaly-surface joined index (~10 s)
node scripts/build-anomaly-index.mjs

# 5. Reproduce the BM.77056 āšipūtu cluster (single MCP call)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"reconstruct_cluster","arguments":{"seed_tablet_id":"BM.77056","max_cluster_size":100,"max_depth":4}}}' \
  | node dist/index.js
```

All random seeds are pinned (`seed=42` for Random Indexing; `seed=42` + `seed=137` for the validation benchmark). BFS frontier order is sorted by score within each depth. Re-running on this commit produces the same 100+ tablet cluster, the same 17/31 fuzzy-rescue pairs, the same 3 same-scribe pairs, the same 91.7% lacuna-restoration top-1 precision, and the same 2-tablet final bi-orphan surface — byte-identical, not merely statistically equivalent.

### Supplementary validation documents

Referenced by the paper, shipped in `docs/`:

- `v0.16-bi-orphan-candidates.md` — top-30 bi-orphan list (pre-filter)
- `v0.16-bi-orphan-inspection.md` — five-class false-positive analysis
- `v0.17-validation-findings.md` — 17/31 fuzzy-rescue probe results
- `v0.17-ebl-metadata-probe.txt` — raw eBL metadata pull for cluster identification
- `v0.18-scribal-validation.md` — three reciprocal pairs + cross-axis discrimination
- `v0.18-lacuna-stress-test.md` — 48-test stress test, v0.18.0 vs v0.18.1 side-by-side
- `v0.18.2-calibration-audit.md` — three-fix audit details + K.5896 discovery
- `v0.18.3-calibration-round2.md` — round-2 audit findings (two no-ops, one deferral resolved)
- `v0.18.3-parallel-text-run-bonus.md` — `find_parallel_text` calibration + K.2761 discovery

---

## Citing this release

Cite both the paper and the software archive:

**Paper** (arXiv preprint, concurrent with this release):

> Brown, D. (2026). *Four-Axis Computational Discovery in the eBL Cuneiform Corpus: Recovering Manuscript-Sibling False Negatives, Reconstructing the Late-Mesopotamian Exorcist's Library, Discriminating Scribal Lineages, and Restoring Damaged Passages.* arXiv preprint arXiv:[ID-pending]. https://arxiv.org/abs/[pending]

**Software** (this release):

> Brown, D. (2026). *cuneiform-mcp v0.18.3* [Software]. Zenodo. https://doi.org/[Zenodo-DOI-on-release]

`CITATION.cff` and `.zenodo.json` ship with the repo and auto-populate citation managers.

---

## Methodology cross-pollination note

The four-axis methodology in this paper (LLR signatures, trigram-Jaccard with run-bonus, mean-centered Random Indexing embeddings, reciprocal-pair clustering, anomaly surfacing via joined lex+thematic dimensions, calibration audits) is general — it works on any token-sequence corpus, not just cuneiform sign-tokens. The same methodology has since been applied independently to behavioral classification of XRPL wallet transaction histories (separate project, separate domain, same author).

If you've found the calibration-audit pattern useful, the meta-take is: **precision in discovery tooling is often calibration-limited, not signal-limited.** A 4× precision lift from a one-line scoring change isn't because the new line is magic — it's because the previous scoring function was unaudited. The first thing to do when a discovery surface looks too noisy is a calibration audit, not a new algorithm.

---

## License

CC-BY 4.0. Cite the paper. Reuse, fork, extend.

---

## Acknowledgments

Validation against confirmed manuscript siblings would not be possible without the eBL team's open transliteration corpus and the eBL `LineToVecRanker` baseline. The K.2798 ↔ Si.776 case study that motivates the entire pipeline is built on top of their public sibling-identification work.

The Oracc and CDLI projects provide the comparative-religion retrieval layer (v0.6–v0.14, RAG tools).

The methodology owes specific debts to Sahlgren 2005 (Random Indexing), Mu, Bhat & Viswanath 2018 (mean-centering for embedding postprocessing), Lenzi 2008 / Geller 2010 / Maul 1994 (textual-evidence consensus on the *āšipūtu* canon), and Hunger 1968 (the colophon-template prototype list the corpus pre-filter is built around).
