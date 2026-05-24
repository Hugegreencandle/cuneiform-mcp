// v0.22.0 — Joint scribal-signature + provenance clustering.
//
// Bridges the §3.1 BM.77056 *āšipūtu* curriculum finding (composition-level)
// with provenance data (find-spot city / collection) to produce empirically
// reconstructed scribal-school candidate clusters. Output: connected
// components of a graph whose nodes are tablets with BOTH a cached scribal
// signature AND a known city/site, and whose edges connect pairs at scribal
// cosine ≥ min_scribal_similarity AND (optionally) sharing the same
// provenance city. Each surfaced cluster = a scribal-school CANDIDATE,
// surfacing tablets that share orthographic-preference fingerprints AND
// physical find-spots.
//
// Inferential framing: "scribal school" is a HYPOTHESIS to philologists,
// not a discovery. The empirical signal is "shared LLR fingerprint + shared
// find-spot", which is a strong prior for school-level co-training. The
// philological evaluation downstream is what closes the inference.
//
// Algorithm:
//   1. Source candidates: walk tablets that have BOTH a cached scribal
//      signature (scribalFingerprint.ts) AND a non-null getCity() from
//      cached fragment-metadata (fragmentMetadata.ts).
//   2. Edge construction: for each candidate, fetch findSameScribeCandidates
//      with high topK. Keep edges where signature_cosine ≥ threshold AND
//      (if required_shared_provenance) the other endpoint also has
//      a known city that matches the seed's.
//   3. Connected components via union-find over the surviving edges.
//   4. Drop components below min_school_size.
//   5. Per-cluster: pick anchor (highest sum of within-cluster cosines),
//      period_distribution, genre_distribution, internal_cohesion (mean
//      pairwise cosine across collected edges within the cluster).
//
// Performance: O(N × topK) where N = tablets with metadata + signature.
// At minSignCount=50 and require-city filter, N is typically a few hundred,
// well under 30 sec on a warm cache. The dominant cost is the per-seed
// findSameScribeCandidates call, which is itself O(corpus size). Bounded
// by maxTabletsToScan.

import { findSameScribeCandidates, scribalIndexStats } from "./scribalFingerprint.js";
import {
  getCity,
  getFragmentMetadata,
  getPeriod,
  getPrimaryGenre,
  type FragmentMetadata,
} from "./fragmentMetadata.js";
import { getAllTabletRecords } from "./anomalySurface.js";

// As of v0.22.0, eBL fragment-metadata fills `collection` (e.g. "Kuyunjik",
// "Babylon", "Sippar") far more reliably than `provenance.site`. Empirically
// the cache has 22,425 entries with `collection` and 0 with `provenance.site`
// — collection is therefore the practical provenance signal for joint
// clustering. The collection field encodes the find-site (Kuyunjik = the
// mound at Nineveh, etc.), which IS the city we want for scribal-school
// reconstruction. The tool falls back from getCity() → metadata.collection
// when site is null.

function getCityOrCollection(metadata: FragmentMetadata | null): string | null {
  if (!metadata) return null;
  const city = getCity(metadata);
  if (city) return city;
  if (metadata.collection && metadata.collection.length > 0) {
    return metadata.collection;
  }
  return null;
}

// ─── Public types ──────────────────────────────────────────────────────────

export type ScribalSchoolMember = {
  tablet_id: string;
  sign_count: number | null;
  period: string | null;
  primary_genre: string | null;
};

export type DistributionBucket = {
  label: string;
  count: number;
};

export type ScribalSchool = {
  school_id: string;
  anchor_tablet: string;
  members: ScribalSchoolMember[];
  shared_provenance: string | null;
  period_distribution: DistributionBucket[];
  genre_distribution: DistributionBucket[];
  internal_cohesion: number;
  edge_count: number;
};

export type BuildScribalSchoolGraphResult = {
  schools: ScribalSchool[];
  index_stats: {
    total_tablets_in_scribal_index: number;
    candidates_with_signature_and_city: number;
    candidates_without_city: number;
    candidates_without_signature: number;
    tablets_scanned_for_edges: number;
    edges_collected: number;
    components_above_size_threshold: number;
    elapsed_seconds: number;
  };
  query: {
    min_scribal_similarity: number;
    min_school_size: number;
    required_shared_provenance: boolean;
    top_k_schools: number;
    exclude_prefixes: string[];
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_k_per_tablet: number;
  };
  warnings: string[];
};

