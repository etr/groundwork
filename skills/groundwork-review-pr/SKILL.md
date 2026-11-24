---
name: groundwork-review-pr
description: Review a GitHub PR using multi-agent verification. Optional flag - --no-interactive skips every prompt and auto-publishes the review.
---
## Portable Project Context

Before interpreting project-context placeholders in this workflow:

1. Resolve the directory containing this `SKILL.md`.
2. Run `node <skill-directory>/scripts/project-context-cli.js resolve --harness zcode` from the repository working directory.
3. Use the returned JSON values as the exact bindings for `{{project_name}}`, `{{project_root}}`, `{{specs_dir}}`, `{{plans_dir}}`, `{{debug_dir}}`, and `{{research_dir}}` everywhere below.
4. If `selection_required` is true, follow the `groundwork-select-project` workflow, then resolve again.


# PR Review Skill

Multi-agent PR review that runs specialized agents against PR changes and posts structured feedback to GitHub. It reports findings and never changes code — fixing is the `validate` skill's job.

## Non-Interactive Mode Detection

Check for non-interactive mode from either source:
1. If the argument string contains `--no-interactive` → strip it from the argument before PR number parsing, set `non_interactive = true`
2. If session context contains `GROUNDWORK_BATCH_MODE=true` → set `non_interactive = true`

If either condition is met, every `Ask the user` prompt below is replaced with its documented auto-decision, and the pre-flight model check is skipped too.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.** Skip this step silently if effort is `high`, `xhigh`, or `max` (the scale is `low` < `medium` < `high` < `xhigh` < `max`, so `xhigh` and `max` are already above `high`). Otherwise ask via `Ask the user` (header "Model check"; options "Continue anyway" / "Cancel — I'll switch first"):

> "Do you want to switch? Multi-agent orchestration and deduplication judgment across the reviewer agents benefits from consistent reasoning.
>
> Recommended: GLM with reasoning at max.
>
> To switch: cancel, raise the reasoning effort to max in the model settings (and switch to GLM in the model picker if you are on GLM-Flash), then re-invoke this skill."

If the user selects "Cancel — I'll switch first": output the switching commands and stop. Do not proceed with the skill. Ask once per conversation: a skill invoked by another skill skips this step when the recommendation was already shown. In a non-interactive run (`--noninteractive`, `GROUNDWORK_RUNNER_MODE=true`, or `GROUNDWORK_BATCH_MODE=true`), skip the prompt and continue on the current model.

## Step 1: Parse PR Identifier

Extract the PR number from the user's input. Accept any of these formats:
- Numeric: `42`
- With hash: `#42`
- Full URL: `https://github.com/owner/repo/pull/42`

If no PR identifier was provided:
- **Non-interactive mode:** Output an error: "No PR identifier provided. Cannot proceed in non-interactive mode." and stop.
- **Interactive mode:** Use `Ask the user` to ask for one (free-text input, no options).

