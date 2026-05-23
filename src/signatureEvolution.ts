// v0.18.17 — Per-hop scribal-signature drift along a multi-axis lineage chain.
//
// Companion to `find_lineage_chain` (v0.18.16). Where that primitive WALKS
// an alternating BFS chain across {fuzzy, scribal, thematic} axes, this
// tool walks the SAME chain and then overlays a per-hop signature-drift
// measurement: for every parent→child edge in the chain, compute the
// cosine between the parent's scribal-LLR signature and the child's. The
// resulting trace reveals whether the chain crosses scribal-school
// boundaries (cosine drops abruptly = "signature jump") or stays within
// a single scribal tradition (cosine stays high = "stable").
//
// Use case:
//   "Starting from K.2798, walk a 4-hop fuzzy/scribal chain — does the
//    scribal signature stay coherent (single scribal-school tradition)
//    or jump abruptly (composition copied across multiple scribal
//    traditions)?"
//
// Algorithm:
//   1. Call findLineageChain with the supplied seed + axis_sequence + params.
//   2. For every member in the returned chain, look up its scribal
//      signature via getScribalSignature() and build a sparse LLR map.
//   3. For each non-seed member, derive its canonical parent by picking
//      the HIGHEST-SCORE entry from axes_arrived_via (with the matching
//      axis as the canonical arrival axis).
//   4. Compute sig_cosine_to_seed for every member and sig_cosine_to_parent
//      for every non-seed member.
//   5. Identify "signature jumps" — parent→child hops where the
//      parent-child signature cosine drops below jump_threshold (default
//      0.40).
//   6. Aggregate per-depth mean sig_cosine_to_seed.
//   7. Classify the chain's scribal coherence:
//        - stable     — mean sig_cosine_to_seed ≥ 0.65 AND zero jumps
//        - drifting   — mean in [0.45, 0.65) OR ≤ 2 jumps
//        - fragmented — mean < 0.45 OR ≥ 3 jumps
//
// Pure stdlib + reuse of findLineageChain + getScribalSignature. Sparse
// cosine implemented inline (same pattern as v0.18.10 orthographicOutliers).

import {
  findLineageChain,
  type LineageAxis,
  type LineageChainResult,
  type LineageMember,
} from "./lineageChain.js";
import { getScribalSignature } from "./scribalFingerprint.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type SignatureEvolutionCoherence = "stable" | "drifting" | "fragmented";

export type ChainMemberWithSignature = {
  tablet_id: string;
  depth: number;
  parent: string | null; // null for seed
  axis_arrived_via: LineageAxis | null; // null for seed
  arrival_score: number | null; // axis-specific edge score (null for seed)
  signature_size: number; // |signature_signs| for this tablet
  sig_cosine_to_seed: number; // 0 if either side has empty signature
  sig_cosine_to_parent: number | null; // null for seed
};

export type SignatureDepthAggregate = {
  depth: number;
  member_count: number;
  mean_sig_cosine_to_seed: number;
};

export type SignatureJump = {
  parent: string;
  child: string;
  axis: LineageAxis;
  sig_cosine_to_parent: number;
  child_depth: number;
};

export type FindSignatureEvolutionResult = {
  query: {
    seed_tablet_id: string;
    axis_sequence: LineageAxis[];
    max_depth: number;
    top_k_per_hop: number;
    max_chain_size: number;
    jump_threshold: number;
  };
  chain_with_signatures: ChainMemberWithSignature[];
  depth_aggregates: SignatureDepthAggregate[];
  signature_jumps: SignatureJump[];
  summary: {
    total_members: number;
    total_jumps: number;
    mean_sig_cosine_to_seed_across_chain: number;
    scribal_coherence_classification: SignatureEvolutionCoherence;
    underlying_chain_termination: LineageChainResult["summary"]["termination_reason"];
  };
  warnings: string[];
};

