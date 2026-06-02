#!/usr/bin/env node
// EvaCun 2025 token-prediction benchmark — HONEST GATED harness.
//
// This is benchmark-script-only (no MCP tool; tool count stays 115). It mirrors
// the ProtoSnap-Layer-2 gating pattern: it CALLS scripts/evacun/predict_masked.py
// via execFile (fixed argv, absolute venv-python path, timeout) and NEVER throws.
//
// It prints the scored EvaCun accuracy + top-3 NEXT TO the published references —
// OR, when either of the two gates is unmet, prints data_available:false /
// inference_available:false with the EXACT fetch+setup instructions. It NEVER
// emits a fabricated state-of-the-art-beating number.
//
// TWO GATES (see scripts/evacun/SETUP.md for the full provenance writeup):
//   DATA  — the real EvaCun masked-WORD token-prediction files are organizer-
//           distributed and have NO public DOI. The Zenodo DOI in circulation
//           (10.5281/zenodo.17220687) is a DIFFERENT artifact (an MT parallel
//           corpus with no [MASK]/word-index/gold/metric — SHA256-verified in
//           recon). Until train/valid token-list files exist in the gitignored
//           cache, this prints data_available:false.
//   MODEL — SLAB-NLP/Akk (MIT) ships NO weights; it must be fine-tuned from its
//           in-repo ORACC data into scripts/evacun/weights with the eval split
//           EXCLUDED. Until a checkpoint exists, the sidecar reports
//           inference_available:false.
//
// PUBLISHED REFERENCES (Gordin/Sahala/Spencer/Klein, ACL ALP 2025 — these ARE the
// genuine token-prediction task figures and ARE accurate):
//   majority baseline ........ 0.04
//   best single model (Mistral) 0.221
//   ensemble ................. 0.269   (top-3 0.377)

import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const EVACUN_DIR = join(HERE, "evacun");
const VENV_PY = join(EVACUN_DIR, ".venv", "bin", "python");
const SIDECAR = join(EVACUN_DIR, "predict_masked.py");
const CORPUS_DIR = join(EVACUN_DIR, ".cache", "corpus");

// Pre-existing gap/lacuna tokens — excluded from masking AND scoring so the model
// is never credited for "predicting" a lacuna (bridge guard 5).
const GAP_TOKENS = new Set(["...", "x", "X", "…", "[...]", "[…]"]);

const REFERENCES = {
  majority_baseline: 0.04,
  best_single_model_mistral: 0.221,
  ensemble: 0.269,
  ensemble_top3: 0.377,
};

const MASK_RATE = 0.15;
const RNG_SEED = 20260602;

// Mulberry32 deterministic RNG (same family as benchmark-lacuna-bleu.mjs).
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function printReferences() {
  console.log(`Published EvaCun 2025 references (Gordin/Sahala/Spencer/Klein, ACL ALP 2025):`);
  console.log(`  majority baseline ........... ${REFERENCES.majority_baseline.toFixed(3)}`);
  console.log(`  best single model (Mistral) . ${REFERENCES.best_single_model_mistral.toFixed(3)}`);
  console.log(`  ensemble .................... ${REFERENCES.ensemble.toFixed(3)}  (top-3 ${REFERENCES.ensemble_top3.toFixed(3)})`);
}

