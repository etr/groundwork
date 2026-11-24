# Validation Review Protocol

Use the `review_mode` supplied by the validation coordinator. The modes grant different authority.

In file mode, copy the supplied mode into the review artifact as top-level `"review_mode": "initial-audit"` or `"review_mode": "closure-review"`. Do not infer or omit it. A caller that names no mode (inline use outside validation, such as a pull-request review) gets an `initial-audit` over the baseline it supplied.

## Output Modes

Each reviewer has one inline schema — the JSON its own definition shows. Which shape you return depends on the prompt.

**File mode** — the prompt includes a `findings_file: <path>` line (along with `agent_name:`, `iteration:`, and `review_mode:`). Write the review to that path with the `Write` tool, then return ONLY the compact one-line response. The on-disk file is your inline schema with a header, finding `id`s, and `cleared_invariants` added:

```json
{
  "agent": "<agent_name from prompt>",
  "iteration": <iteration from prompt>,
  "review_mode": "<review_mode from prompt>",
  "cleared_invariants": ["<an invariant or assumption this review confirmed, with the evidence that confirmed it>"],
  "summary": "...",
  "score": 85,
  "verdict": "approve",
  "findings": [
    {"id": 1, "severity": "major", "category": "...", "file": "...", "line": 42, "finding": "...", "recommendation": "...", "disposition": "actionable"}
  ]
}
```

The header names the artifact's owner and round. `id` is 1-indexed within the file. `disposition` — and in `closure-review` `origin` and `causal_ref` — follow the rules under `closure-review`. `cleared_invariants` is optional in either mode: one short string per invariant or assumption this review confirmed, each with its evidence. The coordinator re-runs a reviewer only when a repair disturbs one of them, so an unlisted invariant is not protected.

Your conversational response in file mode is exactly one JSON line (no findings inline, no extra prose). `counts` reflects how many findings of each severity you wrote to the file; `cleared_invariants` repeats the file's list so the coordinator need not open the file:

```json
{"verdict":"approve","score":85,"summary":"...","findings_file":"<the path you wrote>","counts":{"critical":0,"major":1,"minor":0},"cleared_invariants":["..."]}
```

**Inline mode** — the prompt has no `findings_file:` line (a pull-request review, for example). Return your inline schema exactly as your own definition shows it: no `agent`/`iteration` header and no finding `id`s. Add `cleared_invariants` when you confirmed something worth preserving.

## Score

Whenever you report a 0-100 score and your own definition gives no formula for it, use this rubric so scores compare across reviewers: start at 100 and subtract 30 per actionable `critical` finding, 15 per actionable `major` finding, and 3 per actionable `minor` finding; floor at 0. A reviewer with no findings scores 100. The verdict never derives from the score — apply your own verdict rules.

## Verification Scope and Dependencies

Run all required checks. An additional blocking check must identify the baseline requirement, concrete failure evidence or an uncovered required acceptance criterion, and the decisive result it will establish. A preferred design or hypothetical safeguard alone cannot expand acceptance.

Reuse existing tools; bounded task-local probes and helpers needed to satisfy the baseline remain allowed. For missing shared verification infrastructure outside the authorized task, record the missing capability and a separately owned blocked dependency (or explicit ownership-triage action). Do not silently build a general framework in a feature repair. If the capability is already an explicit task deliverable, implement it there. Otherwise the required check remains incomplete until the dependency is resolved; required gates are never waived.

## `initial-audit`

Review the complete declared baseline: the task, original implementation diff, applicable specs and architecture, and the declared security, compatibility, and operational assumptions.

- Make one comprehensive discovery pass. Do not defer known review questions to a later iteration.
- Report every supported finding with concrete evidence.
- List the important invariants and assumptions you cleared in `cleared_invariants` (see *Output Modes*) so later reviews can preserve them.

## `closure-review`

Verify the coordinator's closure brief. This is not another initial audit.

Only answer:

1. Does each named prior finding remain, resolve, or regress?
2. Did the repair delta introduce or expose a defect in the touched surface?
3. Did the repair invalidate a named assumption or invariant cleared by the initial audit?

Do not re-audit unchanged code. Do not introduce a new threat actor, compatibility mode, product requirement, or architectural expectation outside the frozen baseline. Do not continue searching after the named findings are closed and the repair delta is safe. Approve immediately when those conditions hold.

Classify every new closure observation with exactly one origin:

- `introduced-by-fix` — the repair created the defect.
- `exposed-by-fix` — the repair made a previously unreachable defect relevant.
- `invalidated-prior-assumption` — the repair invalidated a named cleared assumption.
- `initial-audit-miss` — the defect existed in the original reviewed baseline and is unrelated to the repair.
- `scope-expansion` — the observation depends on a requirement or operating model outside the frozen baseline.

The first three origins may block when they cite the causal repair file and line or hunk plus the affected invariant. A concrete `initial-audit-miss` may also block when it violates the frozen task/spec/architecture baseline and meets the reviewer's normal severity threshold; admit it to the existing finding ledger and close it normally. `scope-expansion` never blocks. Do not restart the initial audit for either case.

An incidental initial-audit miss must name the violated baseline requirement, concrete failure evidence, and blocking consequence under the normal severity rules. It never authorizes searching unchanged code for more findings or replacing a settled design with a preferred alternative.

When writing a closure-mode findings JSON file, add `origin` and `causal_ref` to each finding. Every finding in every mode also carries a `disposition`: `"actionable"` while it demands work, or the closure outcome (`"resolved"`, `"approved"`, `"fixed"`, `"closure-observation"`) once it no longer does. A prior finding that re-checks as already addressed is resolved/closed, never re-listed as actionable — the unworked-findings ledger persists only actionable items. Set `causal_ref` to the repair file and line/hunk plus the affected invariant for repair-caused origins; use `null` for `initial-audit-miss` and `scope-expansion`.

Disposition and severity are separate. Counts include every record; apply verdict thresholds only to actionable records. Closed dispositions are evidence claims for coordinator confirmation, never an authorization to conceal an unresolved finding. Legacy files without `review_mode` may omit disposition and are treated as actionable; new file-mode artifacts must include it.
