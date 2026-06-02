#!/usr/bin/env bash
# ProtoSnap sidecar setup — builds the torch venv this MCP shells out to.
#
# HONESTY: this is the GATED LAYER 2. It installs a real, runnable per-sign
# ALIGNMENT sidecar — NOT a tablet-photo sign detector. ProtoSnap aligns a known
# sign's prototype skeleton onto a PRE-CROPPED, PRE-IDENTIFIED single-sign crop.
# It does not find/segment/label signs on a full tablet.
#
# LICENSING: the ProtoSnap repo + its SD2-1/ControlNet weights are UNLICENSED
# (no license card). This script CLONES/DOWNLOADS them into the local cache at
# YOUR direction — the MCP repo only CALLS the sidecar, it never CONTAINS the
# repo or weights. Commercial use is UNCONFIRMED; that is your responsibility.
# See SETUP.md.
#
# Nothing here is committed: the venv, the ProtoSnap clone, and the weights all
# live under scripts/protosnap/.venv + .cache and are gitignored.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.venv"
PROTOSNAP_DIR="$HERE/.cache/ProtoSnap"
WEIGHTS_DIR="$HERE/.cache/weights"

# 1) Locate Homebrew python3.11 (verified-working: torch 2.2.1 cp311 arm64 wheel).
PY311="${PROTOSNAP_PY311:-/opt/homebrew/bin/python3.11}"
if [ ! -x "$PY311" ]; then
  echo "ERROR: python3.11 not found at $PY311." >&2
  echo "Install it: brew install python@3.11  (or set PROTOSNAP_PY311=/path/to/python3.11)" >&2
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
echo "[2/5] Installing pinned requirements (torch 2.2.1 + diffusers 0.27.2 + ...)"
pip install -r "$HERE/requirements.txt"

# Sanity: torch imports and MPS is available on Apple Silicon.
python - <<'PY'
import torch
print(f"[2/5] torch {torch.__version__}; mps_available={torch.backends.mps.is_available()}")
PY

# 3) Clone the (unlicensed) ProtoSnap repo into the cache — NOT committed.
mkdir -p "$HERE/.cache" "$WEIGHTS_DIR"
if [ ! -d "$PROTOSNAP_DIR/.git" ]; then
  echo "[3/5] Cloning ProtoSnap into $PROTOSNAP_DIR (unlicensed upstream — your responsibility)"
  git clone https://github.com/rbturnbull/protosnap.git "$PROTOSNAP_DIR" 2>/dev/null \
    || git clone https://github.com/ProtoSnap/ProtoSnap.git "$PROTOSNAP_DIR" 2>/dev/null \
    || {
      echo "WARN: could not auto-clone ProtoSnap. Clone the ICLR-2025 ProtoSnap repo" >&2
      echo "      manually into $PROTOSNAP_DIR, then re-run this script." >&2
    }
fi

# 4) Apply the one-line dift.py MPS patch (line ~15 hardcodes cuda-or-cpu and
#    never selects MPS → silent CPU fallback on Apple Silicon). The file already
#    has MPS dtype branches, so this is low-risk. Best-effort; idempotent.
DIFT="$PROTOSNAP_DIR/src/dift.py"
if [ -f "$DIFT" ]; then
  if grep -q "torch.backends.mps.is_available" "$DIFT"; then
    echo "[4/5] dift.py already MPS-aware — skipping patch."
  else
    echo "[4/5] Patching dift.py device selection to prefer MPS on Apple Silicon."
    python - "$DIFT" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
# Replace a hardcoded "cuda" if available else "cpu" with an mps-aware ladder.
s2 = re.sub(
    r"['\"]cuda['\"]\s+if\s+torch\.cuda\.is_available\(\)\s+else\s+['\"]cpu['\"]",
    "('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')",
    s,
)
if s2 != s:
    open(p, "w", encoding="utf-8").write(s2)
    print("   patched device-selection expression.")
else:
    print("   no hardcoded cuda/cpu expression found — manual review may be needed.")
PY
  fi
else
  echo "[4/5] dift.py not present yet (ProtoSnap not cloned). Re-run after cloning."
fi

# 5) Download the SD2-1 / ControlNet weights into the cache (multi-GB, gdown).
#    UNVERIFIED end-to-end in recon (recon did not pull the multi-GB weights).
#    No license card on these weights — your responsibility. See SETUP.md.
echo "[5/5] Weights: run the gdown step in SETUP.md to populate $WEIGHTS_DIR"
echo "      (the multi-GB SD2-1 / ControlNet checkpoints are NOT auto-pulled here"
echo "       to avoid a surprise multi-GB download; SETUP.md has the exact gdown cmd)."

echo
echo "Done. The MCP align_sign_prototype tool will now find: $VENV/bin/python"
echo "Reminder: this is per-sign ALIGNMENT on a PRE-CROPPED crop — NOT tablet-photo sign detection."
