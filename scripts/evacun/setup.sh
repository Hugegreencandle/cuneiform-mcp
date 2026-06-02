#!/usr/bin/env bash
# EvaCun sidecar setup — builds the torch venv this benchmark shells out to.
#
# HONESTY: this is an HONEST GATED harness (the ProtoSnap-Layer-2 pattern), NOT a
# printed "beats SOTA" number. TWO independent gates block a faithful EvaCun
# token-prediction accuracy and this script can only clear the MODEL gate:
#
#   (1) DATA gate (decisive, NOT cleared by this script): the EvaCun 2025
#       token-prediction shared task (Gordin/Sahala/Spencer/Klein, ACL ALP 2025)
#       masks 15% of WORDS in transliterated cuneiform and scores accuracy over
#       those positions. Its masked-word files are ORGANIZER-DISTRIBUTED and have
#       NO public download/DOI (the organizers' paper aclanthology 2025.alp-1.33
#       and the participant paper arXiv:2510.15561 describe the format only in
#       prose). The Zenodo DOI 10.5281/zenodo.17220687 in circulation resolves to
#       a DIFFERENT artifact — "EvaCun: ORACC Akkadian Parallel Corpus" v0.1
#       (Anderson, CC0): a line-aligned MACHINE-TRANSLATION corpus with NO token
#       IDs, NO line/word-index, NO language column, NO [MASK] markers, NO gold,
#       NO accuracy metric (SHA256-verified during recon). So the data needed to
#       score is NOT obtainable from the cited pointer. See SETUP.md.
#
#   (2) MODEL gate (this script CAN clear, with your data): SLAB-NLP/Akk is MIT
#       and runs on this M5 (python3.11 + torch 2.2.1 + MPS), but ships NO
#       pretrained weights — it must be FINE-TUNED from its in-repo ORACC data
#       before it can predict anything. The fine-tune step below is a STUB you
#       wire up once you have decided the train/eval split (see SETUP.md): it must
#       train on the TRAIN split ONLY and provably EXCLUDE the eval split, else the
#       accuracy is contaminated.
#
# Nothing here is committed: the venv, the SLAB clone, the checkpoint, and the
# corpus all live under scripts/evacun/.venv + .cache + weights and are gitignored.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.venv"
SLAB_DIR="$HERE/.cache/Akk"
WEIGHTS_DIR="$HERE/weights"

# 1) Locate Homebrew python3.11 (verified-working: torch 2.2.1 cp311 arm64 wheel).
PY311="${EVACUN_PY311:-/opt/homebrew/bin/python3.11}"
if [ ! -x "$PY311" ]; then
  echo "ERROR: python3.11 not found at $PY311." >&2
  echo "Install it: brew install python@3.11  (or set EVACUN_PY311=/path/to/python3.11)" >&2
  echo "NOTE: the system python3 (3.14 on this machine) has NO torch wheel — 3.11 is required." >&2
  exit 1
fi
echo "[1/5] Using python: $("$PY311" --version) at $PY311"

# 2) Create the venv + install the pinned, MPS-capable torch stack.
if [ ! -d "$VENV" ]; then
  echo "[2/5] Creating venv at $VENV"
  "$PY311" -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"
python -m pip install --upgrade pip
echo "[2/5] Installing pinned requirements (torch 2.2.1 + transformers 4.38 + ...)"
pip install -r "$HERE/requirements.txt"

# Sanity: torch imports and MPS is available on Apple Silicon.
python - <<'PY'
import torch, transformers
print(f"[2/5] torch {torch.__version__}; transformers {transformers.__version__}; "
      f"mps_available={torch.backends.mps.is_available()}")
PY

# 3) Clone the MIT SLAB-NLP/Akk repo into the cache — NOT committed.
mkdir -p "$HERE/.cache" "$WEIGHTS_DIR"
if [ ! -d "$SLAB_DIR/.git" ]; then
  echo "[3/5] Cloning SLAB-NLP/Akk (MIT) into $SLAB_DIR (cache-only by choice)"
  git clone https://github.com/SLAB-NLP/Akk.git "$SLAB_DIR" 2>/dev/null \
    || git clone https://github.com/SLAB-NLP/akkadian.git "$SLAB_DIR" 2>/dev/null \
    || {
      echo "WARN: could not auto-clone SLAB-NLP/Akk. Clone it manually into" >&2
      echo "      $SLAB_DIR, then re-run this script. (MIT-licensed; safe to derive.)" >&2
    }
fi

# 4) DATA gate — you must place the EvaCun token-prediction files in the cache.
#    These are organizer-distributed (no public DOI). The Zenodo MT corpus is the
#    WRONG artifact (see header). Expected layout once you obtain them:
#      $HERE/.cache/corpus/train.{tsv|jsonl}   (with TRAIN gold)
#      $HERE/.cache/corpus/valid.{tsv|jsonl}   (held-out eval; gold available)
#    benchmark-evacun.mjs auto-detects these and reports data_available:false
#    with this exact path list until they exist. NEVER place the Zenodo MT corpus
#    here and call it the benchmark — that would be a relabelling overclaim.
CORPUS_DIR="$HERE/.cache/corpus"
mkdir -p "$CORPUS_DIR"
if compgen -G "$CORPUS_DIR/*" > /dev/null 2>&1; then
  echo "[4/5] EvaCun corpus cache present at $CORPUS_DIR (provenance is YOUR responsibility)."
else
  echo "[4/5] EvaCun corpus cache EMPTY ($CORPUS_DIR). DATA gate UNMET."
  echo "      Obtain the real token-prediction files from the EvaCun 2025 organizers"
  echo "      (Gordin/Sahala/Spencer/Klein; see SETUP.md) and place train/valid here."
fi

# 5) MODEL gate — one-time fine-tune from SLAB-NLP/Akk's in-repo ORACC data into a
#    checkpoint, with the eval split PROVABLY EXCLUDED. This is intentionally a
#    STUB: the exact training entrypoint + the train/eval split are decisions the
#    integrator must confirm (see SETUP.md "Build the checkpoint"). Until a
#    checkpoint exists under $WEIGHTS_DIR, predict_masked.py reports
#    inference_available:false and the benchmark prints the gated envelope.
if [ -d "$WEIGHTS_DIR" ] && compgen -G "$WEIGHTS_DIR/*" > /dev/null 2>&1; then
  echo "[5/5] Checkpoint present under $WEIGHTS_DIR — MODEL gate cleared."
else
  echo "[5/5] No checkpoint under $WEIGHTS_DIR. MODEL gate UNMET."
  echo "      Run the documented fine-tune (SETUP.md). It MUST train on the TRAIN"
  echo "      split only and EXCLUDE the eval split, or the reported accuracy is"
  echo "      contaminated and meaningless."
fi

echo
echo "Done. The benchmark (scripts/benchmark-evacun.mjs) will find: $VENV/bin/python"
echo "Reminder: NO faithful EvaCun number can be printed until BOTH gates clear"
echo "(real token-prediction files in $CORPUS_DIR AND a non-contaminated checkpoint"
echo "in $WEIGHTS_DIR). Until then the harness reports exactly which gate is unmet."
