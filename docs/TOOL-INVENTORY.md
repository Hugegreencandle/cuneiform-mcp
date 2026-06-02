# cuneiform-mcp — Tool Inventory

Auto-generated from `src/index.ts` via `scripts/generate-tool-inventory.mjs`. Last regenerated 2026-06-02 against v0.78.0.

**Total tools: 115**

## `lookup_sign`

Look up a cuneiform sign by name. Returns Borger ABZ + MZL + LAK + HZL + KWU + OBZL + SLLHA cross-refs, the cuneiform glyph, phonetic sound values, and known logograms. Source: OGSL Labasi (239 curated signs, fast) with fall-through to eBL /api/signs (full canonical sign record).

## `search_tablets`

Search the CDLI artifact catalog (~350K tablets) by keyword, publication, transliteration, period, etc. Returns CDLI integer ID + P/Q-number + designation + museum no + period + provenience.

## `get_tablet`

Fetch full CDLI artifact record — metadata (designation, museum, period, languages, publications) plus the ATF transliteration when one has been entered. Accepts either the CDLI integer DB id (e.g. '469670') or a P/Q-number (e.g. 'P237754', 'Q000364').

## `search_oracc`

Full-text search within one ORACC project. Returns matched text IDs, canonical citations, and snippets with the hit term marked **like this**.

## `get_oracc_text`

Fetch one ORACC edition (transliteration + English translation) from the UPenn ORACC mirror's TEI XML.

## `search_fragments`

Search the eBL fragment catalog (~21,200 fragments) by museum number or transliteration. Returns museum numbers + matching line numbers; call get_fragment for full details.

## `get_fragment`

Fetch full eBL fragment record by museum number — publication, description, script, joins, transliteration, references.

## `find_join_candidates`

Rank eBL fragments by line-structure fingerprint similarity to a target — surfaces parallel manuscripts of the same composition, structurally similar bilinguals, AND possible physical joins (not all hits are joins). Reproduces eBL's /match algorithm locally (lineToVec prefix/suffix overlap, no Auth0…

## `find_parallel_text`

