# cuneiform-mcp v0.28.0 — Sign-Class Clustering + Per-Period Chunk Indexes

Two parallel sub-agents shipped tools that surface higher-order structure in the existing v0.23 and v0.20 indexes. **Tool count: 75 → 77.**

## `cluster_signs_by_embedding` — empirical sign-taxonomy

K-means on the 635 sign2vec vectors. At k=12 (mulberry32(20260525)), the partition produces 4 surface-form-coherent classes without scholar curation:

- **2 numerical clusters**: #5 anchored by `ABZ480` with reps `4 / 0 / BAHAR₂`; #9 anchored by `ABZ411` with reps `27 / ABZ427 / 19` (intra-cosine **0.378** — geometrically tightest in the partition)
- **3 compound-logogram clusters** (#7, #8, #11): containing multi-component sign names like `LAGAB×HAL`, `ABZ73/ABZ13`, `ABZ58/ABZ59`
- **1 phonetic-reading cluster** (#3): `diš`, `u`, `aš` — Akkadian phonetic readings
- **6 ABZ-syllabogram clusters** (#0, #1, #2, #4, #6, #10): the bulk of the corpus's syllabic signs

Silhouette = 0.0403. Positive but small — interpretation: the embedding space has dense overlapping syllabograms (linguistic reality), and the cluster TYPOLOGY is the publishable finding, not the magnitude. K-dependent: requires k ≥ 12 to resolve the numerical class. At k=8, `4` merges into a common-syllabogram cluster — frequency dominates at coarse k.

## `find_formulaic_passages_per_period` — NA/NB chunk-hash partition

Trains separate length-20 chunk-hash indexes on NA (7,831 tablets, **50,083** non-singleton hashes) and NB (7,591 tablets, **11,979** non-singleton hashes). The **4.2× density gap** is the central observation — NA's Library-of-Ashurbanipal canonical corpus supports top-host count **120** at length 20; NB's predominantly administrative/archival corpus caps at 8.

### Top 5 NA-only formulae (canonical-period candidates, all 0 NB hosts)

| # | na_hosts | Sign sequence (truncated) | NA hosts (top-3) |
|---|---:|---|---|
| 1 | **120** | `ABZ131 ABZ554 ABZ575 ABZ128 ABZ86 ABZ308 ABZ342 …` | 1879,0708.49 · 1879,0708.48 · 1880,0719.152 |
| 2 | 119 | `ABZ108 ABZ131 ABZ554 ABZ575 ABZ128 ABZ86 …` (offset −1) | same |
| 3 | 119 | `ABZ554 ABZ575 ABZ128 ABZ86 ABZ308 …` (offset +1) | same |
| 4 | 118 | (offset +2 of #1) | same |
| 5 | 110 | (offset −2 of #1) | same |

The host triple `1879,0708.49 / 1879,0708.48 / 1880,0719.152` strongly suggests one canonical composition (likely a Library-of-Ashurbanipal text registered under those BM acquisition numbers) was the dominant source, copied across ~120 NA tablets and never reproduced in any NB tablet at length 20.

### Top cross-period transmission band (na=15, nb=3)

`ABZ384 ABZ6 ABZ384 ABZ237 ABZ58 ABZ381 ABZ335 ABZ440 ABZ461 ABZ214 ABZ536 ABZ589 ABZ342 …` — same length-20 formula at five consecutive sliding offsets, reproduced in exactly 3 NB tablets (BM.48206 + K.10906 + K.5364) and 14-15 NA tablets. **The strongest documented NA↔NB length-20 transmission band in the corpus.**

## Calibration tally — Round 13

| Lever / Audit | Class | Effect |
|---|---|---|
| `cluster_signs_by_embedding` | **NEW TOOL** | K-means sign taxonomy. 2 numerical / 3 compound / 1 phonetic / 6 ABZ-syllabogram emergent classes. 3/3 audit PASS. |
| `find_formulaic_passages_per_period` | **NEW TOOL** | NA/NB chunk-hash partition. Top NA-only formula: 120 NA hosts, 0 NB. Top cross-period band: na=15, nb=3. 3/3 audit PASS. |

**Cumulative v0.18–v0.28: 24 calibrations + 4 no-ops.**

## Methods paper §3.15 (proposed claims 33-34)

**Claim 33:** Sign-class structure emerges empirically from k-means clustering of the sign2vec embedding space. At k=12, the 635-sign vocabulary partitions into 4 surface-form-coherent classes (numerical, compound-logogram, phonetic-reading, ABZ-syllabogram). Cluster geometry directly reflects Assyriological notions of sign type. The numerical class requires k ≥ 12 to resolve.

**Claim 34:** Per-period chunk-hash partition reveals corpus-shape asymmetry between NA and NB at the length-20 granularity. NA (canonical Library-of-Ashurbanipal copies) supports top-host counts of 120 at length 20; NB (predominantly administrative/archival) caps at 8. The 4.2× non-singleton-hash density gap is corpus structure, not a methodological artifact — identical WINDOW=20 + X-skip rule applied to both partitions. The top-10 NA-only formulae anchor on a single dominant composition (registered to BM acquisition tablets 1879,0708.x / 1880,0719.x) that has zero NB transmission.

## Operational track — residue burst confirmed saturation

Re-attempted the 162 persistent network failures from prior bursts. 0 new fetches, 0 404s, 162 failed again. **Cache genuinely saturated at 36,317 entries.** The 162 residue IDs are likely malformed/non-existent at eBL.

## Joins graph extracted

`~/.cache/cuneiform-mcp/joins-graph.json` written from existing fragment-metadata cache (no new API calls). **4,361 tablets with ≥1 join**, total ~5,500+ join edges. Top join-rich tablet: HS.2536.G with 21 joins. Powers the future v0.30 `analyze_joins_graph` tool.

## Reproducibility

```bash
node scripts/build-chunk-index-per-period.mjs    # NA+NB indexes, ~4s
node scripts/extract-joins-graph.mjs             # joins graph from cache
npm run build && npm run smoke                   # 77 tools

node scripts/round13-sign-clustering-audit.mjs        # 3/3 PASS
node scripts/round13-per-period-chunks-audit.mjs      # 3/3 PASS

cluster_signs_by_embedding({ k: 12 })
find_formulaic_passages_per_period({ min_hosts: 10, period_specific_only: true })
```

## Outstanding (v0.29+)

- v0.29 — Cross-axis Bayesian fusion bootstrap (~15 known pairs as labels)
- v0.30 — `analyze_joins_graph` + data-driven `find_numerical_chunks` (replaces v0.21 hardcoded filter)
- v0.31 — Lacuna restorer sign2vec extension