export type FindSignatureEvolutionOptions = {
  seedTabletId: string;
  axisSequence?: LineageAxis[]; // default ["fuzzy","scribal","fuzzy"]
  maxDepth?: number; // default 3, max 6
  topKPerHop?: number; // default 3, max 15
  maxChainSize?: number; // default 15, max 100
  jumpThreshold?: number; // default 0.40
};

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_AXIS_SEQUENCE: ReadonlyArray<LineageAxis> = [
  "fuzzy",
  "scribal",
  "fuzzy",
];

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_TOP_K = 3;
// v0.18.19 calibration audit Round 3 / untested-tool: chain-size 15 invites BFS
// overshoot that drags down mean_sig_cosine_to_seed past the stable cutoff for
// tight liturgical lineages like K.5896 (Mīs pî). Empirical sweep on K.5896:
//   chain=6:  mean=0.658 → stable ✓
//   chain=10: mean=0.432 → fragmented ✗ (wrong for tight transmission)
//   chain=15: mean=0.504 → drifting
// Inner-core size for this corpus is empirically ~6 tablets. Default 8 splits
// the difference — preserves exploratory breadth while preventing the chain=10
// fragmented mis-label for known tight clusters.
const DEFAULT_MAX_CHAIN = 8;
const DEFAULT_JUMP_THRESHOLD = 0.4;

const COHERENCE_STABLE_MIN_MEAN = 0.65;
const COHERENCE_DRIFTING_MIN_MEAN = 0.45;
const COHERENCE_DRIFTING_MAX_JUMPS = 2;
const COHERENCE_FRAGMENTED_MIN_JUMPS = 3;

// ─── Helpers ───────────────────────────────────────────────────────────────

// Standard sparse cosine over the shared-key intersection. Both vectors'
// norms are computed over their own full key sets. Mirrors the helper in
// v0.18.10 orthographicOutliers.ts. Returns 0 if either map is empty.
function sparseCosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, v] of small) {
    const other = large.get(k);
    if (other !== undefined) dot += v * other;
  }
  if (dot === 0) return 0;
  let normA = 0;
  for (const v of a.values()) normA += v * v;
  let normB = 0;
  for (const v of b.values()) normB += v * v;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// Build a sparse LLR map for a tablet's scribal signature. Returns the
// (possibly empty) map plus any signature-fetch warnings the caller
// should surface (e.g. tablet below MIN_TABLET_SIZE).
function buildSignatureMap(tabletId: string): {
  sigMap: Map<string, number>;
  signatureSize: number;
  warnings: string[];
} {
  const sig = getScribalSignature(tabletId);
  const sigMap = new Map<string, number>();
  for (const s of sig.signature_signs) {
    // Defensive: if a sign repeats, keep the max LLR (same convention as
    // orthographicOutliers).
    const prev = sigMap.get(s.sign);
    if (prev === undefined || s.llr > prev) sigMap.set(s.sign, s.llr);
  }
  return {
    sigMap,
    signatureSize: sigMap.size,
    warnings: sig.warnings,
  };
}

// Pick the canonical {axis, parent, score} arrival for a non-seed chain
// member. The lineage primitive's `axes_arrived_via[]` can hold multiple
// entries (one per axis that successfully promoted the tablet); we pick
// the HIGHEST-SCORE arrival as the canonical chain-walk edge, which is
// the strongest evidence we have for this tablet's lineage placement.
function canonicalArrival(member: LineageMember): {
  axis: LineageAxis;
  parent: string;
  score: number;
} | null {
  if (member.axes_arrived_via.length === 0) return null;
  let best = member.axes_arrived_via[0];
  for (let i = 1; i < member.axes_arrived_via.length; i++) {
    if (member.axes_arrived_via[i].score > best.score) {
      best = member.axes_arrived_via[i];
    }
  }
  return { axis: best.axis, parent: best.parent, score: best.score };
}

