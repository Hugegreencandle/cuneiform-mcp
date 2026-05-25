# JOHD Submission Guide

Generated 2026-05-26 alongside the v0.57 release. Step-by-step for submitting the methods paper to the **Journal of Open Humanities Data** (https://openhumanitiesdata.metajnl.com).

## Why JOHD

CDLJ rejected the prior submission (2026-05-17) on the grounds that they require raw data on CDLI infrastructure — eBL transliterations don't qualify. JOHD has no such requirement and **published the eBL platform paper itself** in 2024, so eBL-derived work is structurally welcome.

JOHD is open-access, CC-BY-4.0, peer-reviewed (single-blind), and explicitly accepts **data + methodology papers** — which is exactly what cuneiform-mcp is.

## What's in this submission package

| File | Purpose |
|---|---|
| `docs/methods-paper-cdlj-submission.md` | Canonical markdown source (now updated for JOHD) |
| `docs/methods-paper-johd-submission.html` | Print-ready HTML with embedded CSS |
| `docs/_paper-print.css` | Print-friendly stylesheet |
| `data/compositions-v1.json` | Versioned composition registry (CC-BY-4.0 cited in paper) |
| `scripts/regression-audit-all-rounds.mjs` | Reproducibility entry point (49/49 PASS) |
| Zenodo DOI `10.5281/zenodo.20250520` | v0.18.3 software archive (cited as the v1.0 snapshot when paper ships) |

## Submission steps

### 1. Generate the PDF

```bash
# Option A: Browser print-to-PDF (recommended, no install needed)
open docs/methods-paper-johd-submission.html
# In browser: Cmd+P → "Save as PDF" → Save as docs/methods-paper-johd.pdf
# Settings: A4, Margins=Default, Background graphics=ON

# Option B: pandoc + LaTeX (if you have texlive installed)
brew install --cask mactex-no-gui  # ~3GB, one-time
pandoc docs/methods-paper-cdlj-submission.md \
  -o docs/methods-paper-johd.pdf \
  --pdf-engine=xelatex \
  --variable=geometry:a4paper,margin=2cm
```

### 2. Create JOHD account

Go to https://openhumanitiesdata.metajnl.com — click "Register". Use:
- **Email**: dane@kairovault.com
- **Affiliation**: Independent researcher, Narashino, Japan
- **ORCID**: register at https://orcid.org if you don't have one (5 min, free)

### 3. Initiate a submission

JOHD homepage → "Make a Submission".

**Section type**: "Data Paper" (the methodology + data + reproducibility match JOHD's data-paper format better than "Research Article")

**Title**: cuneiform-mcp v0.57 — Four-Axis Computational Discovery in the eBL Cuneiform Corpus

**Abstract**: copy from the markdown paper §Abstract. JOHD has a 250-word limit; the current abstract is ~620 words — needs trimming for the submission form. Suggested trim: drop the per-section enumeration in the abstract and keep the four contribution paragraphs.

**Keywords**: from the markdown — cuneiform; computational philology; manuscript-witness reconstruction; sign-trigram methods; sign2vec; Bayesian fusion; calibration audit; active learning; eBL.

### 4. Upload artifacts

JOHD requires:
- ✅ **Main paper** (PDF) — from step 1
- ✅ **Data Accessibility Statement** — already in the paper after the Abstract
- ✅ **Reuse Considerations** — already in the paper after Data Accessibility
- ✅ **License declaration** — CC-BY-4.0 (declared in paper front matter)
- ✅ **Software/data DOI** — Zenodo `10.5281/zenodo.20250520`
- ✅ **Author info** — Dane Brown, Narashino, dane@kairovault.com (+ ORCID once registered)

### 5. Cover letter

Suggested template:

> Dear Editors,
>
> I am submitting a Data Paper documenting cuneiform-mcp v0.57.0, a 100-tool computational discovery pipeline for the electronic Babylonian Library (eBL) corpus. The paper presents 57 numbered claims across 37 thematic sections, each backed by a reproducible calibration audit.
>
> The work was previously submitted to *Cuneiform Digital Library Journal* (declined 2026-05-17 by Prof. Jacob Dahl on grounds that CDLJ requires data on CDLI infrastructure, not eBL). JOHD's prior publication of the eBL platform paper (Borger et al. 2024) suggests eBL-derived work is appropriate here.
>
> All software, derived data, and calibration audits are reproducible from github.com/Hugegreencandle/cuneiform-mcp (private through paper acceptance, then CC-BY-4.0). The v0.18.3 snapshot is archived on Zenodo (DOI 10.5281/zenodo.20250520).
>
> I am happy to address reviewer questions about methodology, calibration, or reproducibility.
>
> Sincerely,
> Dane Brown
> Independent researcher, Narashino, Japan
> dane@kairovault.com

### 6. Suggested reviewers (optional but recommended)

JOHD lets authors suggest reviewers. Suggest 3-4 names from the computational-Assyriology community:

1. **Prof. Enrique Jiménez** (LMU Munich, eBL lead) — enrique.jimenez@lmu.de
   - Already in your contact thread; explicit eBL platform expertise
2. **Prof. Émilie Pagé-Perron** (Toronto / CDLI) — cuneiform-corpus expertise
3. **Prof. Cale Johnson** (Birmingham) — computational philology of Akkadian
4. **Dr. Shai Gordin** (Ariel) — published on AI/cuneiform (BLEU benchmarks for Akkadian translation)

The actual reviewer selection is JOHD's decision; suggestions help.

### 7. Expected timeline

- Submission → editor desk-check: 1-2 weeks
- Reviewers assigned: 2-4 weeks
- First-round reviews back: 2-3 months (sometimes faster for data papers)
- Revisions: 1-3 weeks of work
- Final decision: 4-6 months total typical

Open-access journals like JOHD have no APC for data papers (free to publish).

## Pre-submission self-checklist

Before clicking submit, verify:

- [ ] All claims in the paper are reproducible from the cuneiform-mcp scripts
- [ ] Zenodo DOI resolves (visit https://zenodo.org/record/20250520)
- [ ] `npm run smoke` produces "100 tools registered" output (run from repo root)
- [ ] `scripts/regression-audit-all-rounds.mjs` reports 49/49 PASS
- [ ] Methods paper PDF is < 5MB (JOHD limit)
- [ ] Author name + affiliation + email + ORCID all on the title page
- [ ] CC-BY-4.0 license explicitly stated
- [ ] No accidentally-included sensitive data (no API keys, no Auth0 tokens)

## What happens if it's accepted

1. JOHD publishes the PDF + data citations
2. Repos flip from private to public (per the "keep it private until acceptance" rule from memory)
3. cuneiform-mcp v1.0 freeze: API-stability classification finalized, hosted Cloudflare endpoint deployed (per `docs/v1.0-cloudflare-hosting-plan.md`)
4. Subsequent versions become public-facing

If declined with revisions: address reviewer comments + resubmit. If declined outright: try *Journal of Cuneiform Studies* (more traditional, slower, doesn't require CDLI infrastructure) or *Studia Mesopotamica*.

## Backup paper drafts in repo

For historical reference only:
- `docs/methods-paper-cdlj-submission.md` (canonical, updated for JOHD on 2026-05-26)
- `docs/methods-paper-draft.md` (earlier draft, not synced past v0.18)
- `docs/methods-paper-arxiv.md` (earlier draft for arXiv endorsement track)
- `docs/methods-paper-arxiv.html` (older HTML build)

The JOHD-ready file is `docs/methods-paper-johd-submission.html` — open in any modern browser and print to PDF.
