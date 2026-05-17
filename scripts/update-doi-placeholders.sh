#!/usr/bin/env bash
# Replace arXiv ID + Zenodo DOI placeholders across paper, release notes, and
# citation files, then regenerate the .tex/.html/.pdf renderings.
#
# Usage:
#   scripts/update-doi-placeholders.sh \
#     --arxiv-id 2605.12345 \
#     --zenodo-doi 10.5281/zenodo.12345678
#
# Idempotent: running twice with the same values is a no-op. Running with
# different values overwrites prior values. Pass --check to dry-run (no edits).
#
# After it finishes:
#   git diff           # review
#   git add -p && git commit -m "docs: paper IDs assigned"
#   git push

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── args ──────────────────────────────────────────────────────────────────────
ARXIV_ID=""
ZENODO_DOI=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --arxiv-id)    ARXIV_ID="$2"; shift 2 ;;
    --zenodo-doi)  ZENODO_DOI="$2"; shift 2 ;;
    --check|--dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [ -z "$ARXIV_ID" ] || [ -z "$ZENODO_DOI" ]; then
  echo "Missing required args. Need both --arxiv-id and --zenodo-doi." >&2
  echo "  e.g. $0 --arxiv-id 2605.12345 --zenodo-doi 10.5281/zenodo.12345678" >&2
  exit 2
fi

# ── format sanity (warn, don't block) ─────────────────────────────────────────
if ! echo "$ARXIV_ID" | grep -qE '^[0-9]{4}\.[0-9]{4,5}(v[0-9]+)?$'; then
  echo "warn: --arxiv-id '$ARXIV_ID' does not look like an arXiv ID (YYMM.NNNNN[vN])" >&2
fi
if ! echo "$ZENODO_DOI" | grep -qE '^10\.[0-9]+/zenodo\.[0-9]+$'; then
  echo "warn: --zenodo-doi '$ZENODO_DOI' does not look like a Zenodo DOI" >&2
fi

ARXIV_URL="https://arxiv.org/abs/$ARXIV_ID"
DOI_URL="https://doi.org/$ZENODO_DOI"

echo "Will apply:"
echo "  arXiv:  $ARXIV_ID → $ARXIV_URL"
echo "  Zenodo: $ZENODO_DOI → $DOI_URL"
[ "$DRY_RUN" = 1 ] && echo "(dry-run — no edits)"
echo

# ── files ─────────────────────────────────────────────────────────────────────
PAPER_MD="docs/methods-paper-arxiv.md"
RELEASE_MD="RELEASE-v0.18.3.md"
CITATION="CITATION.cff"

for f in "$PAPER_MD" "$RELEASE_MD" "$CITATION"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
done

# Portable in-place sed (BSD on macOS vs GNU on linux).
sed_inplace() {
  local pattern="$1"; shift
  if [ "$DRY_RUN" = 1 ]; then
    return 0
  fi
  if sed --version >/dev/null 2>&1; then
    sed -i "$pattern" "$@"      # GNU
  else
    sed -i '' "$pattern" "$@"   # BSD
  fi
}

# ── replace in paper.md ───────────────────────────────────────────────────────
# DOI placeholder line in §6 Reproducibility
sed_inplace "s|\[to be assigned by Zenodo on first release\]|$ZENODO_DOI|g" "$PAPER_MD"
# If a prior arxiv ref was injected before, refresh it; otherwise insert one
# below the License: line in the frontmatter.
if grep -q '^\*\*arXiv\*\*:' "$PAPER_MD"; then
  sed_inplace "s|^\*\*arXiv\*\*:.*|**arXiv**: [$ARXIV_ID]($ARXIV_URL)|" "$PAPER_MD"
else
  sed_inplace "/^\*\*License\*\*: CC-BY 4.0$/a\\
**arXiv**: [$ARXIV_ID]($ARXIV_URL)
" "$PAPER_MD"
fi

# ── replace in release notes ──────────────────────────────────────────────────
sed_inplace "s|arXiv:\[ID-pending\]|arXiv:$ARXIV_ID|g"       "$RELEASE_MD"
sed_inplace "s|https://arxiv.org/abs/\[pending\]|$ARXIV_URL|g" "$RELEASE_MD"
sed_inplace "s|https://doi.org/\[Zenodo-DOI-on-release\]|$DOI_URL|g" "$RELEASE_MD"

# ── replace in CITATION.cff ───────────────────────────────────────────────────
# Add an identifiers: block under the top-level keys if not already present.
if ! grep -q '^identifiers:' "$CITATION"; then
  if [ "$DRY_RUN" = 0 ]; then
    cat >> "$CITATION" <<EOF

identifiers:
  - type: doi
    value: $ZENODO_DOI
    description: "Zenodo software archive (v0.18.3)"
  - type: other
    value: "arXiv:$ARXIV_ID"
    description: "arXiv preprint of the methods paper"
EOF
  fi
else
  # Refresh existing values in-place
  sed_inplace "s|value: 10\\.5281/zenodo\\.[0-9]\\+|value: $ZENODO_DOI|g" "$CITATION"
  sed_inplace "s|value: \"arXiv:[^\"]*\"|value: \"arXiv:$ARXIV_ID\"|g"     "$CITATION"
fi

# ── regenerate renderings ─────────────────────────────────────────────────────
if [ "$DRY_RUN" = 0 ]; then
  echo "Regenerating .tex …"
  pandoc "$PAPER_MD" \
    --from markdown --to latex --standalone \
    --variable=documentclass:article \
    --variable=geometry:margin=1in \
    --variable=fontsize:11pt \
    --variable=papersize:letter \
    --variable=linkcolor:blue \
    --variable=urlcolor:blue \
    --variable=colorlinks:true \
    --output="docs/methods-paper-arxiv.tex"

  echo "Regenerating .html …"
  pandoc "$PAPER_MD" \
    --from markdown --to html5 --standalone \
    --metadata title="Four-Axis Computational Discovery in the eBL Cuneiform Corpus" \
    --output="docs/methods-paper-arxiv.html"

  if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    echo "Regenerating .pdf via headless Chrome …"
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless --disable-gpu --no-pdf-header-footer \
      --print-to-pdf="docs/methods-paper-arxiv.pdf" \
      "file://$REPO_ROOT/docs/methods-paper-arxiv.html" \
      >/dev/null 2>&1 || echo "warn: Chrome PDF render failed; .tex + .html are still updated"
  else
    echo "skip: Chrome not at standard path — .pdf not refreshed. .tex + .html are current."
  fi
fi

echo
echo "Done. Review with: git diff"
echo "Files touched:"
echo "  $PAPER_MD"
echo "  $RELEASE_MD"
echo "  $CITATION"
echo "  docs/methods-paper-arxiv.tex"
echo "  docs/methods-paper-arxiv.html"
echo "  docs/methods-paper-arxiv.pdf"