export type BuildScribalSchoolGraphOptions = {
  minScribalSimilarity?: number;
  minSchoolSize?: number;
  requiredSharedProvenance?: boolean;
  topKSchools?: number;
  excludePrefixes?: string[];
  /** Internal: minimum sign count to consider a seed reliable. Default 50. */
  minSignCount?: number;
  /** Internal: cap on number of seeds scanned. Default 1500. */
  maxTabletsToScan?: number;
  /** Internal: top-K candidates per seed when fetching edges. Default 20. */
  topKPerTablet?: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function startsWithAny(id: string, prefixes: string[]): boolean {
  for (const p of prefixes) {
    if (id.startsWith(p)) return true;
  }
  return false;
}

function bumpBucket(map: Map<string, number>, label: string | null): void {
  const key = label && label.length > 0 ? label : "(unknown)";
  map.set(key, (map.get(key) ?? 0) + 1);
}

function distributionFromMap(map: Map<string, number>): DistributionBucket[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
}

// ─── Main entry ────────────────────────────────────────────────────────────

export function buildScribalSchoolGraph(
  opts: BuildScribalSchoolGraphOptions = {},
): BuildScribalSchoolGraphResult {
  const startMs = Date.now();
  const warnings: string[] = [];

  const minScribalSimilarity = Math.max(0, Math.min(1, opts.minScribalSimilarity ?? 0.65));
  const minSchoolSize = Math.max(2, opts.minSchoolSize ?? 3);
  const requiredSharedProvenance = opts.requiredSharedProvenance ?? true;
  const topKSchools = Math.max(1, Math.min(500, opts.topKSchools ?? 30));
  const excludePrefixes = Array.isArray(opts.excludePrefixes) ? opts.excludePrefixes.slice() : [];
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxTabletsToScan = Math.max(10, Math.min(10_000, opts.maxTabletsToScan ?? 1500));
  const topKPerTablet = Math.max(2, Math.min(50, opts.topKPerTablet ?? 20));

  const emptyQueryEcho = {
    min_scribal_similarity: minScribalSimilarity,
    min_school_size: minSchoolSize,
    required_shared_provenance: requiredSharedProvenance,
    top_k_schools: topKSchools,
    exclude_prefixes: excludePrefixes,
    min_sign_count: minSignCount,
    max_tablets_to_scan: maxTabletsToScan,
    top_k_per_tablet: topKPerTablet,
  };

  // ─── Pre-flight: indexes loaded? ──────────────────────────────────────
  const sigStats = scribalIndexStats();
  if (!sigStats.loaded) {
    warnings.push(
      `Scribal index unavailable (${sigStats.load_error ?? "no error reported"}). Run scripts/build-scribal-index.mjs (or precompute signs cache) before querying.`,
    );
    return {
      schools: [],
      index_stats: {
        total_tablets_in_scribal_index: 0,
        candidates_with_signature_and_city: 0,
        candidates_without_city: 0,
        candidates_without_signature: 0,
        tablets_scanned_for_edges: 0,
        edges_collected: 0,
        components_above_size_threshold: 0,
        elapsed_seconds: +(((Date.now() - startMs) / 1000)).toFixed(3),
      },
      query: emptyQueryEcho,
      warnings,
    };
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    warnings.push(
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the corpus tablet list before querying.",
    );
    return {
      schools: [],
      index_stats: {
        total_tablets_in_scribal_index: sigStats.total_tablets,
        candidates_with_signature_and_city: 0,
        candidates_without_city: 0,
        candidates_without_signature: 0,
        tablets_scanned_for_edges: 0,
        edges_collected: 0,
        components_above_size_threshold: 0,
        elapsed_seconds: +(((Date.now() - startMs) / 1000)).toFixed(3),
      },
      query: emptyQueryEcho,
      warnings,
    };
  }

  // ─── Build candidate scan list ────────────────────────────────────────
  // A candidate must:
  //   - have sign_count ≥ minSignCount
  //   - have a cached scribal signature (we test by calling
  //     findSameScribeCandidates lazily, but pre-filter to anomaly-index
  //     tablets with sign_count ≥ minSignCount + cached fragment metadata)
  //   - have a non-null getCity() value
  //   - not match excludePrefixes
  let withoutCity = 0;
  let withoutSignatureMaybeUnknownNow = 0; // we don't pre-check signature presence — counted later
  const candidates: Array<{
    id: string;
    city: string;
    period: string | null;
    genre: string | null;
    sign_count: number;
    metadata: FragmentMetadata | null;
  }> = [];

  for (const t of tablets) {
    if (t.sign_count < minSignCount) continue;
    if (excludePrefixes.length > 0 && startsWithAny(t.id, excludePrefixes)) continue;
    const md = getFragmentMetadata(t.id);
    const city = getCityOrCollection(md);
    if (!city) {
      withoutCity++;
      continue;
    }
    candidates.push({
      id: t.id,
      city,
      period: getPeriod(md),
      genre: getPrimaryGenre(md),
      sign_count: t.sign_count,
      metadata: md,
    });
  }

  // Sort candidates by sign_count desc (larger tablets first — more reliable
  // signatures) and cap at maxTabletsToScan.
  candidates.sort((a, b) => b.sign_count - a.sign_count);
  const scanList = candidates.slice(0, maxTabletsToScan);

  if (scanList.length === 0) {
    warnings.push(
      `No candidates after filtering (min_sign_count=${minSignCount}, city-attested only, excluded prefixes=[${excludePrefixes.join(", ")}]). ` +
        `Tablets without city metadata: ${withoutCity}. Try enriching fragment metadata via enrich_prefix_metadata, or lower min_sign_count.`,
    );
    return {
      schools: [],
      index_stats: {
        total_tablets_in_scribal_index: sigStats.total_tablets,
        candidates_with_signature_and_city: 0,
        candidates_without_city: withoutCity,
        candidates_without_signature: 0,
        tablets_scanned_for_edges: 0,
        edges_collected: 0,
        components_above_size_threshold: 0,
        elapsed_seconds: +(((Date.now() - startMs) / 1000)).toFixed(3),
      },
      query: emptyQueryEcho,
      warnings,
    };
  }

  const scanIdToCity = new Map<string, string>();
  const scanIdToMeta = new Map<string, (typeof scanList)[number]>();
  for (const c of scanList) {
    scanIdToCity.set(c.id, c.city);
    scanIdToMeta.set(c.id, c);
  }

  // ─── Edge collection ──────────────────────────────────────────────────
  // For each seed, fetch top-K same-scribe candidates. Keep an edge iff:
  //   - cand.signature_cosine ≥ minScribalSimilarity
  //   - candidate is in the scan list (i.e. has signature + city + meets
  //     thresholds) — this implicitly requires the other side to ALSO be a
  //     candidate; we don't widen the universe to candidates outside the
  //     scan window because we want symmetric provenance coverage.
  //   - if requiredSharedProvenance, cities match.
  // Edges are deduped by canonical pair-key; we keep the MAX observed
  // cosine across the two directions.
  type EdgeAcc = { a: string; b: string; cosine: number };
  const edgesByKey = new Map<string, EdgeAcc>();
  let seedsActuallyQueried = 0;
  let candidatesWithoutSignature = 0;

  for (const seed of scanList) {
    let result;
    try {
      result = findSameScribeCandidates({
        tabletId: seed.id,
        topK: topKPerTablet,
        minJaccard: 0,
        minOverlap: 3,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`findSameScribeCandidates threw for ${seed.id}: ${msg}`);
      continue;
    }
    if (result.query_signature_size === 0) {
      candidatesWithoutSignature++;
      continue;
    }
    seedsActuallyQueried++;
    const seedCity = seed.city;
    for (const cand of result.candidates) {
      if (cand.signature_cosine < minScribalSimilarity) continue;
      const candMeta = scanIdToMeta.get(cand.tablet_id);
      if (!candMeta) continue; // candidate not in scan window (no signature, no city, or filtered)
      if (requiredSharedProvenance && candMeta.city !== seedCity) continue;
      const key = edgeKey(seed.id, cand.tablet_id);
      const [aId, bId] = seed.id < cand.tablet_id ? [seed.id, cand.tablet_id] : [cand.tablet_id, seed.id];
      const existing = edgesByKey.get(key);
      if (!existing) {
        edgesByKey.set(key, { a: aId, b: bId, cosine: cand.signature_cosine });
      } else if (cand.signature_cosine > existing.cosine) {
        existing.cosine = cand.signature_cosine;
      }
    }
  }

  // ─── Union-find: connected components over surviving edges ────────────
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  function init(id: string): void {
    if (!parent.has(id)) {
      parent.set(id, id);
      rank.set(id, 0);
    }
  }
  function find(x: string): string {
    let cur = x;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    let node = x;
    while (parent.get(node) !== cur) {
      const next = parent.get(node)!;
      parent.set(node, cur);
      node = next;
    }
    return cur;
  }
  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const raR = rank.get(ra) ?? 0;
    const rbR = rank.get(rb) ?? 0;
    if (raR < rbR) parent.set(ra, rb);
    else if (raR > rbR) parent.set(rb, ra);
    else {
      parent.set(rb, ra);
      rank.set(ra, raR + 1);
    }
  }

  for (const e of edgesByKey.values()) {
    init(e.a);
    init(e.b);
    union(e.a, e.b);
  }

  // Bucket members by root
  const membersByRoot = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const r = find(id);
    let bucket = membersByRoot.get(r);
    if (!bucket) {
      bucket = [];
      membersByRoot.set(r, bucket);
    }
    bucket.push(id);
  }

  // ─── Per-cluster enrichment ───────────────────────────────────────────
  // For each component meeting size threshold:
  //   - collect intra-cluster edges
  //   - compute internal_cohesion = mean pairwise cosine of intra-cluster edges
  //   - pick anchor = member with highest sum of intra-cluster cosines
  //   - shared_provenance: if requiredSharedProvenance OR all members share
  //     one city, surface that city; otherwise null
  //   - period/genre distributions from scanIdToMeta
  type RawSchool = {
    members: string[];
    edges: EdgeAcc[];
    cohesion: number;
    anchor: string;
    sharedProvenance: string | null;
  };
  const rawSchools: RawSchool[] = [];
  let componentsAboveSize = 0;

  for (const memberIds of membersByRoot.values()) {
    if (memberIds.length < minSchoolSize) continue;
    componentsAboveSize++;
    const memberSet = new Set(memberIds);
    const intraEdges: EdgeAcc[] = [];
    for (const e of edgesByKey.values()) {
      if (memberSet.has(e.a) && memberSet.has(e.b)) intraEdges.push(e);
    }
    if (intraEdges.length === 0) continue; // shouldn't happen — components have ≥1 edge

    // Anchor: sum of cosines per member
    const sumByMember = new Map<string, number>();
    for (const id of memberIds) sumByMember.set(id, 0);
    for (const e of intraEdges) {
      sumByMember.set(e.a, (sumByMember.get(e.a) ?? 0) + e.cosine);
      sumByMember.set(e.b, (sumByMember.get(e.b) ?? 0) + e.cosine);
    }
    let anchor = memberIds[0];
    let bestSum = -Infinity;
    for (const id of memberIds) {
      const s = sumByMember.get(id) ?? 0;
      if (s > bestSum || (s === bestSum && id < anchor)) {
        bestSum = s;
        anchor = id;
      }
    }

    // Internal cohesion: mean cosine across intra-cluster edges
    const cohesion = intraEdges.reduce((acc, e) => acc + e.cosine, 0) / intraEdges.length;

    // Shared provenance
    const cities = new Set<string>();
    for (const id of memberIds) {
      const c = scanIdToCity.get(id);
      if (c) cities.add(c);
    }
    const sharedProvenance = cities.size === 1 ? cities.values().next().value ?? null : null;

    rawSchools.push({
      members: memberIds.slice(),
      edges: intraEdges,
      cohesion,
      anchor,
      sharedProvenance,
    });
  }

  // Rank schools: size desc, then cohesion desc
  rawSchools.sort((a, b) => {
    if (b.members.length !== a.members.length) return b.members.length - a.members.length;
    return b.cohesion - a.cohesion;
  });

  // Materialize
  const schools: ScribalSchool[] = [];
  for (let i = 0; i < Math.min(topKSchools, rawSchools.length); i++) {
    const s = rawSchools[i];
    const periodMap = new Map<string, number>();
    const genreMap = new Map<string, number>();
    const memberObjs: ScribalSchoolMember[] = [];
    // Sort members deterministically: anchor first, then by tablet_id asc
    const sortedMembers = s.members.slice().sort((x, y) => {
      if (x === s.anchor) return -1;
      if (y === s.anchor) return 1;
      return x.localeCompare(y);
    });
    for (const id of sortedMembers) {
      const meta = scanIdToMeta.get(id);
      const period = meta?.period ?? null;
      const genre = meta?.genre ?? null;
      bumpBucket(periodMap, period);
      bumpBucket(genreMap, genre);
      memberObjs.push({
        tablet_id: id,
        sign_count: meta?.sign_count ?? null,
        period,
        primary_genre: genre,
      });
    }

    schools.push({
      school_id: `school-${String(i + 1).padStart(3, "0")}`,
      anchor_tablet: s.anchor,
      members: memberObjs,
      shared_provenance: s.sharedProvenance,
      period_distribution: distributionFromMap(periodMap),
      genre_distribution: distributionFromMap(genreMap),
      internal_cohesion: +s.cohesion.toFixed(4),
      edge_count: s.edges.length,
    });
  }

  if (schools.length === 0) {
    warnings.push(
      `No scribal schools surfaced at min_scribal_similarity=${minScribalSimilarity}, min_school_size=${minSchoolSize}` +
        (requiredSharedProvenance ? ", required_shared_provenance=true" : "") +
        `. Try lowering thresholds, setting required_shared_provenance=false, or enriching fragment metadata.`,
    );
  }

  return {
    schools,
    index_stats: {
      total_tablets_in_scribal_index: sigStats.total_tablets,
      candidates_with_signature_and_city: scanList.length - candidatesWithoutSignature,
      candidates_without_city: withoutCity,
      candidates_without_signature: candidatesWithoutSignature,
      tablets_scanned_for_edges: seedsActuallyQueried,
      edges_collected: edgesByKey.size,
      components_above_size_threshold: componentsAboveSize,
      elapsed_seconds: +(((Date.now() - startMs) / 1000)).toFixed(3),
    },
    query: emptyQueryEcho,
    warnings,
  };
}
