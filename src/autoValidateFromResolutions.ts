// v0.64.0 — auto_validate_from_resolutions (T1-B from post-JOHD upgrade plan).
//
// **PROPOSAL-ONLY MODE.** Reads the active-learning queue, applies external-
// anchor rules sourced ONLY from the methods paper (§3.6 / §3.7.3 / §3.11),
// writes a proposals file to `docs/auto-validation-proposals-<iso-ts>.md`,
// and NEVER mutates `~/.cache/cuneiform-mcp/validation-resolutions.json`.
//
// Safety contract (load-bearing):
//   1. Mode parameter MUST be exactly "propose". Any other value throws.
//   2. The validation-resolutions store is read-only here. Its mtime is
//      captured before and after the run and surfaced in the result — tests
//      assert mtime is unchanged.
//   3. Rules MUST come from external (methods-paper) anchors, never from
//      current model output. Tainting the labeled set with model bias
//      defeats the purpose of the v1.0 ≥100-labeled-pair gate.
//
// What the tool produces:
//   - Pairing each top-K active-learning queue tablet with the §3.6 bi-orphan
//     anchor IM.49220 → NEGATIVE proposals (IM.49220 has no siblings, so any
//     pair with it is by definition unrelated).
//   - §3.7.3 K.5896 ↔ K.6683 → POSITIVE (closest sibling, 76 shared chunks).
//   - §3.11 BM.47463 ↔ CBS.6060 → POSITIVE (commentary quotes base text).
//
// The proposals file is for the operator to review; if accepted, they hand-
// invoke record_validation_resolution per pair to actually mutate the store.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { prioritizeValidationQueue } from "./validationQueue.js";
import { resolutionsCachePath, canonicalPairId, loadResolutionsStore } from "./validationResolutions.js";
import { countSharedChunks } from "./chunkIndex.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ProposalVerdict = "positive" | "negative";

export type Proposal = {
  pair_id: string;
  tablet_a: string;
  tablet_b: string;
  verdict: ProposalVerdict;
  rule_id: string;
  source_doc: string;
  anchor_text: string;
};

export type RuleSummary = {
  rule_id: string;
  source_doc: string;
  anchor: string;
  proposals_generated: number;
};

export type AutoValidateOptions = {
  /** MUST be "propose". Any other value throws. Load-bearing safety. */
  mode: "propose";
  /** Top-K from prioritize_validation_queue to pair against the bi-orphan anchor. Default 20. */
  topK?: number;
  /**
   * Test-only override: skip prioritize_validation_queue and use this list
   * of candidate tablets instead. Not exposed in the MCP surface.
   */
  candidate_tablets?: string[];
  /**
   * Override for the directory the proposal file is written into. Defaults
   * to <repo>/docs. Used by tests to redirect into a tmpdir.
   */
  output_dir?: string;
  /**
   * Opt-in: run RULE_D (composition-sibling proposals). Default false to
   * preserve the v0.64 anchor-only contract exactly. When true, proposes
   * candidate↔anchor positives justified by an INDEPENDENT signal (eBL genre
   * leaf-match OR chunk-overlap ≥ threshold), with identify_composition used
   * only as a candidate pre-filter. v0.71.
   */
  include_composition_siblings?: boolean;
  /** Min shared length-20 chunks with the anchor for RULE_D chunk-evidence. Default 15. */
  composition_sibling_threshold?: number;
  /** Min identify_composition confidence for a RULE_D candidate pre-filter. Default 0.95. */
  composition_sibling_min_conf?: number;
};

export type AutoValidateResult = {
  mode: "propose";
  proposal_file_path: string;
  proposals: Proposal[];
  proposed_positives: number;
  proposed_negatives: number;
  rules_applied: RuleSummary[];
  validation_store_path: string;
  validation_store_mtime_before: string | null;
  validation_store_mtime_after: string | null;
  validation_store_mtime_unchanged: boolean;
  warnings: string[];
};

// ─── External-anchor rules (methods-paper sections ONLY) ───────────────────

const RULE_A_BIOPRHAN_ANCHOR = "IM.49220";
const RULE_A_SOURCE = "methods paper §3.6 (final-1 bi-orphans, v0.19 amendment)";
const RULE_A_TEXT =
  "IM.49220 is the corpus's only confirmed final-1 bi-orphan (no chunk-sharing siblings detected). Any pair containing IM.49220 is therefore NEGATIVE by definition.";

