# Validation Review Protocol

Use the `review_mode` supplied by the validation coordinator. The modes grant different authority.

In file mode, copy the supplied mode into the review artifact as top-level `"review_mode": "initial-audit"` or `"review_mode": "closure-review"`. Do not infer or omit it.

## Verification Scope and Dependencies

Run all required checks. An additional blocking check must identify the baseline requirement, concrete failure evidence or an uncovered required acceptance criterion, and the decisive result it will establish. A preferred design or hypothetical safeguard alone cannot expand acceptance.

Reuse existing tools; bounded task-local probes and helpers needed to satisfy the baseline remain allowed. For missing shared verification infrastructure outside the authorized task, record the missing capability and a separately owned blocked dependency (or explicit ownership-triage action). Do not silently build a general framework in a feature repair. If the capability is already an explicit task deliverable, implement it there. Otherwise the required check remains incomplete until the dependency is resolved; required gates are never waived.

## `initial-audit`

Review the complete declared baseline: the task, original implementation diff, applicable specs and architecture, and the declared security, compatibility, and operational assumptions.

- Make one comprehensive discovery pass. Do not defer known review questions to a later iteration.
- Report every supported finding with concrete evidence.
- State the important invariants and assumptions you cleared so later reviews can preserve them.

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