function gateMessage({ data, model }) {
  console.log(``);
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`EvaCun token-prediction benchmark — GATED (no faithful score emitted)`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`  data_available:      ${data.available}`);
  console.log(`  inference_available: ${model.available}`);
  console.log(``);
  if (!data.available) {
    console.log(`DATA gate UNMET — ${data.reason}`);
    console.log(`  The real EvaCun masked-WORD token-prediction files are organizer-`);
    console.log(`  distributed and have NO public DOI. The Zenodo DOI in circulation`);
    console.log(`  (10.5281/zenodo.17220687) resolves to a DIFFERENT artifact — an MT`);
    console.log(`  parallel corpus with NO [MASK]/word-index/gold/accuracy (verified).`);
    console.log(`  To clear: obtain train/valid token-list files from the EvaCun 2025`);
    console.log(`  organizers (Gordin/Sahala/Spencer/Klein, ufal.mff.cuni.cz / the task`);
    console.log(`  repo) and place them under:`);
    console.log(`    ${CORPUS_DIR}/`);
    console.log(`  (see scripts/evacun/SETUP.md). NEVER substitute the Zenodo MT corpus.`);
    console.log(``);
  }
  if (!model.available) {
    console.log(`MODEL gate UNMET — ${model.reason}`);
    console.log(`  SLAB-NLP/Akk (MIT) ships no weights; fine-tune a checkpoint into`);
    console.log(`    ${join(EVACUN_DIR, "weights")}/`);
    console.log(`  from the TRAIN split with the eval split EXCLUDED (else contaminated).`);
    console.log(`  To build the sidecar venv: bash scripts/evacun/setup.sh`);
    if (model.hint) console.log(`  ${model.hint}`);
    console.log(``);
  }
  printReferences();
  console.log(``);
  console.log(`No accuracy is reported because at least one gate is unmet. This is the`);
  console.log(`intended honest behaviour — a mis-scored, inflated state-of-the-art`);
  console.log(`number is exactly the overclaim this harness exists to prevent.`);
}

// ── Parse organizer token-list files into masked examples. ───────────────────
// The genuine EvaCun token files carry: document id, line number, word index,
// language, the word, and (for masked positions) the gold. We support a permissive
// JSONL/TSV reader so that whatever the organizers ship can be adapted by editing
// ONLY this function. Until those files exist we never reach here.
//
// Returns { examples: [{doc_id, line_no, masked_word_index, line_tokens[], gold_word}], split, n_lines }.
function parseCorpusFiles(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /\.(tsv|jsonl|json|txt)$/i.test(f));
  if (files.length === 0) return null;

  // Prefer a held-out validation file (gold available, model did NOT train on it).
  const valid = files.find((f) => /valid|dev|test|held/i.test(f));
  const chosen = valid ?? files[0];
  const split = valid ? "validation (held-out)" : `${chosen} (PROVENANCE UNVERIFIED — confirm not in train)`;
  const raw = readFileSync(join(dir, chosen), "utf-8");

  // This adapter is intentionally a STUB shape: the precise column/field layout
  // of the organizer files is not publicly documented, so we cannot finalise it
  // without the real files. When they arrive, map them to the example shape here.
  // We DO NOT guess a layout and silently produce examples — that would risk the
  // exact mis-scoring overclaim. Return a sentinel so the driver reports the data
  // gate as "files present but layout unconfirmed".
  void raw;
  return {
    examples: [],
    split,
    n_lines: 0,
    layout_unconfirmed: true,
    chosen_file: chosen,
  };
}

async function callSidecar(examples, split) {
  if (!existsSync(VENV_PY)) {
    return {
      inference_available: false,
      reason: `sidecar venv missing at ${VENV_PY}`,
      hint: "run: bash scripts/evacun/setup.sh",
    };
  }
  const cacheDir = mkdtempSync(join(tmpdir(), "evacun-"));
  const examplesPath = join(cacheDir, "examples.json");
  writeFileSync(examplesPath, JSON.stringify({ examples }), "utf-8");
  try {
    const { stdout } = await execFileP(
      VENV_PY,
      [SIDECAR, "--examples", examplesPath, "--split", split, "--normalization", "exact"],
      { timeout: 600000, maxBuffer: 64 * 1024 * 1024 },
    );
    const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "{}";
    return JSON.parse(line);
  } catch (err) {
    return {
      inference_available: false,
      reason: `sidecar call failed: ${err?.message ?? err}`,
      hint: "check scripts/evacun/SETUP.md; ensure the checkpoint exists",
    };
  }
}