const RULE_B_PAIR: [string, string] = ["K.5896", "K.6683"];
const RULE_B_SOURCE = "methods paper §3.7.3 (K.6683 sibling amendment)";
const RULE_B_TEXT =
  "K.6683 is K.5896's closest sibling — 76 shared length-20 chunks vs K.9508's 65. Confirmed POSITIVE sibling pair (both Mīs pî manuscripts).";

const RULE_C_PAIR: [string, string] = ["BM.47463", "CBS.6060"];
const RULE_C_SOURCE = "methods paper §3.11 (commentary quotes base text)";
const RULE_C_TEXT =
  "BM.47463 (Šurpu commentary, genre-tagged 'Commentary') quotes CBS.6060 (Šurpu base text) — long contiguous run (108 trigram positions) reclassified from physical_join_candidate to commentary_quotes_base_text. Confirmed POSITIVE related pair.";

const NEVER_PAIR_WITH_BIORPHAN = new Set<string>([
  RULE_A_BIOPRHAN_ANCHOR,
  RULE_B_PAIR[0],
  RULE_B_PAIR[1],
  RULE_C_PAIR[0],
  RULE_C_PAIR[1],
]);

// ─── RULE D — composition-sibling proposals (v0.71, opt-in) ────────────────
//
// PROVENANCE / safety: identify_composition is a model, so it is used ONLY as a
// candidate pre-filter (conf ≥ min_conf). The LABEL rests on an INDEPENDENT
// signal, never on model confidence:
//   (1) eBL editorial genre leaf names the same composition — editorial ground
//       truth, external to every KV model; OR
//   (2) the candidate shares ≥ threshold length-20 chunks with a confirmed
//       same-composition anchor — direct textual evidence, the same evidence
//       class as the §3.7.3 anchor (K.5896↔K.6683 = 76 shared chunks).
// Threshold calibrated 2026-05-29 against the store: all 30 known negatives
// share 0 chunks; strong positives share 29–76 → any T in 12–28 separates
// cleanly; 15 chosen (high-precision midpoint). Still PROPOSE-ONLY — the
// operator confirms each pair before record_validation_resolution mutates the
// store, so a stray formulaic-chunk false positive dies at review.

const RULE_D_ID = "RULE_D_COMPOSITION_SIBLING";
const RULE_D_SOURCE = "docs/upgrade-plan-post-v0.69.md (A2 step 2); calibration vs validation store 2026-05-29";

// Per-composition eBL genre-leaf matchers (does the editorial genre name THIS composition?).
const COMPOSITION_LEAF: Record<string, RegExp> = {
  mis_pi: /m[iī]s ?p[iî]|mouth.?(wash|open)/i,
  udug_hul: /udug.?[hḫ]ul|utukk/i,
  surpu: /šurpu|surpu/i,
  bit_sala_me: /b[iī]t sal[aā]|sal[aā].?m[eê]/i,
  enuma_anu_enlil: /en[uū]ma anu|EAE/i,
};

type CachedAssignment = {
  top_composition_id?: string;
  confidence?: number;
  is_in_exemplar_list?: boolean;
  primary_genre?: string;
};

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache/cuneiform-mcp");
}

function loadCompositionAssignments(): Record<string, CachedAssignment> | null {
  const path = join(cacheDir(), "composition-assignments.json");
  if (!existsSync(path)) return null;
  try {
    const j = JSON.parse(readFileSync(path, "utf-8"));
    return (j.assignments ?? null) as Record<string, CachedAssignment> | null;
  } catch {
    return null;
  }
}

/**
 * Pure RULE_D decision: should this candidate be proposed as a positive sibling
 * of `anchor`? Returns the justification text when a corroborating signal fires,
 * else null. Model confidence is the pre-filter only — it never appears in the
 * justification. NB (v0.73 honesty correction): genre-leaf-match IS independent
 * of every model (eBL editorial), but chunk-overlap is PARTIALLY model-entangled
 * (identify_composition is chunk-weighted) — so this is a propose-only generator
 * whose hits a human must confirm, not a fully independent check. Exported for
 * hermetic unit testing.
 */