Extract `owner/repo` by running:
```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

Store the PR number as `pr_number` and the owner/repo as `repo_slug`.

## Step 2: Fetch PR Context

Run all of these `gh` commands **in parallel** using the Bash tool:

1. **PR metadata**:
   ```bash
   gh pr view <pr_number> --json title,body,baseRefName,headRefName,headRefOid,author,state,url,isCrossRepository,additions,deletions,changedFiles
   ```

2. **PR diff — saved to a temp file; only its hunk headers enter this context**:
   ```bash
   PR_DIFF_FILE="$(mktemp "${TMPDIR:-/tmp}/groundwork-pr-diff-XXXXXX")" && gh pr diff <pr_number> > "$PR_DIFF_FILE" && grep -nE '^(diff --git|@@)' "$PR_DIFF_FILE"
   ```
   The full diff never enters this context (the context-budget rule in Step 5). Keep the printed header lines as `pr_hunk_headers` — the `diff --git` file names and the `@@` new-side line numbers that Step 6c maps findings with — and keep `PR_DIFF_FILE` for the cleanup in Step 9.

3. **Changed file paths**:
   ```bash
   gh pr view <pr_number> --json files --jq '.files[].path'
   ```
   Store as `changed_file_paths`.

4. **Diff stat**:
   ```bash
   gh pr diff <pr_number> --stat
   ```
   Store as `diff_stat`.

5. **Existing reviews**:
   ```bash
   gh api repos/<repo_slug>/pulls/<pr_number>/reviews
   ```
   Store as `existing_reviews`.

6. **Existing review comments**:
   ```bash
   gh api repos/<repo_slug>/pulls/<pr_number>/comments
   ```
   Store as `existing_comments`.

**Validate state:**
- If the PR state is not `OPEN`:
  - **Non-interactive mode:** Log a warning ("PR is [state] — continuing anyway") and proceed.
  - **Interactive mode:** Use `Ask the user`:
    ```json
    {
      "questions": [{
        "question": "This PR is **[state]**. Continue reviewing anyway?",
        "header": "PR is not open",
        "options": [
          { "label": "Yes, continue" },
          { "label": "Cancel" }
        ],
        "multiSelect": false
      }]
    }
    ```
    If "Cancel" → stop.
- Check the PR head out into a local review branch — the same way for forks and same-repo PRs, and the branch the cleanup in Step 9 deletes:
  ```bash
  git fetch origin +pull/<pr_number>/head:pr-<pr_number>-review && git checkout pr-<pr_number>-review
  ```

**Concurrent same-PR reviews in one clone:** the fetch above creates `pr-<pr_number>-review` or moves it to the PR's current `headRefOid`, so a branch left by a previous review is reused idempotently instead of fought over — note in your output that an existing review branch was reused. If the checkout is refused because another worktree has that branch checked out, a concurrent review holds it: report that and stop rather than moving the branch underneath it.

## Step 3: Handle Existing Feedback

### 3a: Detect Previous Groundwork Reviews

Search `existing_reviews` for reviews whose body contains the marker `<!-- groundwork-review -->`.

**If groundwork reviews exist:**

- **Non-interactive mode:** Proceed with a fresh review (default).
- **Interactive mode:** Use `Ask the user`:
  ```json
  {
    "questions": [{
      "question": "Previous groundwork review(s) found on this PR. How would you like to proceed?",
      "header": "Existing groundwork reviews detected",
      "options": [
        { "label": "Fresh review", "description": "Post a fresh review (dismisses previous)" },
        { "label": "Incremental review", "description": "Only new findings since last groundwork review" },
        { "label": "Cancel" }
      ],
      "multiSelect": false
    }]
  }
  ```

If "Fresh review" → proceed normally.
If "Incremental review" → store previous groundwork findings to exclude duplicates in Step 6.
If "Cancel" → stop.

### 3b: Summarize Non-Groundwork Feedback

If non-groundwork reviews or review comments exist, produce a brief summary as `existing_human_feedback`. Include:
- Reviewer name and verdict (APPROVED, CHANGES_REQUESTED, COMMENTED)
- Key points raised

This summary will be passed to agents so they avoid restating already-raised points.

### 3c: Handle Replies on Previous Groundwork Comments

If `existing_comments` contain replies to previous groundwork-authored comments. A comment is groundwork-authored when its review's body carries the `<!-- groundwork-review -->` marker; inline comments carry no marker of their own, so match them through their parent review or its author:
- Present these reply threads to the user
- Recommend responses and paths forward before proceeding with the new review

## Step 4: Determine Active Agents

Parse `changed_file_paths` to determine which conditional agents to enable:

| Agent | Active | Skip when |
|-------|--------|-----------|
| `code-quality-reviewer` | Always | -- |
| `test-quality-reviewer` | Always | -- |
| `security-reviewer` | Always | -- |
| `performance-reviewer` | Always | -- |
| `code-simplifier` | Always | -- |
| `housekeeper` | Always | -- |
| `architecture-alignment-checker` | Conditional | No architecture docs found at `{{specs_dir}}/` |
| `design-consistency-checker` | Conditional | No design system docs AND no CSS/styling files in `changed_file_paths` |
| `cloud-infrastructure-reviewer` | Conditional | No IaC/config files in `changed_file_paths` |
| `conventions-reviewer` | Conditional | No CLAUDE.md files found in the repo |
| `spec-alignment-checker` | Conditional | No product specs found at `{{specs_dir}}/` |

`spec-alignment-checker` covers the "did we build the *right thing*" axis: PRs that went through the full lifecycle already had it checked by `validate` (with fix authority); activating it here catches PRs that bypassed the lifecycle — external contributions, manually assembled branches.

Check for architecture, design, and product-spec docs:
- Architecture: look for `{{specs_dir}}/architecture.md` or `{{specs_dir}}/architecture/`
- Design system: look for `{{specs_dir}}/design_system.md` or `{{specs_dir}}/design_system/`
- Product specs: look for `{{specs_dir}}/product_specs.md` or `{{specs_dir}}/product_specs/`

Record skipped agents with reason in the aggregation table (verdict: `skipped`).

## Step 5: Launch Agents in Parallel

**CRITICAL — Context budget**: Do NOT read file contents, full diffs, or docs into this orchestrating context. Collect only file paths and metadata. Agents have Read/Grep/Glob tools and will read files in their own context windows.

Spawn all active agents **in parallel** using the `Agent` tool with `sub-task_type`. Each agent receives:

| Agent (`sub-task_type`) | Context to Provide |
|-------------------------|-------------------|
| `the code-quality-reviewer agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `the test-quality-reviewer agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `the security-reviewer agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `the performance-reviewer agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `the code-simplifier agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `the housekeeper agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `the architecture-alignment-checker agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `architecture_path`, `existing_human_feedback` |
| `the design-consistency-checker agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `design_system_path`, `existing_human_feedback` |
| `the cloud-infrastructure-reviewer agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `architecture_path`, `existing_human_feedback` |
| `the conventions-reviewer agent` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `the spec-alignment-checker agent` | `changed_file_paths`, `diff_stat`, `task_definition`, `specs_path`, `existing_human_feedback` |