async function main() {
  console.log(`EvaCun 2025 token-prediction benchmark — honest gated harness`);
  console.log(`seed ${RNG_SEED} · mask rate ${MASK_RATE} · sidecar: ${SIDECAR}`);
  console.log(``);

  // ── DATA gate ──
  const parsed = parseCorpusFiles(CORPUS_DIR);
  if (parsed === null) {
    gateMessage({
      data: { available: false, reason: `no token-list files in ${CORPUS_DIR}` },
      model: { available: existsSync(VENV_PY), reason: existsSync(VENV_PY) ? "venv present" : "venv missing" },
    });
    return 0;
  }
  if (parsed.layout_unconfirmed || parsed.examples.length === 0) {
    gateMessage({
      data: {
        available: false,
        reason:
          `files present (${parsed.chosen_file}) but the organizer field layout is ` +
          `unconfirmed — the parser is NOT guessing a schema (that would risk a ` +
          `mis-scored number). Wire parseCorpusFiles() to the real layout once the ` +
          `documented format is in hand.`,
      },
      model: { available: existsSync(VENV_PY), reason: existsSync(VENV_PY) ? "venv present" : "venv missing" },
    });
    return 0;
  }

  // ── Mask 15% of maskable words (excluding gap tokens), deterministic RNG. ──
  const rng = mulberry32(RNG_SEED);
  const masked = [];
  for (const ex of parsed.examples) {
    const maskable = ex.line_tokens
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => !GAP_TOKENS.has(String(t).trim()));
    for (const { i } of maskable) {
      if (rng() < MASK_RATE) {
        masked.push({
          doc_id: ex.doc_id,
          line_no: ex.line_no,
          masked_word_index: i,
          line_tokens: ex.line_tokens,
          gold_word: ex.line_tokens[i],
        });
      }
    }
  }

  // ── MODEL gate + scoring (sidecar) ──
  const result = await callSidecar(masked, parsed.split);

  if (!result.inference_available) {
    gateMessage({
      data: { available: true, reason: `parsed ${masked.length} masked examples` },
      model: { available: false, reason: result.reason ?? "inference unavailable", hint: result.hint },
    });
    return 0;
  }

  // ── BOTH gates clear → print the REAL scored number beside the references. ──
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`EvaCun token-prediction — REAL scored result`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`  split:        ${result.split}`);
  console.log(`  n_masked:     ${result.n_masked}`);
  console.log(`  device:       ${result.device}`);
  console.log(`  normalization:${result.normalization}`);
  console.log(``);
  console.log(`  accuracy ............ ${(result.accuracy * 100).toFixed(2)}%  (${result.accuracy.toFixed(4)})`);
  console.log(`  top-3 accuracy ...... ${(result.top3_accuracy * 100).toFixed(2)}%  (${result.top3_accuracy.toFixed(4)})`);
  console.log(`  majority baseline ... ${result.majority_baseline.toFixed(4)}  (this set; "${result.majority_word}")`);
  console.log(``);
  printReferences();
  console.log(``);
  console.log(`Provenance: ${JSON.stringify(result.provenance)}`);
  console.log(``);
  console.log(`NOTE on comparability: this number is comparable to the references ONLY`);
  console.log(`if scored on the genuine EvaCun masked-word eval split. If it was run on`);
  console.log(`a relabelled replication corpus, it is an "EvaCun-PROTOCOL replication",`);
  console.log(`NOT "the EvaCun benchmark", and is NOT directly comparable to 0.221/0.269`);
  console.log(`(different docs, masking RNG, and doc-id grouping). See SETUP.md.`);
  return 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    // Last-resort guard: even an unexpected failure must not throw a stack at the
    // user — print the gated envelope and exit 0.
    console.log(`EvaCun benchmark: unexpected error (${err?.message ?? err}).`);
    gateMessage({
      data: { available: false, reason: "harness error before data gate resolved" },
      model: { available: false, reason: "not reached" },
    });
    process.exit(0);
  });
