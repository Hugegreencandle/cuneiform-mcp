# Overnight session — 2026-05-27 → 2026-05-28

Handoff note for the autonomous loop run + the parallel JOHD developments.

## TL;DR

All three queued Tier-1 items shipped (T1-C + T2-A + T1-B). T1-B was deferred initially on the morning train, then re-launched and shipped at `dc17821`. JOHD desk-rejected the methods paper on scope/format the previous day; the resubmission path (Discussion paper, ~5K words) is open and recommended. Jiménez referred us to Shai Gordin for the still-pending arXiv endorsement; the request email went out the morning of 2026-05-28.

## What shipped (origin/main)

| Commit | Version | Title | Tests | Tools |
|---|---|---|---|---|
| `59fb6da` | 0.61.0 | explain_pair_score — full provenance trace for pairwise verdicts (T1-A) | 84 | 102 |
| `d48cdf5` | 0.62.0 | export_session — session ring buffer + snapshot tool (T1-C) | 90 (+6) | 103 |
| `1d65bb9` | 0.63.0 | diff_corpus_versions — cache-snapshot delta tool (T2-A) | 99 (+9) | 104 |
| `dc17821` | 0.64.0 | auto_validate_from_resolutions — proposal-only diff against v1.0 gate store (T1-B) | 107 (+8) | 105 |

All four came from the post-JOHD upgrade plan T-items. T1-A landed before the overnight loop started; T1-C landed during the brief overnight window before the laptop went to sleep; T2-A landed the next morning during a manually-driven iteration; T1-B landed in the second loop re-launch after the manual handoff note.

Net delta from the start of the cycle: +23 tests, +4 tools, four new modules (`src/explainPair.ts`, `src/sessionExport.ts`, `src/corpusDiff.ts`, `src/autoValidateFromResolutions.ts`), one new module of calibration provenance (`src/calibrationHistory.ts`), two new CLIs (`scripts/snapshot-cache.mjs`, `scripts/auto-validate-from-rules.mjs`), five new schemas.

## What did NOT ship

Nothing pending from the original queue. T1-B was initially deferred on the morning train (loop stopped after T2-A landed) but was re-launched in a follow-up loop and shipped clean at `dc17821` with its full safety contract intact:

- Mode assertion (`mode === "propose"` only, throws otherwise)
- Validation-store `mtime_unchanged` invariant (captured before and after each run; tests assert it)
- Rules sourced only from methods-paper external anchors, never current-model output

T2-B (cost-aware memoization wrapper) and T2-C (`ingest_external_tablet`) remain deferred per the original plan — not safe for autonomous overnight work and need conversation.

## What halted

Nothing. Zero `BLOCKED-*.md` files were written. Every iteration that ran (T1-C overnight, T2-A this morning) passed pre-flight, post-flight, and pre-commit grep gates cleanly.

The overnight loop *did* die unexpectedly — but not from a halt rail. After T1-C shipped at ~06:24 JST and ScheduleWakeup was set for 06:28, the local laptop went to sleep before the wakeup could fire. `/loop` is explicitly session-only (per the skill description: "Runs until you close this session"), so no further iterations executed until the operator manually re-invoked `/loop` on the train.

**Lesson for next time:** for true sleep-through-the-night autonomy, use `/schedule` (cloud-hosted) rather than `/loop` (session-only). `/schedule` requires invocation from inside a git repo, which is why the initial `/ultraplan` from `~/Desktop` failed — the right launch path is `cd ~/Desktop/cuneiform-mcp && /schedule …` or equivalent.

## Adjacent developments (same 24-hour window)

### JOHD desk-rejected the methods paper (2026-05-27)

One-day turnaround from editor Andrea Farina. Declined on scope/format only — content was never evaluated. JOHD data papers are 1,000-1,500 words; discussion papers ~5,000 words; the submitted manuscript was ~15K+. Editor explicitly invited resubmission as either format. Recommended path: Discussion paper at ~5K words, keeping §1 abstract + §2 dataset + §3 methodology condensed + §3.5 cluster typology + §3.32 held-out validation + §6 conclusions; cutting audit-round play-by-play + claims inventory + most of the appendix. Memory updated at `~/.claude/projects/-Users-danebrown/memory/project_johd_decline_2026_05_27.md`. Target rework window: ~1-2 weeks while the editor's invitation is fresh.

### arXiv endorsement: Jiménez → Gordin referral (2026-05-28)

Enrique Jiménez emailed referring us to **Shai Gordin** (`shygordin@gmail.com`) for arXiv endorsement. Gordin is a published ML-on-cuneiform researcher (BabMed corpus, Akkadian translation models) with cs.CL standing — a stronger candidate than the prior Fraser fallback. He was also on Dane's original JOHD reviewer-suggestion list. Endorsement codes from the prior blocked attempt remain valid: user ID `hgc589`, code `34NLYZ`. Request email sent the morning of 2026-05-28.

## Current state

```
Branch:        origin/main @ dc17821
Version:       0.64.0
Tools:         105 registered
Tests:         107 / 107 passing
Build:         clean (tsc)
Smoke:         clean
Untracked:     .claude/, .playwright-mcp/ (session-state, not for commit)
Blocked:       none
Queue:         drained (all Tier-1 items shipped)
```

## Outstanding items (next session)

1. **JOHD discussion-paper rework** — read 1 JOHD discussion paper from their archive, sketch the 5K-word cut, hard-cut to fit, resubmit while editor invitation is fresh. Working baseline: `docs/methods-paper-johd-submission.html`. **Frozen file** — work from a copy, never the original.
2. **Wait on Gordin reply** — academic email norm = 1-2 weeks. If silent past 3 weeks, do not follow up unprompted; fall back to Fraser or the arXiv endorser-finder.
3. **Run `auto_validate_from_resolutions` end-to-end** — the tool is shipped but no one has invoked it yet against a live prioritize_validation_queue. First invocation will produce a real `docs/auto-validation-proposals-<ts>.md` to review. After review, accepted proposals get hand-fed into `record_validation_resolution` to actually move the v1.0 labeled-pair gate (currently 12/100).
4. **Tier-2 upgrade items still on the plan** — T2-B cost-aware memoization wrapper (needs conversation, judgment calls on cache keys), T2-C ingest_external_tablet (deferred per memory: sign-normalization is brittle).