For `spec-alignment-checker`, `task_definition` is what it traces requirements to, so build it from the best available source. When the head branch is a task branch (`task/TASK-NNN`, or `task/<project>/TASK-NNN` in a monorepo), point the agent at the tasks file and the task ID and have it read that `### TASK-NNN` section itself (goal, action items, acceptance criteria). Otherwise pass the PR title + body as the definition and say that the PR's stated intent is the scope. `specs_path` is the product-specs file or directory found in Step 4.

**In each agent prompt, include these instructions:**

> Use the Read tool to examine these files. Do NOT expect file contents in this prompt — read them yourself.
>
> **PR Review context**: You are reviewing a pull request, not a local task implementation. The `pr_description` below replaces `task_definition`. Focus ONLY on code within the PR diff. Do not flag issues in unchanged code unless the change directly impacts it.
>
> **Existing feedback**: Other reviewers have already raised the points summarized below. Do not restate these — focus on issues not yet covered.
>
> **Tooling boundary**: Skip anything the project's tooling already enforces — linter, typechecker, formatter, CI gates. A finding must be actionable judgment beyond what a deterministic check catches; "the linter would flag this" is not a finding.
>
> **Review mode**: `review_mode: initial-audit`. Your baseline is the PR diff (the changed files below) together with the PR's stated intent: make one comprehensive pass over it and report every supported finding with concrete evidence.

Where `pr_description` is the PR title + body concatenated.

Each agent returns standard JSON:
```json
{
  "summary": "One-sentence assessment",
  "score": 0-100,
  "findings": [{"severity": "critical|major|minor", "category": "...", "file": "...", "line": N, "finding": "...", "recommendation": "..."}],
  "verdict": "approve|request-changes"
}
```

## Step 6: Aggregate & Deduplicate

### 6a: Build Aggregation Table

```markdown
## PR Review — Multi-Agent Report

| Agent | Score | Verdict | Critical | Major | Minor |
|-------|-------|---------|----------|-------|-------|
| Code Quality | 85 | approve | 0 | 1 | 2 |
| Test Quality | 88 | approve | 0 | 1 | 0 |
| Security | 95 | approve | 0 | 0 | 1 |
| Performance | 82 | approve | 0 | 1 | 1 |
| Code Simplifier | 92 | approve | 0 | 0 | 2 |
| Housekeeper | 90 | approve | 0 | 1 | 0 |
| Architecture | -- | skipped | -- | -- | -- |
| Design | -- | skipped | -- | -- | -- |
| Cloud Infrastructure | -- | skipped | -- | -- | -- |
| Conventions | 95 | approve | 0 | 0 | 1 |
| Spec Alignment | -- | skipped | -- | -- | -- |
```

### 6b: Deduplication Pass (LLM-driven)

Group all findings by file. For findings within **3 lines** of each other with semantically similar text:
- Merge into a single finding
- Keep the **higher severity**
- Attribute **all source agents** (e.g., "from: code-quality-reviewer, security-reviewer")
- Combine recommendations

If running in **incremental mode** (from Step 3a), also exclude findings that match previous groundwork review comments.

### 6c: Diff Mapping

Use `pr_hunk_headers` (from Step 2) to determine which finding lines fall within diff hunks. Each `@@ -a,b +c,d @@` header places that hunk's new-side lines at `c` through `c+d-1` of the file named by the preceding `diff --git` line.

