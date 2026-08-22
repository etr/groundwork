---
name: validate
description: This skill should be used when implementation is complete to run multi-agent verification with baseline-determined repair and causal closure review
argument-hint: "[--project name] [--noninteractive]"
---

# Validation Loop Skill

Autonomous verification that performs one comprehensive audit, applies every repair determined by the declared requirements, and closes those repairs without silently restarting discovery.

## Explicit Project Input

If arguments include `--project <name>`, resolve that project directly from the repository's `.groundwork.yml` for this invocation. Treat it as authoritative; do not depend on or change persisted project selection. In runner mode, `GROUNDWORK_PROJECT` and `GROUNDWORK_PROJECT_ROOT` provide the same invocation-local selection.

## Noninteractive Invocation

If arguments include `--noninteractive`, skip the model recommendation and never call `AskUserQuestion`. Preserve normal non-runner result and commit behavior. When user input would otherwise be required, persist unexecuted findings, preserve the durable session, and return `Validation INCOMPLETE ({N} iter, reason: <reason>)`. Do not restart validation.

## Runner Mode

If session context contains `GROUNDWORK_RUNNER_MODE=true`:

- Skip the model recommendation pre-flight and do not call `AskUserQuestion`.
- Use the supplied `base_sha` for the complete task diff.
- If validation needs user input or cannot converge, return `RESULT: FAILURE | <reason>` instead of pausing. The runner preserves the worktree.
- After every reviewer approves, leave all validation fixes and persisted validation artifacts in the task worktree for the runner to commit. Do not stage, commit, amend, or rebase.
- End with the versioned JSON `RESULT: VALIDATED` receipt bound to the exact runner token and task identity. Propose an expressive commit subject and body when changes remain.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`) AND you are Sonnet or Opus.
If effort is `low` or `medium` (i.e. below `high`), you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Unless `--noninteractive` is set, use `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Fix loop management and domain spillover judgment across 9 agents benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
    "header": "Recommended: Sonnet or Opus at high effort",
    "options": [
      { "label": "Continue" },
      { "label": "Cancel — I'll switch first" }
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Cancel — I'll switch first": output the switching commands above and stop. Do not proceed with the skill.

## Hard Rule

You MUST NOT modify source files yourself during this loop. All fixes go through the `validation-fixer` subagent. Allowed orchestrator writes: coordinator-owned artifacts inside the durable `findings_dir`, state transitions through `lib/validation-session.js`, and `lib/persist-unworked-findings.js` in step 5.5. Never edit helper-owned `.validation-session.json` or `active.json` directly. Zero `Edit`/`Write`/`NotebookEdit`/`sed -i`/`tee`/redirect calls on anything else. In runner mode, do not stage or commit after step 5.5; the runner records the approved tree. No exceptions — even one-character cosmetic fixes go through the subagent. **Why:** this skill exists to keep fix work out of the orchestrator's context window; direct edits burn the budget saved by dispatching the reviewers and pollute the next iteration's context with diff details.

## Validation State Model

Read `${CLAUDE_PLUGIN_ROOT}/references/validation-review-protocol.md` and `${CLAUDE_PLUGIN_ROOT}/references/validation-session-protocol.md`. Preserve one frozen validation baseline through the run and across process restarts. The baseline freezes required behavior and review scope, not implementation shape.

```
INITIAL_AUDIT → BASELINE-COMPATIBLE_FIX → CLOSURE_REVIEW → PASS
```

- `review_mode: initial-audit` grants comprehensive discovery authority once for the frozen baseline.
- `review_mode: closure-review` grants only causal repair-verification authority.
- A repair is baseline-compatible when its required outcome is determined by the frozen task/spec/architecture baseline. Repair size and implementation shape do not change that: validation may authorize a substantial refactor or reimplementation when the baseline requires it.
- A concrete `initial-audit-miss` found incidentally during closure may enter the same finding ledger when it violates the frozen baseline and meets the reviewer's normal blocking threshold. Fix it and re-review only affected invariants; never restart the initial audit.
- `scope-expansion` observations are persisted as unworked findings and do not enter the fixer loop.

## Findings Storage

Validation agents write their full JSON reviews to per-run, per-iteration files. The orchestrator parses compact response metadata, then reads only critical/major findings from `request-changes` reviews once to create semantic repair envelopes and closure briefs. Do not load approved/minor findings or whole review narratives. The fixer and persistence helper may read the full artifacts in their isolated contexts.

**Per-run directory** (opened in step 1 and retained across restarts):
```
findings_dir = <the findings_dir returned by validation-session.js open>
```

**Per-invocation file** (one file per agent per iteration):
```
{findings_dir}/findings-{agent_name}-iter{N}.json
```

A new file per iteration preserves history across the fix-and-retry loop, so the helper script in step 5.5 can collect unexecuted findings from every iteration.

**Full review file format** (written by each agent to its `findings_file`):
```json
{
  "agent": "code-quality-reviewer",
  "iteration": 1,
  "review_mode": "initial-audit",
  "summary": "One-sentence assessment",
  "score": 85,
  "verdict": "approve",
  "findings": [
    {"id": 1, "severity": "major", "category": "...", "file": "...", "line": 42, "finding": "...", "recommendation": "..."},
    {"id": 2, "severity": "minor", "category": "...", "file": "...", "line": 10, "finding": "...", "recommendation": "..."}
  ]
}
```

The **stable global ID** of a finding is `{agent_name}-iter{N}-{id}` (e.g. `code-quality-reviewer-iter1-2`). Use these IDs anywhere you need to reference a finding across iterations (fix-agent prompts, stuck detection, unworked_review_issues).

**Compact agent response** (single JSON line returned by each agent):
```json
{"verdict":"approve","score":85,"summary":"One-sentence assessment","findings_file":"/tmp/groundwork-validation-XXXXXX/findings-code-quality-reviewer-iter1.json","counts":{"critical":0,"major":1,"minor":2}}
```

This is the only thing the orchestrator parses from conversational responses. Semantic finding data comes from the coordinator-assigned artifact, never from reviewer prose.

## Prerequisites

Before invoking this skill, ensure:
- Implementation is complete
- Tests pass
- Changes are ready for review

## Step 0: Resolve Project Context

**Before loading specs, ensure project context is resolved:**

1. **Monorepo check:** Does `.groundwork.yml` exist at the repo root?
   - If yes → Is `{{project_name}}` non-empty?
     - If empty → Invoke `Skill(skill="groundwork:select-project")` to select a project, then restart this skill.
     - If set → Project is `{{project_name}}`, specs at `{{specs_dir}}/`.
   - If no → Continue (single-project repo).
2. **CWD mismatch check (monorepo only):**
   - Skip if not in monorepo mode or if the project was just selected in item 1 above.
   - If CWD is the repo root → fine, proceed.
   - Check which project's path CWD falls inside (compare against all projects in `.groundwork.yml`).
   - If CWD is inside the selected project's path → fine, proceed.
   - If CWD is inside a different project's path → with `--noninteractive`, keep the explicitly selected project and continue; otherwise warn via `AskUserQuestion`:
     > "You're working from `<cwd>` (inside **[cwd-project]**), but the selected Groundwork project is **[selected-project]** (`[selected-project-path]/`). What would you like to do?"
     > - "Switch to [cwd-project]"
     > - "Stay with [selected-project]"
     If the user switches, invoke `Skill(skill="groundwork:select-project")`.
   - If CWD doesn't match any project → proceed without warning (shared directory).
3. Proceed with the resolved project context. All `{{specs_dir}}/` paths will resolve to the correct location.

## Workflow

### 1. Gather Context

**Durable session prologue (run FIRST in this step):** Resolve the repository/worktree root, selected project root, task ID, current branch, and frozen base SHA. In runner mode use the supplied `base_sha` and add `--runner-mode`; otherwise use the merge base for the change being validated. Then open the session before running gates or launching agents:

```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/validation-session.js open \
  --repo-root "<repo_root>" \
  --project-root "<project_root>" \
  --worktree "<worktree_root>" \
  --task-id "<TASK-NNN|manual-validation>" \
  --branch "<branch>" \
  --base-head "<base_sha>" \
  --protocol-version 1 \
  <optional --runner-mode>
```

Parse only the returned one-line JSON. Save `run_id`, `run_dir`, `findings_dir`, `stage`, `iteration`, and `coordinator_file`.

- `created`: initialize iteration 1, freeze the baseline, and run the initial audit.
- `resumed`: read the recorded coordinator file and continue from its recorded stage. Do not restart the initial audit or discard carried approvals.
- `recovered`: read the recorded repair envelope and rerun the named interrupted step. A `fixer-prepared` session reruns the same fixer envelope.
- `needs-recovery`: do not mutate the worktree. Confirm that the prior fixer is no longer running and ask the user for explicit rollback authorization. Only after authorization reopen with `--recover-partial-fixer`; in runner mode the exclusive project lease authorizes automatic quarantine and rollback.
- `completed`: replay the stored validation metrics and exact action/commit receipt, emit the normal final result, and stop without gates, reviewers, or fixers.

An incomplete reviewer batch has no checkpoint. Rerun only the pending batch for the recorded stage and iteration, using the same assigned artifact names. You will pass `{findings_dir}/findings-{agent}-iter{N}.json` to every agent invocation and reference these files in step 4.2 and step 5.5. Retain the directory after completion.

Freeze `validation_baseline` now: task definition, original changed paths/diff, applicable specs/architecture/design paths, and declared security, compatibility, and operational assumptions. Fixer changes never expand its requirements, but may change any implementation surface needed to satisfy them.

**Maintain orchestrator working notes** (in your in-context working state, NOT in any spec file) of the form:

```
run_id: <durable session ID>
run_dir: <Git-common-dir>/groundwork/validation/.../groundwork-validation-<run_id>
findings_dir: <same as run_dir>
iteration_number: 1
review_mode: initial-audit
validation_baseline: <frozen baseline summary>
iterations:
  1:
    agent_files:
      code-quality-reviewer: /tmp/groundwork-validation-XXXXXX/findings-code-quality-reviewer-iter1.json
      security-reviewer:     /tmp/groundwork-validation-XXXXXX/findings-security-reviewer-iter1.json
      ...
    findings_fixed: []     # populated after the fix-agent runs in this iteration
    findings_skipped: []
```

Append a new iteration block each time you re-run agents in step 4.4.

**CRITICAL — Context budget**: Do NOT read file contents, full diffs, specs, or architecture docs into this orchestrating context. Collect only file paths and metadata. Agents have Read/Grep/Glob tools and will read files in their own context windows.

Collect for the agents:
- Changed file paths: in runner mode use `git diff --name-only <base_sha>`; otherwise use `git diff --name-only HEAD~1` → list of paths (keep, small)
- Diff stat: in runner mode use `git diff --stat <base_sha>`; otherwise use `git diff --stat HEAD~1` → brief change summary (lines added/removed per file)
- Test file paths: identify associated test files by convention (do NOT read them)
- Task definition (goal, action items, acceptance criteria) → keep, brief
- Specs path: path to `{{specs_dir}}/product_specs.md` or `{{specs_dir}}/product_specs/` (do NOT read contents)
- Architecture path: path to `{{specs_dir}}/architecture.md` or `{{specs_dir}}/architecture/` (do NOT read contents)
- Design system path: path to `{{specs_dir}}/design_system.md` or `{{specs_dir}}/design_system/` (do NOT read contents)

### 1.5. Determine Active Agents

Based on context gathered, skip agents whose primary review subject does not exist:

| Agent | Skip when |
|---|---|
| `design-consistency-checker` | No `design_system_path` AND no CSS/styling files in `changed_file_paths` |
| `spec-alignment-checker` | No `specs_path` found |
| `architecture-alignment-checker` | No `architecture_path` found |
| `cloud-infrastructure-reviewer` | No IaC/config files in `changed_file_paths` (detected by extension/content sniff: `*.tf`, `*.tfvars`, CloudFormation YAML/JSON, CDK sources, Bicep/ARM, Pulumi, Kubernetes manifests, Dockerfiles, `docker-compose.*`) |
| `conventions-reviewer` | No CLAUDE.md files found in the repo (`**/CLAUDE.md` via Glob) |

**Always run** regardless of context:
- `code-quality-reviewer` — always applicable to code changes
- `security-reviewer` — always applicable to code changes
- `code-simplifier` — always applicable to code changes
- `performance-reviewer` — always applicable to code changes
- `test-quality-reviewer` — always applicable to code changes
- `housekeeper` — handles missing paths gracefully, still checks task status

Record skipped agents in the aggregation table with verdict `skipped` and a note explaining why.

### 2. Launch Verification Agents

**Token discipline:** Launch all agents in a single tool-use turn. Do NOT output text-only turns while waiting for agents to return — each turn re-reads the full context window. Aggregate results silently and output ONE summary after all agents complete. The same applies to re-validation rounds in Step 4.

On the same assistant turn as each launch batch, immediately before the Agent tool calls, emit exactly one compact progress marker. Include only agents active in this iteration, in launch order; omit skipped and carry-forward agents:

```text
GROUNDWORK_VALIDATION_PROGRESS {"iteration":1,"status":"launched","agents":["code-quality-reviewer","security-reviewer"]}
```

Substitute the current iteration and complete active-agent list. Do not add paths, prompts, findings, summaries, or counts to this marker. Emit it for the initial batch and every re-validation batch.

Use Agent tool to launch all agents in parallel:

| Agent (`subagent_type`) | Context to Provide |
|-------------------------|-------------------|
| `groundwork:code-quality-reviewer:code-quality-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition`, `test_file_paths` |
| `groundwork:test-quality-reviewer:test-quality-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition`, `test_file_paths` |
| `groundwork:security-reviewer:security-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition` |
| `groundwork:spec-alignment-checker:spec-alignment-checker` | `changed_file_paths`, `diff_stat`, `task_definition`, `specs_path` |
| `groundwork:architecture-alignment-checker:architecture-alignment-checker` | `changed_file_paths`, `diff_stat`, `task_definition`, `architecture_path` |
| `groundwork:code-simplifier:code-simplifier` | `changed_file_paths`, `diff_stat`, `task_definition` |
| `groundwork:housekeeper:housekeeper` | `changed_file_paths`, `diff_stat`, `task_definition`, `task_status`, `specs_path`, `architecture_path`, `design_system_path` |
| `groundwork:performance-reviewer:performance-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition` |
| `groundwork:design-consistency-checker:design-consistency-checker` | `changed_file_paths`, `diff_stat`, `design_system_path` |
| `groundwork:cloud-infrastructure-reviewer:cloud-infrastructure-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition`, `architecture_path` |
| `groundwork:conventions-reviewer:conventions-reviewer` | `changed_file_paths`, `diff_stat`, `task_definition` |

**Each agent prompt MUST include both of these lines** (in addition to the agent-specific context above):

```
review_mode: initial-audit
findings_file: {findings_dir}/findings-{agent_name}-iter{iteration_number}.json
agent_name: {agent_name}
iteration: {iteration_number}
```

Substitute `{agent_name}` with the agent's short name (`code-quality-reviewer`, `security-reviewer`, etc.), `{iteration_number}` with the current iteration number, and `{findings_dir}` with the path you saved in step 1. Record the resulting `findings_file` path in your iteration tracking notes (see step 1) — you will need it in step 4.2 and step 5.5.

Also include the frozen `validation_baseline` and: "Read and follow the shared validation review protocol. This is the single comprehensive discovery pass: examine every question within your declared domain now. Use the Read tool to examine the supplied paths. Write your full review JSON to `findings_file`, then return ONLY the compact one-line JSON response. Do not print findings inline."

**Each agent's compact response is a single JSON line** in this exact shape:

```json
{"verdict":"approve","score":85,"summary":"One-sentence assessment","findings_file":"/tmp/groundwork-validation-XXXXXX/findings-code-quality-reviewer-iter1.json","counts":{"critical":0,"major":1,"minor":2}}
```

The full review (including the `findings[]` array) lives only in the file at `findings_file`. Do not parse or expect the array in the agent's response.

### 3. Aggregate Results

Parse each agent's compact one-line JSON response. Read `verdict`, `score`, `summary`, severity counts, and `findings_file`. For each `request-changes` review, read only its critical/major finding objects once. Normalize each into a closure record containing its global ID, invariant, evidence, affected surface, and required outcome. Do not load minor or approved finding bodies.

Before the human-readable iteration summary, emit exactly one completion marker. Include every active agent from this iteration in launch order with only its parsed verdict:

```text
GROUNDWORK_VALIDATION_PROGRESS {"iteration":1,"status":"completed","agents":[{"name":"code-quality-reviewer","verdict":"approve"},{"name":"security-reviewer","verdict":"request-changes"}]}
```

Allowed verdicts are `approve`, `request-changes`, and `skipped`. Do not add scores, counts, paths, summaries, or findings. Emit this marker for every iteration.

Emit one line summarizing this iteration's active agents (skip carry-forward agents):

```
Iter {N}: {active_count} agents — {approve_count} approve / {changes_count} request-changes
({agent: Xc/Ym} for agents with non-zero critical+major, comma-separated; omit clean agents)
```

Then update your iteration tracking notes with each findings path and the compact closure records. The coordinator owns this semantic ledger; IDs alone are not sufficient for fixing or closure review.

After every assigned findings artifact in the batch is complete and validated, use the Write tool to create `{run_dir}/coordinator-iter{N}.json` with this restart contract:

```json
{
  "iteration": 1,
  "review_mode": "initial-audit",
  "validation_baseline": {"task":"<task>","base_sha":"<sha>","scope":["<path>"]},
  "finding_ledger": [],
  "carried_approvals": [],
  "disturbed_invariants": [],
  "fixed_ids": [],
  "findings_skipped": [],
  "active_reviewers": [],
  "latest_manifest": null
}
```

Populate the arrays with the complete compact semantic state needed to resume; do not store only IDs where closure requires invariant/evidence/outcome. For the initial batch checkpoint `initial-audit-pending -> review-batch-complete`. For a post-fix closure batch checkpoint `gates-complete -> review-batch-complete`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/validation-session.js checkpoint \
  --run-dir "<run_dir>" \
  --expected-stage "<initial-audit-pending|gates-complete>" \
  --next-stage "review-batch-complete" \
  --iteration "<N>" \
  --coordinator-file "<run_dir>/coordinator-iter<N>.json"
```

Only this successful checkpoint makes the reviewer batch durable. If execution stops earlier, rerun that exact pending batch on resume.

### 4. Autonomous Fix-and-Retry Loop

Continue until every valid baseline finding is closed and all impacted reviewers approve the same unchanged state. Repairs may be structurally large when the frozen baseline determines their outcome.

**On any `request-changes` verdict:**

1. **Log Iteration** — emit one line: `Iter {N}: fixing {X} issues`

2. **Adjudicate and Spawn Fix Agent** — Build a repair envelope for every blocking closure record before spawning the fixer:

   ```json
   {
     "iteration": 1,
     "repairs": [{
       "finding_id": "<global-id>",
       "invariant": "<exact behavior that must hold>",
       "evidence": "<why the finding is valid>",
       "authorized_change": "<scoped outcome and expected implementation surfaces>",
       "preserve": ["<contracts and cleared behavior that must remain unchanged>"],
       "forbidden": ["<requirements or outcomes outside the frozen baseline>"],
       "verification": ["<specific regression evidence and relevant gates>"],
       "stop": "<condition after which no further improvement is authorized>"
     }]
   }
   ```

   If a finding contradicts or expands the frozen baseline, do not send it to the fixer; reject or persist it according to the review protocol. If the baseline is genuinely missing or contradictory, use the existing user-clarification/failure path. Otherwise write the envelope as `{run_dir}/repair-envelope-iter{N}.json`. Before spawning the validation-fixer, capture the transactional recovery boundary:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/validation-session.js begin-fixer \
     --run-dir "<run_dir>" \
     --iteration "<N>" \
     --envelope-file "<run_dir>/repair-envelope-iter<N>.json"
   ```

   Then spawn the fixer, even when the repair requires substantial restructuring. Do not ask the fixer to discover its own scope.

   ```
   Agent(
     subagent_type="groundwork:validation-fixer:validation-fixer",
     description="Fix validation findings (iteration N)",
     prompt="Working directory: [path]
   Iteration: N

   FINDINGS FILES:
   - [path to findings-<agent>-iter<N>.json]
   - [path to findings-<other-agent>-iter<N>.json]

   REPAIR ENVELOPE:
   [coordinator-authored envelopes]

   Classify scope before mutation. Apply every baseline-compatible repair, regardless of size. Return semantic repair claims for every fixed ID."
   )
   ```

3. **Parse Fix Agent Result** — require global IDs plus semantic repair claims (`root_cause`, `change`, `evidence`, `contracts_changed`):
   - `RESULT: FIXED ...` → proceed when every fixed ID has a repair claim
   - `RESULT: PARTIAL ...` → record fixes and classified skips; ask for clarification only when the frozen requirements genuinely do not determine an outcome
   - `RESULT: FAILURE | [reason]` → log the failure reason; in runner mode, return `RESULT: FAILURE` immediately; with `--noninteractive`, return `Validation INCOMPLETE`; otherwise escalate to user via `AskUserQuestion`
   - No parseable result → treat as failure; in runner mode, return `RESULT: FAILURE` immediately; with `--noninteractive`, return `Validation INCOMPLETE`; otherwise escalate to user

   Record both `findings_fixed` and `findings_skipped` (as global ID lists) in your iteration tracking notes under the current `iteration_number`. These are what step 5.5 uses to compute the unexecuted set.

   A conversational result is not durable completion. After the normal fixer-result validator accepts `{run_dir}/fixer-result-iter{N}.json`, adopt the post-fix tree as the next recovery boundary:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/validation-session.js complete-fixer \
     --run-dir "<run_dir>" \
     --iteration "<N>" \
     --result-file "<run_dir>/fixer-result-iter<N>.json"
   ```

   If the process stops before this succeeds, resume the `fixer-inflight` transaction through the recovery rules; never adopt partial source mutations as an implicit fixer result.

4. **Write Closure Brief and Re-run Impacted Agents** — Run every required post-fix project gate on the recorded fixer tree. Once they pass, update the coordinator file and checkpoint the durable gate boundary:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/validation-session.js checkpoint \
     --run-dir "<run_dir>" \
     --expected-stage "fixer-result-ready" \
     --next-stage "gates-complete" \
     --iteration "<N>" \
     --coordinator-file "<run_dir>/coordinator-iter<N>.json"
   ```

   Then bump `iteration_number`, set `review_mode: closure-review`, and write a coordinator-authored closure brief for each impacted reviewer:

   ```yaml
   review_mode: closure-review
   validation_baseline: <frozen baseline>
   prior_findings: [<closure records assigned to this reviewer>]
   repair_claims: [<exact claims and evidence for those findings>]
   repair_delta: <files and hunks changed by this fixer pass>
   disturbed_invariants: [<previously cleared invariants touched by the delta>]
   verify_only: [<specific closure questions and tests>]
   closed_scope: [<unchanged or unrelated surfaces not open to discovery>]
   blocking_rule: Repair-caused blockers require origin introduced-by-fix, exposed-by-fix, or invalidated-prior-assumption plus a causal reference. A concrete initial-audit-miss inside the frozen baseline may also block. Scope expansion cannot.
   stop: Approve immediately when prior findings are closed and the repair caused no regression.
   ```

   Re-launch only reviewers that requested changes or whose cleared domain/invariants were actually disturbed by `files_touched` and the semantic repair claims. Do not automatically relaunch generic quality or simplification reviewers when their domain was not disturbed.

   **Domain spillover**: Use `files_touched` from the fix agent result to determine if a fix modified code relevant to an agent that previously approved. If so, re-run that agent too:

   | Fix touches... | Also re-run |
   |---|---|
   | Auth, crypto, input validation | security-reviewer |
   | Layer boundaries, component structure | architecture-alignment-checker |
   | CSS, design tokens, accessibility | design-consistency-checker |
   | Spec/requirement behavior | spec-alignment-checker |
   | Test files | code-quality-reviewer, test-quality-reviewer |
   | Task status, docs, spec files | housekeeper |
   | Hot paths, algorithmic changes | performance-reviewer |
   | Code structure, naming | code-simplifier |
   | IaC files, cloud config, IAM policies, Kubernetes manifests, Dockerfiles | cloud-infrastructure-reviewer |
   | CLAUDE.md files, project config | conventions-reviewer |

   Domain spillover grants closure-review authority over the disturbed surface only. It does not reopen the original branch for comprehensive review.

   For agents NOT re-run, carry forward their previous `approve` verdict and score into the aggregation table.

   Give every re-run agent a new findings path and the complete closure brief. Require `origin` and `causal_ref` on every new closure finding.

5. **Classify Closure Results**
   - Prior finding persists or a causally supported repair regression exists → return to step 4.1 with a new baseline-compatible repair envelope
   - Concrete critical/major `initial-audit-miss` inside the frozen baseline → add it to the finding ledger, fix it, and re-run only affected reviewers
   - `scope-expansion` → persist as unworked; it does not block closure
   - Repair-caused blocker without a causal reference, or any blocker based on `scope-expansion` → invalid reviewer artifact; do not fix it
   - Every assigned finding closed and every impacted reviewer approves → **PASS**

### 5. Stuck Detection

Track findings by key: `[Agent]-[Category]-[File]-[Line]`. You don't need full finding bodies in context to do this — derive `Agent` from the global ID prefix and rely on the iteration tracking notes (which carry global IDs) to count repeats. When you actually need to escalate to the user, **only then** Read the relevant `findings_file` once to extract `Category`/`File`/`Line`/`finding`/`recommendation` for the message. Stuck detection is rare; this one-shot read is bounded.

If same finding appears **3 times** (in runner mode, return `RESULT: FAILURE`; with `--noninteractive`, return `Validation INCOMPLETE`; otherwise ask):

```markdown
## Stuck - Need User Input

Issue persists after 3 attempts:

**[Agent] Finding description**
- File: path/to/file.ts
- Line: 42
- Attempts:
  1. [what was tried]
  2. [what was tried]
  3. [what was tried]

I need clarification: [specific question]
```

- Outside runner and noninteractive modes, use AskUserQuestion for guidance
- Apply fix based on user input
- Continue loop

Also escalate when:
- Conflicting requirements between agents
- Missing information to implement fix

### 5.5. Persist Unexecuted Findings

After all agents approve—or before returning `Validation INCOMPLETE` in noninteractive mode—persist any unfixed findings via the helper script. You do **not** `Read` any findings file yourself, and you do **not** `Read` the file the script produces. The helper does all of the file I/O outside your context window.

1. Build `fixed_ids_csv` by joining (with commas, no spaces) every global ID in `findings_fixed` across every iteration of your tracking notes. (Free — these IDs are already in your context.) If no findings were fixed, pass an empty string.
2. Resolve `task_id` from the task definition context (e.g. `TASK-042: Title`). If no task context is available, use `"manual-validation"`.
3. Run:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/persist-unworked-findings.js \
     --findings-dir "<findings_dir>" \
     --specs-dir   "{{specs_dir}}" \
     --task-id     "<task_id>" \
     --fixed-ids   "<fixed_ids_csv>" \
     --run-id      "<run_id>"
   ```
4. **Do NOT print, echo, `cat`, or `Read` the contents of the file the script produces** — that would re-pollute your context with the very findings the script exists to keep out. The single-line JSON the script writes to stdout is the only thing you look at.
5. Parse that one-line JSON:
   - `status: "written"` → in the final report, write `Unexecuted findings: <total> persisted to <written>` where `<total>` is `counts.critical + counts.major + counts.minor` and `<written>` is the path the script returned.
   - `status: "empty"` or `status: "no-findings-files"` → in the final report, write `Unexecuted findings: 0`.
   - **Stop there — do not summarize what's in the file.**

### 6. Return Result

**Runner-mode validation receipt:** Before the PASS line, inspect the full task-worktree status without changing it. Use `action: "commit"` when validation fixes or persisted artifacts remain, and propose an expressive `<task-id>: ...` subject plus a body describing the fixes and verification. Use `action: "none"` only when the worktree is clean, and omit `commit`. The runner stages and commits after verifying the receipt.

Before emitting any PASS result, persist the reusable completion receipt. For `action: "none"`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/validation-session.js complete \
  --run-dir "<run_dir>" \
  --expected-stage "review-batch-complete" \
  --iterations "<N>" \
  --fixed "<M>" \
  --unworked "<K>" \
  --action "none"
```

For `action: "commit"`, use the same command with `--action "commit" --commit-subject "<subject>" --commit-body "<body>"`. Only a successful `complete` transition authorizes PASS. Retain `run_dir`; it is the restart record, not temporary cleanup.

**On PASS outside runner mode:** emit one line:

```
Validation PASSED ({N} iter, {M} fixed, {K} unworked → <written>)
```

Where `<written>` is the path returned by `persist-unworked-findings.js`; omit ` → <written>` if the helper returned status `empty` or `no-findings-files`. Do not echo the per-iteration fix list — findings are accessible via the per-iteration JSON files on disk.

Return control to calling skill.

**On incomplete noninteractive validation:** after step 5.5, preserve the worktree and durable session, then emit:

```text
Validation INCOMPLETE ({N} iter, reason: <reason>)
```

Do not restart validation or merge.

**On PASS in runner mode:** make the final line compact JSON with the exact runner token and task identity:

```text
RESULT: VALIDATED | {"v":1,"token":"<exact-runner-token>","task_id":"TASK-NNN","phase":"validate","action":"commit","iterations":<N>,"fixed":<M>,"unworked":<K>,"commit":{"subject":"TASK-NNN: <expressive validation outcome>","body":"<fix and verification summary>"}}
```

When `action` is `none`, omit `commit`.

## Severity Reference

| Level | Action |
|-------|--------|
| critical | Blocks when owned by a valid `request-changes` review, including a concrete late finding inside the frozen baseline |
| major | Blocks when owned by a valid `request-changes` review; approved findings are persisted |
| minor | Non-blocking; persist if unexecuted |