Rank fragments by sign-sequence parallel-text similarity to a target (within-line trigram Jaccard over eBL's `signs` field). Validation 2026-05-14 (combined N=151 across two seeds, 267 known siblings): ~22% recall@15 on known eBL joins, 95% CI [17%, 28%] — ~6.5× the lineToVec-based `find_join_candid…

## `compare_flood_narratives`

Return an episode × witness alignment matrix for the four major Ancient Near Eastern flood narratives: Sumerian Ziusudra story (Nippur OB), Akkadian Atra-ḫasīs (Lambert & Millard 1969), Gilgamesh Tablet XI (George 2003), Hebrew Genesis 6-9 (BHS/MT). Episodes drawn from a controlled vocabulary: creat…

## `find_antediluvian_parallel`

Take a passage from a Jewish/Christian antediluvian-wisdom text (1 Enoch / Jubilees / Genesis 5-6 / Wisdom of Solomon / Ben Sira) and return ranked Mesopotamian source-candidates that comparative-religion scholarship has identified as parallels. Each result names the scholar(s) who established the p…

## `apkallu_attestations`

Surface named occurrences of the seven antediluvian apkallū (and four postdiluvian successor ummânū) across the cuneiform and Hellenistic textual record. Per-sage entries include: paired antediluvian king (Uruk List of Kings and Sages), discipline specialization where attested, attestations across s…

## `discover_parallel_candidates`

Return machine-discovered comparative-religion parallel candidates from the cuneiform-mcp curated corpus, with full provenance trace. The v0.7 Discovery Engine: inverts the v0.6 discipline by RETURNING parallels WITHOUT named scholarly attribution — each candidate carries `discovered_by: 'ai_travers…

## `find_mesopotamian_parallel`

Return curated cross-Mesopotamian-internal parallels (Sumerian↔Akkadian, Akkadian↔Ugaritic, Hurrian↔Akkadian, Akkadian↔Akkadian, etc.) WITHOUT requiring a Jewish/Christian biblical passage as the entry-point. Sibling to v0.6's find_antediluvian_parallel — same named-scholarship discipline (scholarly…

## `discover_primary_source_parallels`

Return primary-source cuneiform-corpus parallel candidates discovered by the v0.13 Discovery Engine v2.0 sign-trigram Jaccard traversal. Sibling to v0.7's discover_parallel_candidates but targets primary sources (eBL/CDLI/ORACC ~36K tablets) rather than secondary literature. Each candidate carries d…

## `query_research`

Semantic-keyword search over the cuneiform-research vault — ~50 Mesopotamian scholarly briefs (cosmology, theology, royal myth, divination/science, reception, monuments). BM25 retrieval over section-chunked markdown. Each hit returns the chunk text, brief name, section heading, scholarly citations (…

## `get_brief`

Retrieve a specific research brief from the cuneiform-research vault by name. Returns paginated chunks (5 chunks per page) with section headings, citation lists, and synthesis-claim flags. Filenames are case-insensitive and the .md suffix is tolerated. Examples: 'Adapa', 'Royal_Descents', 'Tablet_of…

## `list_briefs`

Enumerate briefs in the cuneiform-research vault, optionally filtered by topical cluster. Returns per-brief summaries: name, cluster, section count, chunk count, total chars, unique scholarly citation count, and whether the brief contains [my synthesis] claims. Use this to discover what's in the vau…

## `find_synthesis_claims`

Find all `[my synthesis]` / `[unverified]` / `[Cluster synthesis — my reading]` flagged paragraphs across the cuneiform-research vault. These are the novel interpretive claims the brief author has explicitly marked as their own synthesis (vs. scholarly consensus) — the structural readings worth defe…

## `infer_damaged_sign`

For each `X` damaged-position token in an eBL transliteration, suggest the most-probable sign based on bigram context across the 36,498-tablet sign corpus. Scoring: geometric mean of P(sign | prev_sign) × P(sign | next_sign) with Laplace smoothing, plus optional period/genre conditioning from the v0…

## `find_biblical_parallel`

Find Mesopotamian textual parallels to a Hebrew Bible passage, theme, or Mesopotamian source. Returns canonical scholarly parallels from a curated dataset (15 parallels staged 2026-05-16) with named-Assyriologist attribution, transmission hypothesis, shared narrative elements, and pointers to the re…

## `find_thematic_parallel`

Find tablets thematically similar to a given tablet using Random-Indexing distributional embeddings over the eBL sign corpus. Unlike `discover_primary_source_parallels` (lexical/trigram-Jaccard) and `find_parallel_text` (line-level n-gram), this tool surfaces siblings that share zero exact trigrams …

## `find_anomalous_tablets`

Surface tablets that don't fit anywhere — candidates for previously-unknown compositions, miscatalogued fragments, or rare witnesses of poorly-attested texts. Joins the corpus-viz lexical-graph (trigram-Jaccard ≥ 0.30) with the v0.15 thematic-embedding index (cosine ≥ 0.5) + tabletMetadata + v0.14.4…

## `describe_anomaly`

For a specific tablet, return a structured anomaly report: lexical + thematic neighbor counts, lexical-cluster membership + dominants, anomaly-flag evaluation across all v0.16 criteria, human-readable reasons, and ordered follow-up steps. Use after `find_anomalous_tablets` to drill into a specific c…

## `discovery_surface_stats`

Top-level stats on the v0.16 discovery surface: how many tablets are in each index, how many are lexical singletons, how many are thematic orphans, how many are bi-orphans, and bi-orphan counts bucketed by sign length. Useful for tracking how the discovery surface evolves as the exclusion list + thr…

## `find_fuzzy_parallels`

Find parallel tablets to a given tablet via fuzzy (1-substitution) trigram matching. Two trigrams match fuzzily if exactly 2 of 3 positions are equal — this catches manuscript siblings whose lexical-trigram-Jaccard is too low because of localized sign-form variants (e.g., the K.2798 ↔ Si.776 pair wh…

## `find_embedded_fragments`

Find LARGER HOST tablets that an Archetype-5 small fragment is embedded in, via asymmetric trigram containment (fuzzy_intersect / |query_trigrams|, NOT symmetric Jaccard). Motivation: the 2026-05-23 cluster typology found K.9508 (small Mīs pî fragment) returns ZERO strong fuzzy neighbors when probed…

## `find_chunk_parallels`

Surface contiguous shared-sign chunks (≥ min_chunk_len trigram positions) between a source tablet and every host tablet in the corpus, as a PRIMARY OBJECT — chunk_start + chunk_length + host_tablets[] + cross-genre/cross-period attribution + novelty score. v0.18.19's find_embedded_fragments returns …

## `find_formulaic_passages`

Corpus-wide enumeration of formulaic passages: every length-20 trigram window shared with ≥ min_hosts tablets, ranked by host_genres_spanned × log(host_count). Backbone is the v0.20 chunk-hash index (~/.cache/cuneiform-mcp/chunk-index.json, built once via scripts/build-chunk-index.mjs). v0.19's find…

## `trace_chunk_diffusion`

Per-chunk chronological diffusion: given a chunk (by hash, or by source tablet + which chunk to pick), return its hosts grouped by period and ordered chronologically. The diffusion array is the corpus-level transmission map for a single passage. Validation case: a canonical KAR-44 incipit chunk shou…

## `build_citation_graph`

Corpus-level commentary→base quotation graph derived from the v0.20.0 chunk-hash index. For every chunk, partitions occurrences into commentary-genre hosts vs. base-text hosts (by primary-genre substring match against commentary_genres); each (commentary, base) pair earns one edge credit per shared …

## `find_incipits`

Surface short opening formulae (incipits) — length-10 trigram windows reproduced across many tablets — from the v0.21.0 incipits-index. Complements v0.20.0 find_formulaic_passages (length-20 windows for substantive passages). Length-10 catches the 3-8 sign canonical openings that scholars use to ide…

## `prioritize_validation_queue`

Active-learning ranker for the manual-review backlog. Scores candidate tablets (bi-orphans from find_anomalous_tablets, isolate compositions, chunk-discovery surfaces) by information-gain-from-manual-review. Rewards: chunk-host count (log-scaled), bi-orphan status (lex+thematic isolation is rarer th…

## `build_canonical_recension_tree`

Automated stemma (textual-family-tree) reconstruction. Given a seed manuscript of a composition (e.g. K.5896 for Mīs pî), enumerate its chunk-related witnesses from the v0.20.0 chunk-hash index, compute a pairwise distance matrix from shared-chunk overlap, and produce a phylogenetic tree via neighbo…

## `build_scribal_school_graph`

Empirically reconstruct scribal schools by joint clustering on (scribal orthographic signature + provenance / find-spot). Connected-components on a thresholded scribal-cosine graph, restricted to same-provenance edges (or same-collection as fallback when eBL provenance.site is null). Each component …

## `find_similar_signs`

Find the nearest-neighbor signs of a query sign in the v0.23.0 sign2vec embedding space. Embeddings are learned from corpus co-occurrence via PPMI + truncated SVD (Levy & Goldberg 2014, Halko–Martinsson–Tropp 2011 randomized SVD), L2-normalized so cosine similarity is dot product. ~635 signs indexed…

## `compute_lexical_substitution_score`

Pair-level lexical-substitution score derived from the v0.23.0 sign2vec embedding. For tablet pair (A, B): exact-vocabulary overlap PLUS sign2vec-substitution matches (signs in A whose top-K sign2vec neighbors appear in B's vocabulary), divided by max(|A_vocab|, |B_vocab|). The methods-paper §3.13 c…

## `compare_sign_embedding_configs`

Compare sign2vec neighbor lists across 6 hyperparameter configurations: WINDOW ∈ {2, 5, 10} × MIN_OCCURRENCES ∈ {10, 20}. Surfaces (a) consensus signals (signs appearing in top-5 across all configs — robust nearest neighbors), (b) config-unique signals (revealing what each hyperparameter setting cap…

## `compute_lexical_substitution_lift`

Baseline-normalized variant of v0.24 compute_lexical_substitution_score. Addresses the high-frequency sign-core saturation effect documented in RELEASE-v0.24.md by subtracting a corpus-wide expected baseline at the matching vocabulary-size bucket. Returns lift_z_score = (raw - baseline_mean) / basel…

## `compare_sign_neighbors_across_periods`

Compare a sign's top-K sign2vec neighbors trained separately on Neo-Assyrian vs Neo-Babylonian sub-corpora. v0.26.0 build trained PPMI+SVD on NA (14,193 tablets, 435 signs) and NB (10,861 tablets, 452 signs) with 387 signs in common. Surfaces (a) common_neighbors — signs in top-K of both periods (th…

## `recommend_archetype_thresholds`

Per-archetype calibration matrix for the 7 cluster archetypes documented in methods paper §3.8. Different archetypes have different precision/recall optima across all tools — a verbatim manuscript chain wants min_fuzzy_J ≈ 0.35 while a compositional curriculum wants ≈ 0.08, an order of magnitude dif…

## `compare_sign_neighbors_register_matched`

Compare a sign's top-K sign2vec neighbors trained on REGISTER-MATCHED (period, genre) sub-corpora to isolate the diachronic axis from the register confound that v0.26 flagged. v0.27 trains 6 separate embeddings: (divination, magic, literature) × (NA, NB). EMPIRICAL FINDING: matched-register mean top…

## `cluster_signs_by_embedding`

K-means clustering on the v0.23 sign2vec embedding space. Surfaces empirical sign-type structure without scholar curation. EMPIRICAL FINDING at k=12 over the 635-sign vocabulary: the partition produces 4 surface-form-coherent classes — 2 numerical clusters (one anchored by ABZ480 with `4`/`0`/BAHAR₂…

## `find_formulaic_passages_per_period`

v0.20 find_formulaic_passages partitioned by script.period. Trains separate length-20 chunk-hash indexes on NA (7,831 tablets, 50,083 non-singleton hashes) and NB (7,591 tablets, 11,979 non-singleton hashes). The 4.2× NA/NB density gap is the central observation — NA's Library-of-Ashurbanipal canoni…

## `compute_joint_pair_score`

v1.0-readiness bootstrap: logistic regression on the 5-axis feature vector (lex_jaccard, fuzzy_jaccard, thematic_cosine, scribal_cosine, substitution_lift_z) trained on 12 labeled positives + 40 synthetic negatives from the methods paper. Training accuracy 98.1% (51/52). Returns P(positive) + per-fe…

## `explain_pair_score`

Full provenance trace for any pairwise verdict. Returns the per-axis raw signals (lex_jaccard / fuzzy_jaccard / thematic_cosine / scribal_cosine / substitution_lift_z / composition_assignment_match) from compareTabletPair, the joint-pair model's per-feature additive decomposition (raw → z-standardiz…

## `auto_validate_from_resolutions`

PROPOSAL-ONLY MODE. Replays prioritize_validation_queue candidates against external-anchor rules sourced ONLY from the methods paper (§3.6 final-1 bi-orphan IM.49220 → negatives; §3.7.3 K.5896 ↔ K.6683 → positive; §3.11 BM.47463 ↔ CBS.6060 → positive). v0.71 adds opt-in RULE_D (composition-sibling p…

## `cdli_ebl_crosswalk`

Bidirectional CDLI ↔ eBL ID crosswalk. Accepts a CDLI P-number ('P396240'), bare CDLI integer id ('396240'), or eBL museum number ('K.5896', 'BM 47463', 'Ki.1904-10-9.78'). Auto-detects the input type, normalizes museum numbers (space → dot; leading zeros stripped; internal dashes preserved for date…

## `detect_bilingual_tablet`

Live single-tablet Sumerian/Akkadian bilingual classifier. Hits eBL /fragments/{museum_number} directly (no cache dependency) and walks text.lines[].content[] per-Word language tags. The load-bearing discriminator is per-Word .language: eBL's lemmatizer correctly tags a sumerogram (EN₂ → šiptu, MUŠE…

## `find_bilingual_tablets`

Cache-backed corpus-wide bilingual tablet surface. Reads ~/.cache/cuneiform-mcp/bilingual-index.json (built by scripts/build-bilingual-index.mjs) and returns ranked Sumerian/Akkadian bilingual candidates by composite confidence (threshold-gap × token-share-balance). The cache builder pre-filters the…

## `diff_corpus_versions`

Read-only delta between two content-hash manifests of ~/.cache/cuneiform-mcp/. Manifests are produced by scripts/snapshot-cache.mjs (walks the cache dir, computes SHA-256 per file). Returns added/removed/changed file lists + summary (file counts, signed bytes_delta). The diff tool itself NEVER write…

## `export_session`

Snapshot the in-process session ring buffer to ~/.cache/cuneiform-mcp/sessions/<iso-ts>.{json,md}. Every tool call's structuredContent envelope is captured automatically (capped at 200 envelopes per session by default, configurable via CUNEIFORM_MCP_SESSION_BUFFER). Returns the snapshot paths + enve…

## `analyze_joins_graph`

Corpus-wide manuscript-join graph analysis. Two modes: (a) per-tablet — given a tablet, return its direct-join neighborhood resolved to tablet IDs + period + genre; (b) top-hosts — return top-K join-rich tablets corpus-wide. EMPIRICAL: 4,361 fragments have ≥1 join, 17,203 total join edges, top join-…

## `find_numerical_chunks`

Data-driven numerical-context chunk detection using the v0.28 sign2vec k-means clustering. Replaces v0.21 find_incipits' hardcoded {ABZ480, ABZ411} numerical filter with a 112-sign empirically-derived numerical-sign-set drawn from sign2vec clusters #5 + #9. Surfaces chunks whose signs are ≥50% numer…

## `restore_lacuna_semantic`

Single-position lacuna restoration using a joint score combining (a) the v0.18.0 bigram-context heuristic and (b) the v0.23 sign2vec semantic prior derived from the surrounding visible signs. α∈[0,1] interpolates: α=1 = pure bigram (v0.18.0 baseline), α=0 = pure sign2vec semantic, α=0.5 = balanced (…

## `record_validation_resolution`

Persist a human-confirmed verdict (positive / negative / uncertain) on a tablet pair. Closes one of the v1.0 readiness gates: grows the labeled-pair set from n=12 (methods-paper hardcoded positives in scripts/train-joint-pair-model.mjs) toward the ≥100-positive production threshold for v0.29 Bayesia…

## `list_validation_resolutions`

Read companion to record_validation_resolution. Returns persisted verdicts from ~/.cache/cuneiform-mcp/validation-resolutions.json sorted most-recent first, with optional filtering by verdict / source / tablet / since. Use this to audit the feedback loop, generate a positives list for the next Bayes…

## `identify_composition`

Composition assignment for a query tablet. Returns ranked candidate compositions (Mīs pî, Šurpu, Udug-ḫul, Bīt salāʾ mê, āšipūtu curriculum, ...) from the methods-paper-anchored registry, scored on a joint of (a) chunk-overlap with each composition's exemplar pool (length-20 chunk-hash index, §3.10)…

## `build_stemma_with_rooting`

Extends v0.22 `build_canonical_recension_tree` (which produces UNROOTED neighbor-joining trees with a trifurcation at the algorithmic root) by re-rooting the stemma at a witness chosen via one of three heuristics: 'earliest_period' (Mesopotamian-canonical OB→MB→MA→NA→NB→LB ordering — earlier periods…

## `score_tablet_completeness`

Given a fragment, estimate what fraction of the original composition is preserved. Two complementary metrics: (1) sign_count_ratio = query.sign_count / largest_exemplar.sign_count, capped at 1.0 — a size-proxy for how much physical text survives; (2) chunk_coverage_ratio = |query_chunks ∩ compositio…

## `find_composition_lineage`

Trace a composition's transmission across periods and ateliers. Composes v0.20 chunk index + v0.22 stemma-BFS + v0.32 composition registry + fragment metadata (period + provenance). Given a composition (composition_id or seed_tablet_id), expand the witness cluster, bucket witnesses by (period × prov…

## `damaged_passage_composition_probability`

Probabilistic composition classifier for damaged passages. Accepts a raw signs string (e.g. paste a hand-transliteration) OR a corpus-resident tablet_id; computes joint sign2vec-centroid (v0.23) + canonical-chunk-overlap (v0.20) score against the v0.32 composition registry; emits softmax probability…

## `list_compositions`

Return the full v0.32+ composition registry as a structured payload, including registry version, license, persistent URIs, print_editions, external_ids (eBL/OGSL/CAD), and exemplar_tablets per composition. Per panel-review §3.24, the registry is now a separately-citable artifact (data/compositions-v…

## `render_stemma_svg`

Render a Newick stemma string (typically from v0.33 build_stemma_with_rooting or v0.22 build_canonical_recension_tree) as a self-contained SVG suitable for direct embedding in HTML/Markdown or saving to a .svg file. Cladogram-style layout: horizontal branches, branch-length-proportional x-positions,…

## `get_tablet_image_links`

Return the eBL fragmentarium landing URL + photo URLs + ancient find-spot for a tablet. Two photo URLs are returned: `ebl_photo_url` is the HUMAN SPA viewer route (.../fragmentarium/{id}/photo — opens an HTML page, 302-redirects, NOT directly fetchable as an image), and `ebl_photo_api_url` is the FE…

## `fetch_tablet_photo`

Fetch + cache a FULL-RES eBL tablet photo (JPEG) to local disk and return its path. Resolves the FETCHABLE eBL REST endpoint (https://www.ebl.lmu.de/api/fragments/{id}/photo — serves raw image/jpeg; distinct from the SPA viewer route which only 302-redirects to an HTML page), downloads it, and cache…

## `align_sign_prototype`

ProtoSnap per-sign prototype ALIGNMENT — NOT sign detection. Given a PRE-CROPPED, ALREADY-IDENTIFIED single-sign image (you supply BOTH the crop path AND the sign's known identity), snap a prototype skeleton of that sign onto the crop and return a match score + aligned-skeleton path. It does NOT det…

## `compute_confidence_calibration`

Compute a reliability-diagram + Brier score + Expected Calibration Error (ECE) + Maximum Calibration Error (MCE) from labeled (predicted_probability, correct) pairs. Per panel-review §3.24 / Lindqvist: when a tool says p=0.989, is the true accuracy at that confidence bin actually ~99%? This tool mea…

## `find_sign_glyph`

Convert ABZ codes (e.g. ABZ480) to Unicode cuneiform glyphs (e.g. 𒋮). Accepts either a signs string (space-separated tokens; X/x/? treated as damage) or an array of bare ABZ codes. Resolves ABZ-prefixed tokens via a cached OGSL Labasi ∩ eBL /signs join (cache at ~/.cache/cuneiform-mcp/abz-glyph-map…

## `extract_citation_network`

Mine the scholarly-citation network from data/biblicalParallels.json + data/mesopotamianParallels.json. Builds nodes (scholars parsed from scholarly_attribution[]; parallels) and co-citation edges (two scholars cited in same parallel). Returns ranked scholars by parallels-supported, top co-citation …

## `compute_quotation_network`

Builds a corpus-wide DIRECTED MULTIGRAPH at the COMPOSITION level (Mīs pî / Šurpu / Maqlû / Udug-ḫul / Bīt salāʾ mê / EAE / Šumma ālu / Šumma izbu / Bārûtu / Diri-Aa / āšipūtu curriculum) by aggregating two evidence streams: (1) build_citation_graph commentary→base tablet edges (v0.20), each tablet …

## `discover_compositions`

Unsupervised cluster discovery over the v0.15 Random-Indexing tablet embeddings (~28K tablets × 300-dim, unit-normalized). Deliberately avoids using any genre labels or exemplar registries as a prior — every OTHER composition-surfacing tool in cuneiform-mcp uses the registry as a prior, this one ask…

## `find_lemma_parallel`

Lemma-aware textual parallel finder. Complementary to v0.18 sign-trigram retrieval: where trigrams measure orthographic reuse (same signs, same order), lemmas measure lexical reuse (same underlying Akkadian/Sumerian words, irrespective of writing variant). Uses Jaccard over lemma sets extracted from…

## `find_provenance_clusters`

Cluster tablets by ANCIENT find-spot rather than modern museum collection. With v0.45's collection-fallback, getAncientFindSpot returns a populated string for every metadata-present tablet (Kuyunjik / British Museum / Sippar / Nineveh / ...). This tool groups them and reports per-cluster (a) tablet …

## `cluster_by_scribal_provenance`

Cluster tablets by shared first_copy_event (earliest manuscript witness) or first_citation_target (first commentary citing the tablet). Optionally classify a specific pair via tablet_id_a + tablet_id_b. Port of wallet-fingerprint v0.7's funded_by / first_out_to two-tier methodology back to cuneiform…

## `compute_axis_disagreement`

Cross-axis composition-classification audit. Runs identify_composition (sign-trigram + sign2vec centroid + chunk-overlap) AND find_lemma_parallel (lemma-Jaccard, second-hop composition inference via the top neighbor) on the same tablet and reports agreement. Output classes: 'agree' = both axes retur…

## `recalibrate_lacuna_scores`

Fit Platt-scaling logistic regression on ~/.cache/cuneiform-mcp/lacuna-bleu-calibration-samples.json (produced by scripts/benchmark-lacuna-bleu.mjs) and report ECE before/after recalibration. Closes the §3.25 overconfidence finding (joint_score is a ranking signal, not P(correct)): the v0.40 benchma…

## `recommend_validation_target`

Active-learning prioritizer: closes the v0.31 validation-resolutions loop. Builds a candidate pool from chunk-index co-host pairs, ranks by chunk-overlap percentile, returns pairs in the MID-band (~50th percentile) as the highest-information-gain labeling targets. Theory: pairs with very high chunk-…

## `list_candidate_exemplars`

Surface discovered candidate exemplars from the v0.54 composition-assignments cache (~/.cache/cuneiform-mcp/composition-assignments.json, built by scripts/build-corpus-composition-assignments.mjs). Each candidate is a tablet that v0.32 identify_composition classified at p ≥ min_confidence to a regis…

## `reconstruct_cluster`

Given a seed tablet, reconstruct the full manuscript-witness cluster by recursively expanding via fuzzy trigram-Jaccard (1-substitution) parallels. Each BFS frontier member's top-K fuzzy parallels are probed; new tablets join the cluster until depth/size caps or frontier exhaustion. Output includes …

## `find_isolate_compositions`

Surface SUBSTANTIAL tablets (high sign_count) that have FEW fuzzy parallels in the corpus — compositions NOT well-represented by multiple witnesses. Candidates for: (a) unique surviving compositions of historical significance, (b) compositions scholars have studied as singletons, (c) the 'we have on…

## `find_signature_evolution_in_lineage`

Walk a multi-axis lineage chain (using the v0.18.16 find_lineage_chain primitive) and overlay per-hop scribal-signature drift on every parent→child edge. For every member: sig_cosine_to_seed + sig_cosine_to_parent. Surfaces signature_jumps[] — parent→child hops where cosine drops below jump_threshol…

## `extend_dataset_to_motif`

Generalize per-tablet motif discovery to ARBITRARY caller-specified motifs. Given a motif name + 1-20 seed tablet IDs, expand transitively via BOTH discovery axes (fuzzy trigram-Jaccard + Random-Indexing thematic cosine) and build a structured corpus dataset attesting that motif. Cross-axis-confirme…

## `find_join_candidates_in_prefix`

Within a museum-collection prefix bucket (e.g. K, BM, Sm, IM, CBS), systematically surface physical-JOIN candidate pairs — tablets that may be fragments of one originally-whole tablet broken into multiple pieces and re-cataloged separately. The join-axis mirror of find_strongest_fuzzy_pairs_in_prefi…

## `find_lineage_chain`

Given a seed tablet, walk an ALTERNATING multi-axis BFS chain (e.g. fuzzy → scribal → fuzzy → scribal → ...) up to N hops, surfacing transitive scholarly-lineage paths. Differs from `reconstruct_cluster` (which expands the seed's neighborhood via ONE axis — fuzzy trigram-Jaccard) by SWITCHING the ex…

## `find_high_join_count_tablets`

High-join-count tablet discovery — surface tablets in the corpus with the most known physical joins (per eBL fragment-metadata `joins_count`). These are the 'champion fragments' / substantially reconstructed original tablets (e.g. K.5896's 13-tablet join group from the BM.77056 *āšipūtu* cluster). U…

## `compare_prefix_pair`

Compare two museum-collection prefixes (e.g. 'K' vs 'Sm', 'BM' vs 'IM') and surface their structural relationship — corpus coverage, period / genre / city overlap, and the top same-scribe edges crossing the pair. Returns: cohort_a + cohort_b (tablet_count, total_sign_count, in_lex_graph, in_them_ind…

## `find_genre_anchor_tablets_in_prefix`

Within a (prefix, genre) cohort, surface the 'anchor tablets' — the largest, most-connected witnesses that other fragments in the cohort point to via fuzzy parallels. These are the canonical-template candidates: surviving witnesses other tablets are likely copies of, derived from, or paraphrases aga…

## `find_tablets_by_provenance`

Provenance-based corpus discovery — return all tablets from a given historical site (e.g. 'Sippar', 'Nineveh', 'Nippur', 'Babylon', 'Uruk', 'Susa', 'Mari', 'Lagash', 'Ur'), optionally narrowed by period and/or museum prefix. Matches via case-insensitive substring with whitespace/punctuation normaliz…

## `find_unpublished_in_publication`

Surface tablets cataloged in a specific museum publication (e.g. CT, KAR, BAM, OECT, CTN, AOAT) that have NOT yet been entered into the eBL transliteration pipeline — i.e. the publication editorially knows the tablet (hand-copy / photograph exists in the volume) but its sign-content is absent from t…

## `compare_dialects`

Within a city + period cohort (e.g. Sippar tablets from the Neo-Babylonian period), surface tablets whose scribal-signature LLR profile is FURTHEST from the cohort centroid. The historical-provenance analogue of v0.18.10 find_orthographic_outliers_in_prefix — that tool buckets tablets by museum-coll…

## `find_tablets_by_genre`

Genre-based corpus discovery — return all tablets matching a genre pattern (e.g. 'Mīs pî', 'Šuʾila', 'Bīt rimki', 'Maqlû', 'Šurpu', 'Udug-ḫul', 'Lamashtu', 'Namburbî'), optionally narrowed to a museum prefix. Matches via case-insensitive substring against both the full hierarchy strings (genres[]) a…

## `enrich_prefix_metadata`

Backfill the fragment-metadata cache for a museum-collection prefix by batched eBL API calls. Closes the v0.18.4-v0.18.12 'distributions surface (unknown)' gap: the anomaly-index has period/genre/city/designation fields NULL for ALL 36,476 tablets, so coverage_stats_for_collection couldn't actually …

## `fragment_metadata_coverage`

Read-only diagnostic: how many tablets currently have enriched fragment-metadata cached vs not. Returns the total cache entries, count with real metadata, count cached as null (404s), and the cache file path. Use to decide whether to invoke enrich_prefix_metadata before running coverage_stats_for_co…

## `find_tablet_neighborhood`

Given ONE tablet, return its full 4-axis discovery neighborhood in a single call: fuzzy parallels (composition siblings, 1-sub trigram-J) + thematic neighbors (RI embedding cosine) + scribal candidates (LLR-signature cosine, same-scribe lineage) + join candidates (deferred to find_join_candidates — …

## `find_lacuna_restoration_candidates`

Surface the highest-value backlog for the v0.18.0 restore_lacuna_passage tool: tablets where restoration is BOTH needed (high X-token damage ratio, indicating missing/broken signs) AND possible (strong fuzzy parallels exist, so the restorer has templates from which to predict the missing signs). The…

## `find_thematic_cluster_in_prefix`

Within a museum-collection prefix bucket (e.g. K, BM, Sm, CBS, VAT), surface thematic neighborhoods — groups of tablets that are semantically similar via embedding cosine, even when lexical similarity is low. The thematic-axis analogue of find_scribal_groups (v0.18.9, same-scribe groups) and find_st…

## `compare_clusters`

Compare two clusters (each defined EITHER by a seed_tablet_id OR an explicit cluster_members list) and surface whether they're the same composition, distinct compositions, or topology-adjacent neighbors. Computes: shared / A-unique / B-unique membership sets, Jaccard similarity, per-prefix distribut…

## `find_strongest_fuzzy_pairs_in_prefix`

Within a museum-collection prefix bucket (e.g. K, BM, Sm, CBS, VAT), surface the top-N strongest fuzzy-Jaccard edges between any pair of tablets in that bucket. The per-collection generalization of find_fuzzy_parallels (v0.17.0) — instead of asking 'what's most similar to THIS tablet?', asks 'within…

## `corpus_health_report`

One-call corpus-level meta-diagnostic. Returns the 'system health' snapshot for the cuneiform-mcp pipeline: total tablet count, lex-graph / thematic-index coverage, distinct prefix count + top-10 by tablet count + top-5 by total sign count, corpus-wide sign-count distribution (mean/median/total), sh…

## `audit_cluster`

Composite quality + topology + provenance audit for a cluster — one-call replacement for the manual reconstruct_cluster → find_short_fragments → cluster_pair_similarity_matrix → per-prefix-coverage workflow. Accepts EITHER a seed_tablet_id (triggers an internal reconstruct_cluster with defaults max_…

## `find_orthographic_outliers_in_prefix`

Within a museum-collection prefix bucket (e.g. K, BM, Sm, CBS, VAT), surface tablets whose scribal-signature LLR profile is FURTHEST from the cohort centroid. Complements find_scribal_groups (v0.18.9): that tool finds tight same-scribe clusters; this one finds the LONERS — tablets with anomalous scr…

## `find_cross_prefix_scribal_links`

Surfaces same-scribe edges that CROSS museum-collection boundaries (e.g. BM↔K, BM↔Sm, K↔CBS) — complementary to v0.18.9 find_scribal_groups (which finds within-prefix groups via union-find). Research value: (a) scribal-school networks that transcend single excavation sites, (b) ancient manuscript-tr…

## `find_scribal_groups`

Corpus-wide same-scribe scribal-lineage group discovery — generalizes the per-tablet find_same_scribe_candidates (v0.18.0) to systematic group surfacing. Asks 'what scribal-lineage groups exist within prefix X?' instead of 'who copied this specific tablet?'. Returns all mutually-reciprocal same-scri…

## `compare_tablet_pair`

Given two museum numbers, return the full cross-axis similarity (lexical exact-J, fuzzy-J + run-bonus, thematic cosine, scribal-signature cosine + Jaccard) PLUS an identification verdict (same_composition_same_scribe / same_composition_different_scribe / same_scribe_different_composition / physical_…

## `cluster_pair_similarity_matrix`

Given an arbitrary list of museum numbers (typically the cluster_members from a prior reconstruct_cluster call), compute the FULL upper-triangular pairwise fuzzy-Jaccard matrix. Returns: sparse edge list (pairs with J ≥ min_jaccard), per-tablet degree at multiple thresholds, edge-weight summary stat…

## `find_short_fragments`

Quality-audit tool — surface tablets at or below a sign-count threshold. Direct programmatic complement to the v0.18.4 reconstruct_cluster `min_sign_count` filter: where the filter drops short fragments inline at BFS time, this tool exposes the same marginal-signal surface as a queryable view. Motiv…

## `list_collection_prefixes`

Discovery tool — returns the full list of distinct museum-collection prefixes in the corpus, ranked by tablet count (or alternative metric), with per-prefix tablet count + total sign count + transliteration coverage. The companion query to coverage_stats_for_collection: this tool answers 'what prefi…

## `coverage_stats_for_collection`

Corpus-level baseline: for a given museum-collection prefix (or list of prefixes) like 'BM', 'K', 'Sm', 'CBS', 'VAT', 'NZK', etc., return total tablet count + transliteration coverage + sign-count distribution + top-N largest tablets + period/genre/city breakdowns. Useful as the entry-point query fo…

## `restore_lacuna_passage`

Predict the most-probable sign sequence for a multi-sign damaged passage. Extends v0.14.2's single-sign infer_damaged_sign to multi-sign lacunae via parallel-template alignment (find templates whose local sign sequence contains BOTH a prefix-trigram and a suffix-trigram within distance k ± tolerance…

## `find_same_scribe_candidates`

Find tablets with similar orthographic preferences — candidate same-scribe or same-scribal-school pairs. Computes per-tablet 'scribal signature' = top-30 signs by log-likelihood ratio of in-tablet vs. corpus-baseline frequency. Two tablets with overlapping signatures share unusual orthographic prefe…

## `get_scribal_signature`

Retrieve the scribal-signature profile for a tablet: top-30 signs whose in-tablet frequency is unusually high (log-likelihood ratio) vs. corpus baseline. Use to inspect a tablet's orthographic preferences or to cross-check shared signs flagging a find_same_scribe_candidates pair.

## `surface_genre_conflicts`

Genre-Conflict Sentinel. Surfaces tablets where identify_composition's high-confidence composition-FAMILY (magic / divination / lexical, from registry typical_genre) disagrees with the tablet's eBL editorial genre-FAMILY (medicine / magic / divination / literature / lexical, from primary_genre), and…

## `oracc_index_project`

Unlock/inventory one of the 5 target ORACC corpora (DCCLT, SAAo, RINAP, RIBo, CCP) from the build-oracc BUNDLE ZIP (https://build-oracc.museum.upenn.edu/json/<SLUG>.zip — SLUG = project pathname with '/'→'-'; CCP ships as 'ccpo'). The bundle is downloaded + unzipped once and cached under getCacheDir…

## `oracc_get_edition`

Retrieve one parsed ORACC edition (transliteration + lemma/gloss stream + line numbers) by project + text_id, with genre/period/provenience metadata ATTACHED. PRIMARY channel: the build-oracc bundle's corpusjson/<ID>.json (CDL), parsed into lines + tokens (now preserving nonw dividers/deletions/eras…

