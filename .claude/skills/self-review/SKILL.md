---
name: self-review
description: Mandatory post-implementation gate for MammaCare. Use after ANY implementation change (backend or frontend), BEFORE reporting the work as done — runs build gates, sends the diff to the code-reviewer subagent, fixes FAIL findings, and produces the final commit-readiness report. Also invoked automatically as the last step of /ship.
---

# self-review — implement → verify → adversarial review → report

Run these steps in order. Do not skip a step because the change "looks trivial".

## 1. Gates (must pass before review)
```bash
cd backend && ../venv/bin/python -c "import app.main"
cd frontend && pnpm build
```
If either fails, fix the failure first (it is part of the current task), then re-run.

## 2. Adversarial review
The reviewer input must be the full unfiltered diff, not a compressed one.

- Check `command -v rtk` first.
- **rtk absent**: plain `git diff --stat` / `git diff` are already unfiltered (no hook
  rewrites them) — use those directly, and note "rtk absent → plain diff is unfiltered"
  in your working notes.
- **rtk present**: use `rtk proxy git diff --stat` / `rtk proxy git diff` (unfiltered) —
  the PreToolUse hook rewrites plain bash through rtk, which compresses/filters output,
  so plain `git diff` would NOT be unfiltered in this case. If the `rtk proxy` command
  itself errors, do NOT silently fall back to plain `git diff` — stop and report
  "reviewer input may be filtered" so the human decides.

Invoke the `code-reviewer` subagent (Agent tool, subagent_type `code-reviewer`)
with the diff summary and the task description. Wait for its verdict.

## 3. Fix loop (at most one retry)
- `VERDICT: FAIL` → fix the FAIL findings (smallest safe fix), re-run the gates in
  step 1, then re-invoke code-reviewer ONCE more.
- Still FAIL after the retry → stop fixing; report as NEEDS SENIOR REVIEW with the
  outstanding findings.
- `PASS` / `PASS WITH NOTES` → proceed to the report (carry the notes into risks).

## 4. Final report (exact structure)
1. **Files changed** — each file on its own line, ready to paste into
   `git add <filepath>` (never `git add .`).
2. **Risks** — reviewer notes + anything you could not verify, tagged
   `[Verified]`/`[Inferred]`/`[Unknown]` + `file:line`.
3. **Reviewer verdict** — verbatim.
4. **Suggested commit message** — conventional commit, English, one line
   (+ optional body).
5. Final line, exactly one of: `SAFE TO COMMIT` or `NEEDS SENIOR REVIEW`.

## Mandatory NEEDS SENIOR REVIEW (never auto-pass, even on reviewer PASS)
- `backend/manual_sql/` or any schema change
- Allergy status-transition logic
- Auth/security changes
- Deletion paths (SymptomCheck, images, cascade-like behavior)
- Changes touching BOTH submission handlers (`handleAddIngredient` /
  `handleAddTestingWithStatus`) or EITHER `_status_from_dates` copy
- Product/UX decisions without precedent in repo docs

## Hard limits
- Never execute `git add`, `git commit`, or `git push`. Commits are human-executed.
- The escalation list above overrides any reviewer verdict.
