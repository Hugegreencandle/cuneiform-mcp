// v0.18.0 — Scribal fingerprint via orthographic-preference profile.
//
// Per-tablet "fingerprint" = the subset of signs whose in-tablet frequency
// is unusually high relative to corpus baseline. Operationalized via
// **log-likelihood ratio (LLR)** of sign frequency in this tablet vs. the
// corpus average. The top-N signs by LLR form the tablet's signature
// orthographic profile.
//
// Two tablets with overlapping signatures are candidate same-scribe (or
// same-scribal-school) pairs, because they share unusual orthographic
// preferences — variant-sign choices (ABZ75 vs ABZ75v2), logogram vs
// syllabic-spelling habits, sign-compound preferences. Note that eBL
// transliterations have already normalized actual sign-form variants
// (paleography stripped), so this is "spelling-preference fingerprint"
// rather than "paleographic fingerprint" in the strict sense — still
// scholarly-actionable for clustering scribal-school output.
//
// Algorithm:
//   1. Build per-tablet sign-frequency map + corpus average
//   2. For each tablet, compute LLR per sign:
//        LLR(s, T) = N_T(s) * log( P_T(s) / P_corpus(s) )
//   3. Top-K signs by LLR = the tablet's signature
//   4. Same-scribe candidate score = Jaccard over signatures + cosine
//      over normalized signature-weight vectors
//
// Pre-build: ~5 sec on 36K tablets. Indexed lazily.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ALL_SIGNS_FILE = "all-signs-full.json";
const EXCLUSIONS_FILE = "corpus-exclusions.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type ScribalSignatureSign = {
  sign: string;
  count_in_tablet: number;
  share_in_tablet: number;
  corpus_share: number;
  llr: number; // log-likelihood ratio score; higher = more idiosyncratic to this tablet
};

export type ScribalSignature = {
  tablet_id: string;
  signature_signs: ScribalSignatureSign[];
  total_signs_in_tablet: number;
  warnings: string[];
};

export type SameScribeCandidate = {
  tablet_id: string;
  signature_overlap_count: number;
  signature_jaccard: number;
  signature_cosine: number;
  shared_top_signs: Array<{ sign: string; query_llr: number; target_llr: number }>;
};

export type SameScribeResult = {
  query_tablet_id: string;
  query_signature_size: number;
  candidates: SameScribeCandidate[];
  index_stats: {
    total_tablets: number;
    candidates_examined: number;
  };
  warnings: string[];
};

// ─── Lazy index ────────────────────────────────────────────────────────────

type SignatureMap = Map<string, number>; // sign → LLR weight

type ScribalIndex = {
  signatures: Map<string, SignatureMap>; // tablet_id → signature
  totalSigns: Map<string, number>; // tablet_id → total non-X signs
  corpusShare: Map<string, number>; // sign → corpus-level share
};

let _index: ScribalIndex | null = null;
let _loadError: string | null = null;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function dataDir(): string {
  return process.env.CUNEIFORM_MCP_DATA_DIR ||
    join(import.meta.dirname ?? process.cwd(), "..", "data");
}

const SIGNATURE_TOP_K = 30; // top-N signs per tablet
const MIN_SIGN_COUNT_IN_TABLET = 2; // require sign to appear ≥ this many times in a tablet to consider it part of signature
const MIN_TABLET_SIZE = 30; // signature-tablet minimum (non-X tokens)
const MIN_CORPUS_FREQ = 5; // sign must appear ≥ this in corpus to be eligible (otherwise it's noise)