export function compositionSiblingProposal(args: {
  candidate: string;
  anchor: string;
  composition: string;
  genreLeafMatch: boolean;
  sharedChunks: number;
  threshold: number;
}): { verdict: "positive"; anchor_text: string } | null {
  const { candidate, anchor, composition, genreLeafMatch, sharedChunks, threshold } = args;
  if (candidate === anchor) return null;
  const chunkEvidence = sharedChunks >= threshold;
  if (!genreLeafMatch && !chunkEvidence) return null;
  const signals: string[] = [];
  if (genreLeafMatch) signals.push(`eBL genre leaf names ${composition} (editorial ground truth)`);
  if (chunkEvidence) signals.push(`shares ${sharedChunks} length-20 chunks with anchor ${anchor} (≥${threshold} threshold; cf. §3.7.3 K.5896↔K.6683=76)`);
  return {
    verdict: "positive",
    anchor_text: `Composition-sibling of ${anchor} (${composition}). Independent evidence: ${signals.join("; ")}. identify_composition used as pre-filter only.`,
  };
}

// ─── Repo-relative paths ───────────────────────────────────────────────────

function defaultOutputDir(): string {
  // <repo>/docs — derived from this module's path: src/autoValidateFromResolutions.ts → ../docs
  const here = dirname(fileURLToPath(import.meta.url));
  // After build, dist/autoValidateFromResolutions.js → ../docs is correct.
  return join(here, "..", "docs");
}

function sanitizeTimestamp(iso: string): string {
  return iso.replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");
}

