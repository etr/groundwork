# Unworked Review Issues

**Run:** 2026-08-26 13:47:22
**Task:** manual-validation
**Total:** 6 (0 critical, 3 major, 3 minor)

## Major

1. [ ] **code-simplifier** | `bin/groundwork-run.js:3096` | code-structure
   Runner-visible skip decisions still go through taskLog rather than the reporter (the same occurs at lines 3216, 3218, and 3350). Consequently runner.log/events.jsonl omit whether an existing plan, implementation, or validation was skipped, even though the feature documents runner.log as the durable human timeline and status is projected from the event journal.
   *Recommendation:* Route these task-state transitions through a reporter event with a concise renderable form (while retaining the existing terminal message if needed), so durable output and live output describe the same lifecycle decisions.

2. [ ] **code-simplifier** | `lib/run-reporting.js:33` | code-structure
   The documented gate schema requires lowercase kebab-case, but validName accepts trailing or repeated hyphens (for example, gate names 'unit-' and 'unit--tests'). Those malformed markers are then accepted into the semantic display and durable journal, so the parser does not actually enforce the exact marker contract.
   *Recommendation:* Use a segment-based kebab-case expression (lowercase alphanumeric segments separated by single hyphens, with no leading/trailing separator) and add boundary tests for repeated and trailing hyphens.

3. [ ] **performance-reviewer** | `lib/run-reporting.js:457` | blocking-io
   The new coherence condition is reached only after reverse-scanning every event in the selected run through `run.started` seq 1. Since activity events are append-only and unbounded during a live run, `status` now reads and parses the entire active-run journal rather than a bounded tail. A focused 20,001-event active-run probe read all 12,916,825 journal bytes, so the large-history test only proves that prior runs are skipped, not that status reads remain bounded.
   *Recommendation:* Preserve a bounded status index/checkpoint (or an equivalent trusted completion marker) that records the latest coherent run boundary, then validate only a fixed recent window plus that boundary; add a long-active-run read-budget test.

## Minor

4. [ ] **architecture-alignment-checker** | `lib/run-reporting.js:43` | interface-contract
   `parseRunnerMarker` trims each provider line before testing the prefix, so a line such as `  GROUNDWORK_RUNNER_EVENT {...}` is accepted as semantic state. The frozen product contract requires the exact `GROUNDWORK_RUNNER_EVENT ` prefix; the parser currently accepts an untrusted leading control/whitespace wrapper instead.
   *Recommendation:* Test `line.startsWith(prefix)` against the original line (allowing only the separately handled line ending) and slice that original line before JSON parsing; add a rejection test for leading whitespace/control characters.

5. [ ] **code-quality-reviewer** | `bin/groundwork-run.js:3606` | documentation
   The task-range form in the usage text omits `[--verbose]`, even though `parseArgs` accepts it for every `task` invocation and the explicit-list form advertises it.
   *Recommendation:* Add `[--verbose]` to the `groundwork-run task --from ...` usage line so all supported task forms advertise the activity-output switch consistently.

6. [ ] **code-simplifier** | `bin/groundwork-run.js:3606` | code-structure
   The usage text documents --verbose for an explicit task list and for all, but omits it from the task --from/--to form even though parseArgs accepts it for every run command.
   *Recommendation:* Add [--verbose] to the task --from/--to usage line so the help text covers the complete supported CLI surface.
