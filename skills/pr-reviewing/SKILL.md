---
name: pr-reviewing
description: Use when reviewing a GitHub PR - runs multi-agent verification against PR changes, deduplicates findings, and posts inline/general comments to GitHub
user-invocable: false
---

# PR Review Skill

Multi-agent PR review that runs specialized agents against PR changes and posts structured feedback to GitHub.

## Non-Interactive Mode Detection

Check for non-interactive mode from either source:
1. If the argument string contains `--no-interactive` → strip it from the argument before PR number parsing, set `non_interactive = true`
2. If session context contains `GROUNDWORK_BATCH_MODE=true` → set `non_interactive = true`

If either condition is met, all `AskUserQuestion` prompts below are replaced with their documented auto-decision — **except** the pre-flight model check, which always prompts.

## Pre-flight: Model Recommendation

**Your current effort level is `{{effort_level}}`.**

Skip this step silently if effort is `high` or higher AND you are Sonnet or Opus.
If effort is below `high`, you MUST show the recommendation prompt — regardless of model.
If you are not Sonnet or Opus, you MUST show the recommendation prompt - regardless of effort level.

Otherwise → **always prompt** (even in non-interactive mode) using `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Do you want to switch? Multi-agent orchestration and deduplication judgment across 6-8 agents benefits from consistent reasoning.\n\nTo switch: cancel, run `/effort high` (and `/model sonnet` if on Haiku), then re-invoke this skill.",
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

## Step 1: Parse PR Identifier

Extract the PR number from the user's input. Accept any of these formats:
- Numeric: `42`
- With hash: `#42`
- Full URL: `https://github.com/owner/repo/pull/42`

If no PR identifier was provided:
- **Non-interactive mode:** Output an error: "No PR identifier provided. Cannot proceed in non-interactive mode." and stop.
- **Interactive mode:** Use `AskUserQuestion` to ask for one (free-text input, no options).

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

2. **PR diff**:
   ```bash
   gh pr diff <pr_number>
   ```
   Store as `pr_diff`.

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
  - **Interactive mode:** Use `AskUserQuestion`:
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
- If `isCrossRepository` is true, run `gh pr checkout <pr_number>` to fetch the fork's branch.
- Otherwise, checkout the PR branch: `gh pr checkout <pr_number>`.

## Step 3: Handle Existing Feedback

### 3a: Detect Previous Groundwork Reviews

Search `existing_reviews` for reviews whose body contains the marker `<!-- groundwork-review -->`.

**If groundwork reviews exist:**

- **Non-interactive mode:** Proceed with a fresh review (default).
- **Interactive mode:** Use `AskUserQuestion`:
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

If `existing_comments` contain replies to previous groundwork-authored comments (detected by `<!-- groundwork-review -->` marker or matching author):
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

**Skip `spec-alignment-checker`** — it performs internal EARS requirement tracing which is not relevant to PR review.

Check for architecture and design docs:
- Architecture: look for `{{specs_dir}}/architecture.md` or `{{specs_dir}}/architecture/`
- Design system: look for `{{specs_dir}}/design_system.md` or `{{specs_dir}}/design_system/`

Record skipped agents with reason in the aggregation table (verdict: `skipped`).

## Step 5: Launch Agents in Parallel

**CRITICAL — Context budget**: Do NOT read file contents, full diffs, or docs into this orchestrating context. Collect only file paths and metadata. Agents have Read/Grep/Glob tools and will read files in their own context windows.

Spawn all active agents **in parallel** using the `Agent` tool with `subagent_type`. Each agent receives:

| Agent (`subagent_type`) | Context to Provide |
|-------------------------|-------------------|
| `groundwork:code-quality-reviewer:code-quality-reviewer` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `groundwork:test-quality-reviewer:test-quality-reviewer` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `groundwork:security-reviewer:security-reviewer` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `groundwork:performance-reviewer:performance-reviewer` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `groundwork:code-simplifier:code-simplifier` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `groundwork:housekeeper:housekeeper` | `changed_file_paths`, `diff_stat`, `pr_description`, `existing_human_feedback` |
| `groundwork:architecture-alignment-checker:architecture-alignment-checker` | `changed_file_paths`, `diff_stat`, `pr_description`, `architecture_path`, `existing_human_feedback` |
| `groundwork:design-consistency-checker:design-consistency-checker` | `changed_file_paths`, `diff_stat`, `pr_description`, `design_system_path`, `existing_human_feedback` |

**In each agent prompt, include these instructions:**

> Use the Read tool to examine these files. Do NOT expect file contents in this prompt — read them yourself.
>
> **PR Review context**: You are reviewing a pull request, not a local task implementation. The `pr_description` below replaces `task_definition`. Focus ONLY on code within the PR diff. Do not flag issues in unchanged code unless the change directly impacts it.
>
> **Existing feedback**: Other reviewers have already raised the points summarized below. Do not restate these — focus on issues not yet covered.

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
```

### 6b: Deduplication Pass (LLM-driven)

Group all findings by file. For findings within **3 lines** of each other with semantically similar text:
- Merge into a single finding
- Keep the **higher severity**
- Attribute **all source agents** (e.g., "from: code-quality-reviewer, security-reviewer")
- Combine recommendations

If running in **incremental mode** (from Step 3a), also exclude findings that match previous groundwork review comments.

### 6c: Diff Mapping

Parse `pr_diff` to determine which finding lines fall within diff hunks. Use the `@@` hunk headers to map original/new line numbers.

- Findings whose `line` falls within a diff hunk on the RIGHT side → `inline_findings[]` (will be posted as inline review comments)
- Findings whose `line` falls outside any diff hunk → `general_findings[]` (will be included in review body)

## Step 7: Confirm with User

- **Non-interactive mode:** Log the summary below, then proceed directly to Step 8 (post review).
- **Interactive mode:** Show a preview via `AskUserQuestion`:

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
2. If a temporary branch was created during checkout, delete it:
   ```bash
   git branch -D pr-<pr_number>-review 2>/dev/null || true
   ```
3. Display final summary:
   ```markdown
   ## PR Review Posted

   **[PR title]** (#[pr_number]) — [url]

   - Event: [APPROVE / REQUEST_CHANGES / COMMENT]
   - Inline comments: [N]
   - General findings: [N]
   - Agents: [N] run, [N] skipped
   ```

## Key Design Notes

1. **Read-only**: Unlike validation-loop, PR review does not fix issues — it only reports findings.
2. **Agent context adaptation**: Agents receive `pr_description` (PR title + body) instead of `task_definition`. They are prompted to focus on diff scope only.
3. **Deduplication is LLM-driven**: The orchestrating LLM compares findings by proximity and similarity — no external code needed.
4. **Diff position mapping**: Uses GitHub's `line` + `side=RIGHT` API. Parses diff hunk headers (`@@ -a,b +c,d @@`) to determine which lines are in scope.
5. **Atomic review posting**: Single API call posts both inline comments and summary, avoiding noisy multiple notifications.
6. **Groundwork marker**: `<!-- groundwork-review -->` HTML comment in review body enables identifying previous groundwork reviews for incremental mode.

## Severity Reference

| Level | Meaning |
|-------|---------|
| critical | Serious defect — security vulnerability, data loss, crash |
| major | Significant issue — logic error, missing edge case, poor design |
| minor | Improvement opportunity — style, naming, minor optimization |