- Findings whose `line` falls within a diff hunk on the RIGHT side → `inline_findings[]` (will be posted as inline review comments)
- Findings whose `line` falls outside any diff hunk → `general_findings[]` (will be included in review body)

## Step 7: Confirm with User

- **Non-interactive mode:** Log the summary below, then proceed directly to Step 8 (post review).
- **Interactive mode:** Show a preview via `Ask the user`:

```json
{
  "questions": [{
    "question": "- **Inline comments**: [N]\n- **General findings**: [N]\n- **Verdict**: [APPROVE / REQUEST_CHANGES / COMMENT]\n- **Agents run**: [N] ([N] skipped)",
    "header": "PR Review Summary for [PR title] (#[pr_number])",
    "options": [
      { "label": "Post review" },
      { "label": "Show full preview", "description": "Display all findings before posting" },
      { "label": "Cancel" }
    ],
    "multiSelect": false
  }]
}
```

If "Show full preview" → display the full aggregation table plus all findings with their file/line/severity, then re-ask:

```json
{
  "questions": [{
    "question": "Review the findings above. Ready to post?",
    "header": "Post review?",
    "options": [
      { "label": "Post review" },
      { "label": "Cancel" }
    ],
    "multiSelect": false
  }]
}
```

If "Cancel" at either prompt → stop.

## Step 8: Post Review to GitHub

### 8a: Determine Review Event

- If ALL agents approved AND no critical or major findings → `event: APPROVE`
- If any agent returned `request-changes` OR any critical/major findings exist → `event: REQUEST_CHANGES`
- Otherwise → `event: COMMENT`

### 8b: Format Inline Comments

Each inline finding becomes a review comment:

```
**[severity]** [category] *(from: agent1, agent2)*

[finding]

**Recommendation:** [recommendation]
```

Map each to the GitHub review comment format:
- `path`: file path relative to repo root
- `line`: line number on the RIGHT side of the diff
- `side`: `RIGHT`

### 8c: Format Review Body

Build the review body:

```markdown
## Groundwork PR Review

[Aggregation table from 6a]

### General Findings

[List of general_findings not attached to inline comments]

---
*Reviewed by [N] agents | [N] findings ([N] inline, [N] general)*
<!-- groundwork-review -->
```

The `<!-- groundwork-review -->` marker at the end enables future identification of groundwork-authored reviews.

### 8d: Post Atomic Review

Post a single review using the GitHub API to avoid multiple notifications. Use `--input -` with a single-quoted heredoc to pass the JSON payload via stdin — this avoids shell interpolation issues with complex markdown bodies.

**Do NOT** generate Python, Node, or any helper scripts to post the review. Use the `gh api --input -` approach below directly.

```bash
cat <<'REVIEW_PAYLOAD' | gh api repos/<repo_slug>/pulls/<pr_number>/reviews --method POST --input -
{
  "event": "<EVENT>",
  "body": "<review_body>",
  "comments": [
    {
      "path": "src/example.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "This condition doesn't handle the edge case where `input` is empty.\n\n```suggestion\nif (!input || input.length === 0) {\n  return defaultValue;\n}\n```"
    }
  ]
}
REVIEW_PAYLOAD
```

**JSON escaping rules** — inside the heredoc, the JSON must be valid:
- Escape double quotes as `\"`
- Escape newlines in string values as `\n`
- Escape backslashes as `\\`
- The single-quoted heredoc (`<<'REVIEW_PAYLOAD'`) prevents shell expansion, so `$`, `` ` ``, and `\` are passed literally to `gh`

**Fallback**: If the API call fails due to an invalid line position, remove the offending comment from `comments[]`, append it to the review `body` under a "Could not attach inline" heading, and retry using the same `cat <<'REVIEW_PAYLOAD' | gh api --input -` approach.

## Step 9: Cleanup

1. Return to the original branch:
   ```bash
   git checkout -
   ```
2. Delete the review branch created in Step 2:
   ```bash
   git branch -D pr-<pr_number>-review 2>/dev/null || true
   ```
   A later review recreates it from the PR head, so this is safe even when you reused a branch a previous review left behind.
3. Remove the temp diff file:
   ```bash
   rm -f "$PR_DIFF_FILE"
   ```
4. Display final summary:
   ```markdown
   ## PR Review Posted

   **[PR title]** (#[pr_number]) — [url]

   - Event: [APPROVE / REQUEST_CHANGES / COMMENT]
   - Inline comments: [N]
   - General findings: [N]
   - Agents: [N] run, [N] skipped
   ```
