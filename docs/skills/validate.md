# `validate`

> **Run it:** `/groundwork:validate [--project name] [--noninteractive] [--on-unrelated-failure stop-and-ask|expand-and-fix|ignore-and-merge]` · **Tier:** user-run or model-invoked · **Reads:** the change's file paths and diff stat, the task definition, the paths to the specs, architecture, and design system (the reviewers read the files themselves) · **Writes:** source fixes, only through the `validation-fixer` subagent; a durable session under the Git common dir (findings files, repair envelopes, fixer results); unworked findings under the specs directory

## What it does

Runs one audit of a finished change, repairs what it found, and never restarts discovery. Project gates come first — the checks the repository's own instructions name, such as tests, typecheck, lint, build — then the reviewers launch in parallel. The blocking findings behind their `request-changes` verdicts go to the `validation-fixer` subagent as repair envelopes, and afterwards only the reviewers whose findings were repaired, or whose cleared domain the repair touched, come back, in a closure review. The baseline (task definition, original diff, applicable specs, declared assumptions) is frozen once at the start — a finding that contradicts or expands it is never sent to the fixer — and a session on disk lets an interrupted run resume from its recorded stage.

## When to reach for it

- Implementation is complete, the tests pass, and the change is ready for review — its three prerequisites.
- You want one pass that reviews the change from several domains at once — code quality, tests, security, specs, architecture, performance, conventions — and repairs what it finds.
- An unattended run needs a result instead of a pause: `just-do-it` calls it with `--noninteractive`, and runner mode returns `RESULT: FAILURE | <reason>` rather than waiting.
- **Not when:** you want a review posted on a GitHub pull request. That is `review-pr`.

## Common questions

**A gate failed for reasons my change cannot explain, and the run ended `Validation INCOMPLETE`. Did it give up?**

No. That is the default mode, `stop-and-ask`: a failure confidently assessed `Unrelated` (its failing surface sits outside the selected project root) is recorded, independent work is finished, and the run returns `Validation INCOMPLETE` with the publication constraint. `--on-unrelated-failure expand-and-fix` authorizes repairing the unrelated failure; `ignore-and-merge` records a waiver receipt and, once every other gate passes and every reviewer approves, ends with `Validation PASSED-WITH-WAIVERS`, followed by one `Waived <gate>: ...` line per waived gate. A failure whose cause stays uncertain is not eligible in any mode.

**The orchestrator would not make a one-character fix itself.**

By design. The Hard Rule sends every fix through the `validation-fixer` subagent; the orchestrator writes only its own coordinator artifacts and state transitions. The reason is context: fix work and diff details stay out of the window that has to manage the loop.

**After a fix, only some reviewers ran again, and the audit did not start over.**

That is the closure review. It grants authority only over causal repair verification, so the reviewers that requested changes, or whose cleared domain the fix touched, are re-launched, and the rest carry their earlier `approve` verdict and score into the table. The initial audit is never restarted.

**What happens unattended, when it would need a decision?**

With `--noninteractive` it never calls `AskUserQuestion`. It persists the unexecuted findings, preserves the session, and returns `Validation INCOMPLETE ({N} iter, reason: <reason>)`. It does not restart validation or merge.

## It's working if

- The project gates (whatever the repository's instructions name) each ran once before any reviewer was launched.
- All reviewers were launched in a single turn, with one `GROUNDWORK_VALIDATION_PROGRESS` marker before the batch and one after; each returned a single-line JSON, and the full reviews are on disk as `{findings_dir}/findings-{agent_name}-iter{N}.json`, not in the conversation.
- Reviewers with nothing to review appear in the table with verdict `skipped` and a note saying why.
- Each round of agents is summarized in one line: `Iter {N}: {active_count} agents — {approve_count} approve / {changes_count} request-changes`.
- The orchestrator made no source edit itself; each repair went out as `repair-envelope-iter{N}.json` and came back as `fixer-result-iter{N}.json` from the `validation-fixer` subagent.
- After a repair, the required post-fix gates ran, and only the impacted reviewers were re-run, in `closure-review`.
- The run ends with a single result line: `Validation PASSED ({N} iter, {M} fixed, {K} unworked → <written>)`, `Validation PASSED-WITH-WAIVERS ({N} iter, {M} fixed, {K} unworked, {W} unrelated gates waived)`, or `Validation INCOMPLETE ({N} iter, reason: <reason>)`; in runner mode, `RESULT: VALIDATED | {...}` or `RESULT: FAILURE | <reason>`. The per-iteration fix list is not echoed.

**It is not working if:** the orchestrator edited a source file itself, the initial audit restarted after a repair, or a failed or waived gate shows as passed.