function classifyCoherence(
  meanToSeed: number,
  jumpCount: number,
): SignatureEvolutionCoherence {
  // Order matters — fragmented checked first so that a high-mean chain
  // with many jumps is still flagged as fragmented (the spec lists the
  // jump and mean thresholds as a logical OR for the fragmented bucket).
  if (
    meanToSeed < COHERENCE_DRIFTING_MIN_MEAN ||
    jumpCount >= COHERENCE_FRAGMENTED_MIN_JUMPS
  ) {
    return "fragmented";
  }
  if (meanToSeed >= COHERENCE_STABLE_MIN_MEAN && jumpCount === 0) {
    return "stable";
  }
  // Otherwise drifting (mean in [0.45, 0.65) OR ≤ 2 jumps with mean ≥ 0.45)
  if (
    meanToSeed >= COHERENCE_DRIFTING_MIN_MEAN &&
    jumpCount <= COHERENCE_DRIFTING_MAX_JUMPS
  ) {
    return "drifting";
  }
  // Fallback: any other combination (e.g. high mean but 1-2 jumps) →
  // drifting. The stable bucket requires zero jumps by spec.
  return "drifting";
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findSignatureEvolutionInLineage(
  opts: FindSignatureEvolutionOptions,
): FindSignatureEvolutionResult {
  const warnings: string[] = [];

  const axisSequence: LineageAxis[] = opts.axisSequence && opts.axisSequence.length > 0
    ? [...opts.axisSequence]
    : [...DEFAULT_AXIS_SEQUENCE];
  const maxDepth = Math.max(1, Math.min(6, opts.maxDepth ?? DEFAULT_MAX_DEPTH));
  const topK = Math.max(1, Math.min(15, opts.topKPerHop ?? DEFAULT_TOP_K));
  const maxChainSize = Math.max(
    2,
    Math.min(100, opts.maxChainSize ?? DEFAULT_MAX_CHAIN),
  );
  const jumpThreshold = Math.max(
    0,
    Math.min(1, opts.jumpThreshold ?? DEFAULT_JUMP_THRESHOLD),
  );

  const queryEcho = {
    seed_tablet_id: opts.seedTabletId,
    axis_sequence: axisSequence,
    max_depth: maxDepth,
    top_k_per_hop: topK,
    max_chain_size: maxChainSize,
    jump_threshold: jumpThreshold,
  };

  // ── 1. Walk the underlying lineage chain ────────────────────────────────
  const chainResult = findLineageChain({
    seedTabletId: opts.seedTabletId,
    axisSequence,
    maxDepth,
    topKPerHop: topK,
    maxChainSize,
  });
  for (const w of chainResult.warnings) {
    warnings.push(`[lineage_chain] ${w}`);
  }

  if (chainResult.chain.length === 0) {
    return {
      query: queryEcho,
      chain_with_signatures: [],
      depth_aggregates: [],
      signature_jumps: [],
      summary: {
        total_members: 0,
        total_jumps: 0,
        mean_sig_cosine_to_seed_across_chain: 0,
        scribal_coherence_classification: "fragmented",
        underlying_chain_termination: chainResult.summary.termination_reason,
      },
      warnings,
    };
  }

  // ── 2. Build sparse signatures for every chain member ───────────────────
  const sigCache = new Map<string, Map<string, number>>();
  const sigSizes = new Map<string, number>();
  let signaturelessCount = 0;
  for (const m of chainResult.chain) {
    const { sigMap, signatureSize, warnings: sigWarnings } = buildSignatureMap(
      m.tablet_id,
    );
    sigCache.set(m.tablet_id, sigMap);
    sigSizes.set(m.tablet_id, signatureSize);
    if (signatureSize === 0) {
      signaturelessCount += 1;
      for (const w of sigWarnings) {
        warnings.push(`[signature ${m.tablet_id}] ${w}`);
      }
    }
  }
  if (signaturelessCount > 0) {
    warnings.push(
      `${signaturelessCount}/${chainResult.chain.length} chain members had empty scribal signatures — their cosine values default to 0.`,
    );
  }

  const seedSig = sigCache.get(opts.seedTabletId) ?? new Map<string, number>();
  if (seedSig.size === 0) {
    warnings.push(
      `Seed '${opts.seedTabletId}' has an empty scribal signature — all sig_cosine_to_seed values will be 0 and coherence will classify as fragmented.`,
    );
  }

  // ── 3. Compute per-member sig_cosine_to_seed + sig_cosine_to_parent ─────
  const enriched: ChainMemberWithSignature[] = [];
  const cosineToSeedByDepth = new Map<number, number[]>();
  const allCosinesToSeed: number[] = [];
  const jumps: SignatureJump[] = [];

  for (const m of chainResult.chain) {
    const memberSig = sigCache.get(m.tablet_id) ?? new Map<string, number>();
    const memberSize = sigSizes.get(m.tablet_id) ?? 0;

    let cosToSeed = 0;
    if (m.tablet_id === opts.seedTabletId) {
      // Seed-to-seed: define as 1.0 if seed has any signature, else 0.
      cosToSeed = seedSig.size > 0 ? 1 : 0;
    } else {
      cosToSeed = sparseCosine(memberSig, seedSig);
    }

    let parent: string | null = null;
    let arrivalAxis: LineageAxis | null = null;
    let arrivalScore: number | null = null;
    let cosToParent: number | null = null;

    if (m.depth === 0) {
      // Seed — no parent, no parent-cosine.
      parent = null;
      arrivalAxis = null;
      arrivalScore = null;
      cosToParent = null;
    } else {
      const arrival = canonicalArrival(m);
      if (arrival) {
        parent = arrival.parent;
        arrivalAxis = arrival.axis;
        arrivalScore = +arrival.score.toFixed(4);
        const parentSig =
          sigCache.get(arrival.parent) ?? new Map<string, number>();
        cosToParent = sparseCosine(memberSig, parentSig);

        // Signature-jump detection: parent-child cosine below threshold.
        // Only emit when BOTH endpoints have signatures (cosine of 0 from
        // a missing signature is not a meaningful "jump").
        if (
          parentSig.size > 0 &&
          memberSig.size > 0 &&
          cosToParent < jumpThreshold
        ) {
          jumps.push({
            parent: arrival.parent,
            child: m.tablet_id,
            axis: arrival.axis,
            sig_cosine_to_parent: +cosToParent.toFixed(4),
            child_depth: m.depth,
          });
        }
      } else {
        // Defensive: a non-seed member with no arrivals should not happen
        // given the BFS contract, but surface it rather than crash.
        warnings.push(
          `Chain member '${m.tablet_id}' has no recorded arrivals despite depth=${m.depth} — parent-cosine skipped.`,
        );
      }
    }

    enriched.push({
      tablet_id: m.tablet_id,
      depth: m.depth,
      parent,
      axis_arrived_via: arrivalAxis,
      arrival_score: arrivalScore,
      signature_size: memberSize,
      sig_cosine_to_seed: +cosToSeed.toFixed(4),
      sig_cosine_to_parent:
        cosToParent === null ? null : +cosToParent.toFixed(4),
    });

    const bucket = cosineToSeedByDepth.get(m.depth);
    if (bucket) {
      bucket.push(cosToSeed);
    } else {
      cosineToSeedByDepth.set(m.depth, [cosToSeed]);
    }
    allCosinesToSeed.push(cosToSeed);
  }

  // ── 4. Per-depth aggregates ─────────────────────────────────────────────
  const depthAggregates: SignatureDepthAggregate[] = [];
  const depthsSorted = [...cosineToSeedByDepth.keys()].sort((a, b) => a - b);
  for (const d of depthsSorted) {
    const values = cosineToSeedByDepth.get(d) ?? [];
    const mean = values.length > 0
      ? values.reduce((acc, v) => acc + v, 0) / values.length
      : 0;
    depthAggregates.push({
      depth: d,
      member_count: values.length,
      mean_sig_cosine_to_seed: +mean.toFixed(4),
    });
  }

  // ── 5. Summary + coherence classification ───────────────────────────────
  const meanAcrossChain = allCosinesToSeed.length > 0
    ? allCosinesToSeed.reduce((acc, v) => acc + v, 0) / allCosinesToSeed.length
    : 0;
  const classification = classifyCoherence(meanAcrossChain, jumps.length);

  // Sort jumps by severity (lowest cosine first) so the worst breaks
  // surface at the top.
  jumps.sort((a, b) => a.sig_cosine_to_parent - b.sig_cosine_to_parent);

  return {
    query: queryEcho,
    chain_with_signatures: enriched,
    depth_aggregates: depthAggregates,
    signature_jumps: jumps,
    summary: {
      total_members: enriched.length,
      total_jumps: jumps.length,
      mean_sig_cosine_to_seed_across_chain: +meanAcrossChain.toFixed(4),
      scribal_coherence_classification: classification,
      underlying_chain_termination: chainResult.summary.termination_reason,
    },
    warnings,
  };
}