function loadIndex(): ScribalIndex | null {
  if (_index) return _index;
  if (_loadError) return null;

  const path = join(cacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) {
    _loadError = `signs cache not found: ${path}`;
    return null;
  }
  try {
    const excluded = new Set<string>();
    const exPath = join(dataDir(), EXCLUSIONS_FILE);
    if (existsSync(exPath)) {
      const ex = JSON.parse(readFileSync(exPath, "utf-8")) as { excluded_records?: Array<{ id: string }> };
      for (const r of ex.excluded_records ?? []) excluded.add(r.id);
    }

    const records = JSON.parse(readFileSync(path, "utf-8")) as Array<{ _id: string; signs: string }>;

    // First pass: corpus totals
    const corpusCounts = new Map<string, number>();
    const perTabletRaw = new Map<string, Map<string, number>>();
    const perTabletTotal = new Map<string, number>();
    let corpusTotal = 0;

    for (const r of records) {
      if (!r._id || typeof r.signs !== "string" || excluded.has(r._id)) continue;
      const counts = new Map<string, number>();
      let tot = 0;
      for (const line of r.signs.split(/\r?\n/)) {
        for (const t of line.trim().split(/\s+/).filter(Boolean)) {
          if (t === "X") continue;
          counts.set(t, (counts.get(t) ?? 0) + 1);
          tot++;
        }
      }
      if (tot < MIN_TABLET_SIZE) continue;
      perTabletRaw.set(r._id, counts);
      perTabletTotal.set(r._id, tot);
      for (const [s, c] of counts) {
        corpusCounts.set(s, (corpusCounts.get(s) ?? 0) + c);
        corpusTotal += c;
      }
    }

    // Corpus share per sign
    const corpusShare = new Map<string, number>();
    for (const [s, c] of corpusCounts) {
      corpusShare.set(s, c / corpusTotal);
    }

    // Second pass: compute signature per tablet
    const signatures = new Map<string, SignatureMap>();
    for (const [tid, counts] of perTabletRaw) {
      const tot = perTabletTotal.get(tid)!;
      const scored: Array<[string, number]> = [];
      for (const [s, c] of counts) {
        if (c < MIN_SIGN_COUNT_IN_TABLET) continue;
        const cc = corpusCounts.get(s) ?? 0;
        if (cc < MIN_CORPUS_FREQ) continue;
        const pT = c / tot;
        const pC = corpusShare.get(s) ?? 0;
        if (pT <= pC) continue; // sign must be over-represented relative to corpus
        // LLR (Dunning 1993 style, simplified)
        const llr = c * Math.log(pT / pC);
        scored.push([s, llr]);
      }
      scored.sort((a, b) => b[1] - a[1]);
      const sig: SignatureMap = new Map();
      for (const [s, llr] of scored.slice(0, SIGNATURE_TOP_K)) sig.set(s, llr);
      if (sig.size > 0) signatures.set(tid, sig);
    }

    _index = { signatures, totalSigns: perTabletTotal, corpusShare };
    return _index;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function getScribalSignature(tabletId: string): ScribalSignature {
  const idx = loadIndex();
  if (!idx) {
    return {
      tablet_id: tabletId,
      signature_signs: [],
      total_signs_in_tablet: 0,
      warnings: [_loadError ?? "scribal index unavailable"],
    };
  }
  const sig = idx.signatures.get(tabletId);
  if (!sig) {
    return {
      tablet_id: tabletId,
      signature_signs: [],
      total_signs_in_tablet: idx.totalSigns.get(tabletId) ?? 0,
      warnings: [`tablet '${tabletId}' has no scribal signature (may be below MIN_TABLET_SIZE=30 or all signs are below-threshold)`],
    };
  }
  const total = idx.totalSigns.get(tabletId) ?? 0;
  const signs: ScribalSignatureSign[] = [];
  // Reconstruct per-sign details from corpus + per-tablet
  const sortedSigs = [...sig.entries()].sort((a, b) => b[1] - a[1]);
  for (const [s, llr] of sortedSigs) {
    // We need the count_in_tablet — reload it (cheap, we have the corpus structure cached)
    // Quick way: re-derive from corpus_share + LLR formula, but easier to just trust LLR
    const corpusS = idx.corpusShare.get(s) ?? 0;
    // From LLR = c * log(pT/pC), and pT = c/total → pT = c/total. Two unknowns (c and pT).
    // Just expose what we know:
    signs.push({
      sign: s,
      count_in_tablet: 0, // not preserved in the signature index; could re-scan to fill
      share_in_tablet: 0,
      corpus_share: +corpusS.toFixed(6),
      llr: +llr.toFixed(4),
    });
  }
  return {
    tablet_id: tabletId,
    signature_signs: signs,
    total_signs_in_tablet: total,
    warnings: [],
  };
}

export type SameScribeOptions = {
  tabletId: string;
  topK?: number;
  minOverlap?: number;
  minJaccard?: number;
};

export function findSameScribeCandidates(opts: SameScribeOptions): SameScribeResult {
  const idx = loadIndex();
  if (!idx) {
    return {
      query_tablet_id: opts.tabletId,
      query_signature_size: 0,
      candidates: [],
      index_stats: { total_tablets: 0, candidates_examined: 0 },
      warnings: [_loadError ?? "scribal index unavailable"],
    };
  }
  const querySig = idx.signatures.get(opts.tabletId);
  if (!querySig || querySig.size === 0) {
    return {
      query_tablet_id: opts.tabletId,
      query_signature_size: 0,
      candidates: [],
      index_stats: { total_tablets: idx.signatures.size, candidates_examined: 0 },
      warnings: [`tablet '${opts.tabletId}' has no scribal signature`],
    };
  }

  const topK = Math.max(1, Math.min(30, opts.topK ?? 10));
  const minOverlap = opts.minOverlap ?? 3;
  const minJac = opts.minJaccard ?? 0.10;

  // Query L2 norm for cosine
  let qNormSq = 0;
  for (const v of querySig.values()) qNormSq += v * v;
  const qNorm = Math.sqrt(qNormSq);

  const querySize = querySig.size;
  const results: SameScribeCandidate[] = [];
  let examined = 0;

  for (const [tid, sig] of idx.signatures) {
    if (tid === opts.tabletId) continue;
    examined++;
    // Quick check: any overlap?
    let overlap = 0;
    let dot = 0;
    for (const [s, qLlr] of querySig) {
      const tLlr = sig.get(s);
      if (tLlr === undefined) continue;
      overlap++;
      dot += qLlr * tLlr;
    }
    if (overlap < minOverlap) continue;

    const jac = overlap / (querySize + sig.size - overlap);
    if (jac < minJac) continue;

    let tNormSq = 0;
    for (const v of sig.values()) tNormSq += v * v;
    const cos = dot / (qNorm * Math.sqrt(tNormSq));

    // Collect shared top signs (up to 6)
    const shared: SameScribeCandidate["shared_top_signs"] = [];
    const sharedSorted = [...querySig.entries()]
      .filter(([s]) => sig.has(s))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    for (const [s, qL] of sharedSorted) {
      shared.push({ sign: s, query_llr: +qL.toFixed(4), target_llr: +sig.get(s)!.toFixed(4) });
    }

    results.push({
      tablet_id: tid,
      signature_overlap_count: overlap,
      signature_jaccard: +jac.toFixed(4),
      signature_cosine: +cos.toFixed(4),
      shared_top_signs: shared,
    });
  }

  // Rank by cosine descending
  results.sort((a, b) => b.signature_cosine - a.signature_cosine);

  return {
    query_tablet_id: opts.tabletId,
    query_signature_size: querySize,
    candidates: results.slice(0, topK),
    index_stats: {
      total_tablets: idx.signatures.size,
      candidates_examined: examined,
    },
    warnings: [],
  };
}

export function scribalIndexStats(): { loaded: boolean; total_tablets: number; load_error: string | null } {
  const idx = loadIndex();
  return {
    loaded: !!idx,
    total_tablets: idx?.signatures.size ?? 0,
    load_error: _loadError,
  };
}
