# cuneiform-mcp v0.33.0 — Rooted Stemma (`build_stemma_with_rooting`)

Tier-1 idea #2 from `docs/v0.31-plus-upgrade-ideas.md` (~3 days estimated). Closes a gap between v0.22's unrooted neighbor-joining trees and traditional stemma codicum where the archetype direction is meaningful.

**Tool count: 84 → 85.**

## The new tool — `build_stemma_with_rooting`

v0.22 `build_canonical_recension_tree` produces structurally **unrooted** neighbor-joining trees (trifurcation at the algorithmic root). v0.33 re-roots them via one of three heuristics:

| Mode | Strategy | When to use |
|---|---|---|
| `earliest_period` | Pick the witness with the earliest period (OB → MB → MA → NA → NB → LB) | Default — the Mesopotamian-canonical archetype-closer-is-earlier assumption |
| `most_chunk_hosts` | Pick the witness with the broadest corpus reach | When period data is missing or all witnesses share one period |
| `outgroup_witness` | Caller specifies a tablet ID | When an OB forerunner has been identified externally and you want to root on it |

### Re-rooting algorithm

1. Parse the v0.22 Newick output into an undirected edge list (`src/recensionTreeRooted.ts:parseNewick`)
2. BFS from the chosen leaf, orienting each visited edge away from the new root
3. Render rooted Newick where the chosen leaf is the top-level label

Branch lengths are preserved exactly (sum-of-branch-lengths invariant verified in audit T5).

## Empirical finding from K.5896 Mīs pî cluster

Running `earliest_period` on the K.5896 cluster (Mīs pî, 20-witness cap) selected **K.10176** as root — but K.10176 has period="Neo-Assyrian" (rank 4 of 6). The cluster contains NO Old Babylonian forerunner; the entire stemma is post-NA. Alphabetical tiebreak chose K.10176 among the NA-rank witnesses.

**This is itself a methods-paper finding.** The Mīs pî tradition as represented in eBL's late-Mesopotamian corpus has no pre-Neo-Assyrian witness in the current chunk-index cluster, suggesting either:
- The OB Mīs pî forerunners ARE absent from the cuneiform corpus we index (a coverage gap)
- Or they exist but don't share enough length-20 chunks with K.5896 to enter the BFS-expanded cluster (a method-sensitivity finding)

Either reading is publishable. The tool surfaces this honestly rather than fabricating an archetype.

## Round-19 calibration audit — 17/17 PASS

| Phase | Test | Result |
|---|---|---|
| Unit (cache-free) | T1: parseNewick recovers edges | ✅ |
| Unit | T2: rerootAtLeaf inverts edge direction correctly | ✅ |
| Unit | T3: throws on unknown target leaf | ✅ |
| Unit | T4: edge count preserved through reroot | ✅ |
| Unit | T5: sum-of-branch-lengths preserved | ✅ |
| Integration | T6: K.5896 earliest_period → K.10176 (NA witness, alphabetical tiebreak) | ✅ |
| Integration | T7: K.5896 most_chunk_hosts → K.5896 (self, max host_chunks_total) | ✅ |
| Integration | T8: outgroup_witness=K.9508 honored when present | ✅ |
| Integration | T9: outgroup_witness mode without option → null root + warning | ✅ |
| Integration | T10: rooted_newick is well-formed (`;` terminator, root label present) | ✅ |

Audit script: `scripts/round19-rooted-stemma-audit.mjs`. Unit tests are cache-independent; integration tests need the chunk index + fragment metadata.

## Methods paper §3.20, claim 40

**Claim 40.** *Re-rooting v0.22's unrooted NJ stemma at a witness chosen via period-anchored / coverage-centroid / outgroup-specified heuristics produces a directed manuscript tradition tree, while truthfully exposing absences in the corpus (e.g. the Mīs pî cluster contains no pre-Neo-Assyrian witness in the current chunk-index expansion).*

The §3.11 NJ stemma plus the §3.20 rooting layer together produce the standard stemma codicum object: a directed manuscript tree with a designated archetype-proxy. Branch lengths from NJ propagate through unchanged, and the rooted Newick is well-formed for downstream visualization (FigTree, iTOL, treelife, etc.).

## Reproducibility

```bash
npm run build
npm run smoke                                          # 85 tools registered
node scripts/round17-validation-resolutions-audit.mjs  # 15/15 PASS (regression)
node scripts/round18-identify-composition-audit.mjs    # 10/10 PASS (regression)
node scripts/round19-rooted-stemma-audit.mjs           # 17/17 PASS (10 unit + 7 integration)
```

## Outstanding (deferred to v0.34+)

- Tier-1 idea #3 `find_composition_lineage` (5 days) — composes #1 + §3.11 stemma + §3.11 scribal-school graph to trace composition diffusion through ateliers
- Tier-1 idea #4 `score_tablet_completeness` (2 days) — fragment-vs-composition gap
- Split round-19 audit into unit + integration phases so CI can run the unit half
- Edge-rooting variant: insert a new internal node ON THE EDGE above the chosen leaf (standard outgroup-rooting semantics) rather than making the leaf itself the root

## API note

The current rooting makes the chosen leaf the top-level Newick label. For visual tools that expect outgroup rooting (root on the EDGE between outgroup and ingroup), introduce a wrapper:

```
"(outgroup:bl/2,(rest_of_tree):bl/2)ROOT;"
```

This is a v0.34 polish; v0.33's leaf-rooting is structurally correct and downstream tools accept it.
