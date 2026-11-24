# `check-specs-alignment`

> **Run it:** `/groundwork:check-specs-alignment [context]` · **Tier:** user-run or model-invoked · **Reads:** the PRD, the architecture, the task catalog if present, the codebase · **Writes:** nothing itself — an Alignment Report in the conversation, then a choice of how to resolve

## What it does

Checks the code against the written specs in both directions: whether each requirement and decision is implemented, and whether the code contains things the specs never mention. For each EARS requirement in the PRD it searches the codebase for implementation evidence and marks it `Implemented`, `Partially Implemented`, `Not Implemented`, or `Deviated`; for each architecture decision (`DR-NNN`) it marks the implementation `Aligned` or `Deviated`. It also lists undocumented features and undocumented components, and compares each task's recorded status with the code. The result is an Alignment Report, followed by a choice of how to resolve what it found.

## When to reach for it

- You want to know whether the code still matches the PRD and the architecture, requirement by requirement and decision by decision, before deciding which side to change.
- A requirement shipped differently from how the PRD describes it, or a component appeared that the architecture never mentions, and the code and the spec have not been reconciled.
- The task catalog's statuses look stale: a task recorded `Complete` with no code behind it, or code already satisfying a task still `Not Started` or `Blocked`.
- **Not when:** the change is finished and you want it reviewed and repaired. That is `validate`; this skill reports, then offers options.

## Common questions

**It found drift. Did it change anything?**

No. It presents the Alignment Report and then offers three options: update the specs to match the implementation (`/groundwork:source-product-specs-from-code`, `/groundwork:source-architecture-from-code`), list the implementation changes needed to match the specs, or go through each misalignment individually.

**A requirement is marked `Deviated`. Is the code wrong or the spec?**

The skill does not decide. `Deviated` means the implementation differs from the requirement, and either side may give: align the code, or update the PRD. Architecture is the same: refactor, or update the architecture.

**What is the "Task Status Consistency" table?**

The third part of the report, produced when a task catalog exists. It lists tasks recorded `Complete` with no trace of their goal or acceptance criteria in the code, and tasks still `Not Started` or `Blocked` whose criteria the code already satisfies — there the status is stale, not the code. Without a task catalog the section reads "No task catalog".

**Can it check one requirement or one component instead of everything?**

Yes. Pass the scope as the argument — a requirement or decision ID (`/groundwork:check-specs-alignment PRD-AUTH-REQ-002`), a task ID, a feature name, or a path. The report is limited to that scope and says in one line what was left unchecked.

**It says "Cannot check alignment - missing specs".**

It needs the PRD and the architecture; the task list is read only if it exists. The message lists what is missing and the skill that creates each: `/groundwork:design-product` for the PRD, `/groundwork:design-architecture` for the architecture, `/groundwork:create-tasks` for tasks.

## It's working if

- The report has three sections: PRD Alignment, Architecture Alignment, and Task Status Consistency.
- Every PRD requirement carries one of four statuses — `Implemented`, `Partially Implemented`, `Not Implemented`, `Deviated` — and its Notes cell says where the evidence was found or what is missing.
- Each of the first two sections ends in a summary count, such as `X/Y requirements implemented, Z partially implemented, W not implemented, V deviated`.
- Undocumented Features and Undocumented Components are each listed, or say "None detected".
- Task Status Consistency names the tasks in each row, or reads "No task catalog".
- The report ends with the three resolution options.

**It is not working if:** a requirement shows `Implemented` with no evidence behind it, or a task catalog exists but the report has no Task Status Consistency section.