function safeMtime(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function autoValidateFromResolutions(
  opts: AutoValidateOptions,
): AutoValidateResult {
  // ── Safety assertion 1: mode must be exactly "propose" ───────────────────
  if (opts.mode !== "propose") {
    throw new Error(
      `auto_validate_from_resolutions: mode must be "propose" (got ${JSON.stringify(opts.mode)}). This tool is proposal-only by design — it never mutates ~/.cache/cuneiform-mcp/validation-resolutions.json.`,
    );
  }

  const warnings: string[] = [];
  const storePath = resolutionsCachePath();
  const mtimeBefore = safeMtime(storePath);

  // ── Source candidate tablets ─────────────────────────────────────────────
  const topK = opts.topK ?? 20;
  let candidates: string[];
  if (opts.candidate_tablets) {
    candidates = opts.candidate_tablets;
  } else {
    try {
      const q = prioritizeValidationQueue({ topK, scope: "all" });
      for (const w of q.warnings) warnings.push(`prioritize_validation_queue: ${w}`);
      candidates = q.queue.map((e) => e.tablet_id);
    } catch (e) {
      warnings.push(
        `prioritize_validation_queue failed: ${e instanceof Error ? e.message : String(e)}; proceeding with anchor-only rules`,
      );
      candidates = [];
    }
  }

  // ── Apply rules ──────────────────────────────────────────────────────────
  const proposals: Proposal[] = [];
  const seenPairIds = new Set<string>();

  // Rule A: IM.49220 paired with each top-K queue tablet → NEGATIVE
  let ruleAHits = 0;
  for (const t of candidates) {
    if (t === RULE_A_BIOPRHAN_ANCHOR) continue;
    if (NEVER_PAIR_WITH_BIORPHAN.has(t)) continue;
    const pairId = canonicalPairId(RULE_A_BIOPRHAN_ANCHOR, t);
    if (seenPairIds.has(pairId)) continue;
    seenPairIds.add(pairId);
    proposals.push({
      pair_id: pairId,
      tablet_a: RULE_A_BIOPRHAN_ANCHOR,
      tablet_b: t,
      verdict: "negative",
      rule_id: "RULE_A_FINAL1_BIOPRHAN",
      source_doc: RULE_A_SOURCE,
      anchor_text: RULE_A_TEXT,
    });
    ruleAHits++;
  }

  // Rule B: K.5896 ↔ K.6683 → POSITIVE
  let ruleBHits = 0;
  const pairBId = canonicalPairId(RULE_B_PAIR[0], RULE_B_PAIR[1]);
  if (!seenPairIds.has(pairBId)) {
    seenPairIds.add(pairBId);
    proposals.push({
      pair_id: pairBId,
      tablet_a: RULE_B_PAIR[0],
      tablet_b: RULE_B_PAIR[1],
      verdict: "positive",
      rule_id: "RULE_B_K6683_SIBLING",
      source_doc: RULE_B_SOURCE,
      anchor_text: RULE_B_TEXT,
    });
    ruleBHits++;
  }

  // Rule C: BM.47463 ↔ CBS.6060 → POSITIVE
  let ruleCHits = 0;
  const pairCId = canonicalPairId(RULE_C_PAIR[0], RULE_C_PAIR[1]);
  if (!seenPairIds.has(pairCId)) {
    seenPairIds.add(pairCId);
    proposals.push({
      pair_id: pairCId,
      tablet_a: RULE_C_PAIR[0],
      tablet_b: RULE_C_PAIR[1],
      verdict: "positive",
      rule_id: "RULE_C_COMMENTARY_QUOTES_BASE",
      source_doc: RULE_C_SOURCE,
      anchor_text: RULE_C_TEXT,
    });
    ruleCHits++;
  }

  // Rule D (opt-in): composition-sibling positives from corroborating evidence
  // (genre-leaf-match = independent eBL editorial; chunk-overlap = partially
  // model-entangled). Propose-only; every hit is human-confirmed before G2.
  let ruleDHits = 0;
  const threshold = opts.composition_sibling_threshold ?? 15;
  const minConf = opts.composition_sibling_min_conf ?? 0.95;
  if (opts.include_composition_siblings) {
    const assignments = loadCompositionAssignments();
    if (!assignments) {
      warnings.push("RULE_D: composition-assignments.json not found — skipped. Run scripts/build-corpus-composition-assignments.mjs.");
    } else {
      const store = loadResolutionsStore();
      const posTablets = new Set<string>();
      for (const r of store.resolutions) if (r.verdict === "positive") { posTablets.add(r.tablet_a); posTablets.add(r.tablet_b); }
      const inStore = new Set<string>();
      for (const r of store.resolutions) { inStore.add(r.tablet_a); inStore.add(r.tablet_b); }
      // Per-composition anchor = highest-conf store-positive tablet of that comp (conf ≥ 0.7), comp must have a leaf matcher.
      const anchors: Record<string, { tablet: string; conf: number }> = {};
      for (const t of posTablets) {
        const a = assignments[t];
        if (!a || !a.top_composition_id || !COMPOSITION_LEAF[a.top_composition_id]) continue;
        const c = a.top_composition_id;
        const conf = a.confidence ?? 0;
        if (conf >= 0.7 && (!anchors[c] || conf > anchors[c].conf)) anchors[c] = { tablet: t, conf };
      }
      // Candidates: high-conf, not in registry, not already in store.
      for (const [t, a] of Object.entries(assignments)) {
        const comp = a.top_composition_id;
        if (!comp || !anchors[comp]) continue;
        if ((a.confidence ?? 0) < minConf || a.is_in_exemplar_list || inStore.has(t)) continue;
        const anchor = anchors[comp].tablet;
        const genreLeafMatch = COMPOSITION_LEAF[comp].test(a.primary_genre ?? "");
        const sharedChunks = countSharedChunks(t, anchor);
        const decision = compositionSiblingProposal({ candidate: t, anchor, composition: comp, genreLeafMatch, sharedChunks, threshold });
        if (!decision) continue;
        const pairId = canonicalPairId(t, anchor);
        if (seenPairIds.has(pairId)) continue;
        seenPairIds.add(pairId);
        proposals.push({
          pair_id: pairId,
          tablet_a: t,
          tablet_b: anchor,
          verdict: "positive",
          rule_id: RULE_D_ID,
          source_doc: RULE_D_SOURCE,
          anchor_text: decision.anchor_text,
        });
        ruleDHits++;
      }
    }
  }

  const rulesApplied: RuleSummary[] = [
    {
      rule_id: "RULE_A_FINAL1_BIOPRHAN",
      source_doc: RULE_A_SOURCE,
      anchor: RULE_A_BIOPRHAN_ANCHOR,
      proposals_generated: ruleAHits,
    },
    {
      rule_id: "RULE_B_K6683_SIBLING",
      source_doc: RULE_B_SOURCE,
      anchor: `${RULE_B_PAIR[0]} ↔ ${RULE_B_PAIR[1]}`,
      proposals_generated: ruleBHits,
    },
    {
      rule_id: "RULE_C_COMMENTARY_QUOTES_BASE",
      source_doc: RULE_C_SOURCE,
      anchor: `${RULE_C_PAIR[0]} ↔ ${RULE_C_PAIR[1]}`,
      proposals_generated: ruleCHits,
    },
    ...(opts.include_composition_siblings
      ? [{
          rule_id: RULE_D_ID,
          source_doc: RULE_D_SOURCE,
          anchor: `genre-leaf-match OR shared-chunks≥${threshold} (min_conf ${minConf})`,
          proposals_generated: ruleDHits,
        }]
      : []),
  ];

  // ── Write proposal file ──────────────────────────────────────────────────
  const generatedAt = new Date().toISOString();
  const stamp = sanitizeTimestamp(generatedAt);
  const outDir = opts.output_dir ?? defaultOutputDir();
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const proposalPath = join(outDir, `auto-validation-proposals-${stamp}.md`);

  const positives = proposals.filter((p) => p.verdict === "positive");
  const negatives = proposals.filter((p) => p.verdict === "negative");

  writeFileSync(proposalPath, renderMarkdown({
    generated_at: generatedAt,
    candidate_count: candidates.length,
    proposals,
    positives,
    negatives,
    rulesApplied,
    warnings,
  }));

  // ── Safety assertion 2: validation store mtime unchanged ─────────────────
  const mtimeAfter = safeMtime(storePath);
  const mtimeUnchanged = mtimeBefore === mtimeAfter;
  if (!mtimeUnchanged) {
    warnings.push(
      `SAFETY VIOLATION: validation-resolutions.json mtime changed (${mtimeBefore} -> ${mtimeAfter}). This tool must not write to the store. Investigate immediately.`,
    );
  }

  return {
    mode: "propose",
    proposal_file_path: proposalPath,
    proposals,
    proposed_positives: positives.length,
    proposed_negatives: negatives.length,
    rules_applied: rulesApplied,
    validation_store_path: storePath,
    validation_store_mtime_before: mtimeBefore,
    validation_store_mtime_after: mtimeAfter,
    validation_store_mtime_unchanged: mtimeUnchanged,
    warnings,
  };
}

// ─── Markdown rendering ────────────────────────────────────────────────────

function renderMarkdown(payload: {
  generated_at: string;
  candidate_count: number;
  proposals: Proposal[];
  positives: Proposal[];
  negatives: Proposal[];
  rulesApplied: RuleSummary[];
  warnings: string[];
}): string {
  const lines: string[] = [];
  lines.push(`# auto-validation proposals — ${payload.generated_at}`);
  lines.push("");
  lines.push("**PROPOSAL-ONLY MODE.** None of these labels have been written to `~/.cache/cuneiform-mcp/validation-resolutions.json`. Review each proposal below, then hand-invoke `record_validation_resolution` for any you accept.");
  lines.push("");
  lines.push(`- **Generated:** ${payload.generated_at}`);
  lines.push(`- **Candidate tablets pulled from queue:** ${payload.candidate_count}`);
  lines.push(`- **Proposals:** ${payload.proposals.length} (${payload.positives.length} positive, ${payload.negatives.length} negative)`);
  lines.push("");
  lines.push("## Rules applied");
  lines.push("");
  for (const r of payload.rulesApplied) {
    lines.push(`### ${r.rule_id}`);
    lines.push(`- **Source:** ${r.source_doc}`);
    lines.push(`- **Anchor:** ${r.anchor}`);
    lines.push(`- **Proposals generated:** ${r.proposals_generated}`);
    lines.push("");
  }
  if (payload.positives.length > 0) {
    lines.push("## Proposed positives");
    lines.push("");
    for (const p of payload.positives) {
      lines.push(`### ${p.pair_id}`);
      lines.push(`- **Rule:** ${p.rule_id}`);
      lines.push(`- **Source:** ${p.source_doc}`);
      lines.push(`- **Anchor:** ${p.anchor_text}`);
      lines.push("");
    }
  }
  if (payload.negatives.length > 0) {
    lines.push("## Proposed negatives");
    lines.push("");
    for (const p of payload.negatives) {
      lines.push(`- \`${p.pair_id}\` — ${p.rule_id} — ${p.source_doc}`);
    }
    lines.push("");
  }
  if (payload.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of payload.warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  return lines.join("\n");
}
