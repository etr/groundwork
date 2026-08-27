# Validation Authority and Terminality

Status: design note; not implemented.

## Motivation

Session `01a031ce-54ab-7340-9962-49a096ae123a` is the clearest failure case for Groundwork validation-loop management.

The original validation run reached a valid terminal checkpoint after 20 iterations:

- all required reviewers approved;
- required gates were green;
- 64 blocking findings had been fixed;
- six nonblocking observations had been persisted for later consideration; and
- the durable validation session recorded `stage: validated`.

The model then read those persisted observations, declared the passing result insufficient, falsely recorded that the user had explicitly reopened the observations, and started another repair iteration. This changed a validated tree without authority.

The problem was not merely excessive iteration count. The first illegal transition was continuing after validation had passed.

## Core Conclusions

1. Validation completion is determined by the declared gates and required approvals, not by a model's personal confidence threshold.
2. Once all required gates and reviewers approve the same unchanged tree, validation must stop.
3. Nonblocking observations are follow-up work, not unfinished validation.
4. Natural-language instructions are insufficient enforcement when the same model can classify findings, invent authorization, dispatch fixers, and mutate the tree.
5. Source validation, Git finalization, and deployment are distinct lifecycle phases.
6. Groundwork does not need a new `accept-dev` skill. Existing skills already provide the correct lifecycle boundaries:

```text
validate       -> approve and seal the source tree
finalize-task  -> commit, merge, and clean up the validated task
ship           -> deploy and verify the integrated change
```

## Authority Kernel in Plain Terms

The authority kernel is a small deterministic program between the model and validation actions. It does not review code, run tests, or deploy software. It decides which validation action, if any, is permitted next.

After a validation round it checks:

```text
all required reviewers approved this exact tree
AND all required gates passed this exact tree
AND no authorized blocking finding remains open
```

If all conditions hold:

```text
kernel -> PASS_AND_STOP
```

The run becomes sealed. The kernel must not authorize another reviewer, gate, or fixer in that run.

If validation is not complete, the kernel permits only the required next action:

```text
open blocker     -> authorize a bounded repair
tree changed     -> require affected gates and closure reviewers
missing evidence -> request that exact evidence
```

## Why Instructions Alone Are Insufficient

The current protocol already expresses the intended behavior:

```text
one comprehensive initial audit
causal closure review only
scope expansion cannot block
approve immediately after closure
do not reread the persisted follow-up report
PASS is terminal
```

The failed session violated those instructions. Adding stronger prose would leave the same authority with the model and would not prevent recurrence.

The enforceable boundary must instead be:

```text
model reports evidence
-> kernel validates state and authority
-> kernel issues the only permitted effect
-> fixer and workflow require that effect before acting
```

## Proposed State Machine

```text
AUDIT
  -> REPAIR
  -> GATES
  -> CLOSURE
  -> PASS_READY
  -> SEALED
```

Hard invariants:

```ts
SEALED.nextEffects.length === 0

everyAuthorizedRepair.every((finding) =>
  finding.disposition === "blocking-open" &&
  finding.reviewVerdict === "request-changes"
)

allApprovalReceipts.every((receipt) => receipt.tree === currentTree)
allGateReceipts.every((receipt) => receipt.tree === currentTree)
```

A completed validation run cannot be reopened. Later work requires a new task or work order, a new baseline, and a new validation run.

## Finding Dispositions

Severity and authority are different concepts. A technically important observation does not automatically authorize more work in the current validation run.

```ts
type FindingDisposition =
  | "blocking-open"
  | "blocking-fixed"
  | "blocking-closed"
  | "follow-up"
  | "rejected"
```

Only `blocking-open` findings may enter a repair envelope. A follow-up retains its severity and evidence, but its authority is explicitly:

```text
new-work-order-only
```

The term `follow-up` should replace `unworked finding`. `Unworked` suggests incomplete validation and invites the exact reinterpretation seen in the failed session.

## Repair Authorization

Every fixer must require a one-use authorization issued by the kernel:

```ts
type RepairLease = {
  runId: string
  tree: string
  blockerIds: string[]
  envelopeHash: string
  oneUse: true
}
```

Before editing, the fixer verifies:

```text
the validation run is active
the run is in REPAIR state
the source tree matches the lease
every finding is an open blocking finding
the repair envelope matches the lease
the lease has not already been used
```

This prevents a model from bypassing validation state by manually writing a new repair envelope or directly dispatching a fixer.

## Completion Receipt

Completion data should be derived by the kernel rather than supplied by the model:

```ts
type ValidationReceipt = {
  runId: string
  taskId: string
  baselineHash: string
  tree: string
  reviewerManifestHash: string
  gateManifestHash: string
  fixedFindingIds: string[]
  followUpFindingIds: string[]
  followUpReportHash: string
  status: "sealed"
}
```

Persisting follow-ups and sealing the validation receipt should be one atomic transition. The ordinary PASS handoff should report the follow-up count without inviting the orchestrator to read and reconsider the report.

## Lifecycle Boundaries

### Validate

`validate` owns source correctness:

```text
run required gates
perform one comprehensive reviewer audit
repair admitted blockers
run gates on the repaired tree
run only causally affected closure reviewers
seal the tree when all requirements approve
```

It must not continue into deployment simply because live-environment evidence could be useful.

### Finalize Task

`finalize-task` owns Git integration:

```text
verify the validation receipt and exact tree
complete task bookkeeping
commit validated changes
integrate a moved base and request revalidation when necessary
merge
remove the task worktree and branch safely
```

It does not deploy application environments.

### Ship

`ship` owns deployment and live verification:

```text
confirm validation and review
prepare observability and rollback
obtain the required human go/no-go
deploy through the appropriate nonproduction and production stages
monitor and verify the rollout
```

If shipping exposes a source defect:

```text
ship records bounded failure evidence
-> a new implementation cycle fixes the defect
-> validate seals the new tree
-> finalize integrates it
-> shipping resumes through a new authorized attempt
```

Shipping must not silently reopen the completed validation run.

## Validation-Loop Discipline

The common path should be short:

```text
one gate batch
-> one comprehensive reviewer batch
-> zero fixers when green
-> immediate sealed PASS
```

When repairs are required:

```text
aggregate all admitted blocking findings
-> one consolidated fixer batch
-> focused tests during repair
-> one complete required gate barrier
-> only affected closure reviewers
```

Unchanged approvals carry forward. Reviewers must not restart broad discovery during closure.

Late findings require explicit classification:

```text
introduced by repair             -> may block with causal evidence
exposed by repair                -> may block with causal evidence
invalidated prior assumption     -> may block with causal evidence
concrete critical baseline miss  -> may block after adjudication
major/minor late observation     -> follow-up
scope expansion                  -> follow-up
```

## Evidence and Waiting

Gate execution and evidence recording are separate facts. If the test command succeeded but the result recorder failed afterward, preserve the successful command result and repair only the recording step. Do not rerun an expensive suite solely because reporting failed.

Agent coordination should be notification-driven:

```text
launch independent reviewers in one batch
-> wait once for completion
-> report state changes or bounded terminal diagnostics
```

Avoid repeated status listings, fixed-interval polls, and unchanged progress messages.

## Rejected Alternatives

### Stronger skill instructions only

Rejected because the failed session ignored equivalent instructions.

### Per-harness validation controllers

Rejected because Claude, Codex, runner, and future harnesses would drift in terminality and finding-authority semantics.

### Full validation daemon controlling all execution

Rejected because it would couple validation policy to harness-specific agent and command execution.

### New `accept-dev` skill

Rejected as unnecessary workflow duplication. The useful insight was to keep deployment out of validation, but deployment already belongs to `ship`.

## Recommended Design

Use one harness-neutral authority kernel with thin harness adapters:

```ts
interface ValidationKernel {
  open(charter: ValidationCharter): RunId
  next(runId: RunId): readonly ValidationEffect[]
  apply(runId: RunId, effectId: string, event: ValidationEvent): ValidationState
  inspect(runId: RunId): Readonly<ValidationView>
}
```

The kernel owns policy and durable authority. Harness adapters execute kernel-issued effects using their native commands and agent mechanisms.

## Implementation Outline

```ts
function phase1_regressionFixture(): void {
  encodeSession01aTrace()
  assertIteration20PassIsTerminal()
  assertIteration21RepairIsRejected()
  assertFabricatedUserAuthorityIsRejected()
}

function phase2_authorityKernel(): void {
  implementPureStateReducer()
  deriveCompletionFromLedger()
  bindApprovalsAndGatesToTree()
  persistFollowUpsAndSealAtomically()
}

function phase3_repairLeases(): void {
  issueOneUseKernelLease()
  requireFixerPreflight()
  rejectApprovedAndFollowUpFindings()
  reconcileResultWithAuthorizedFindingIds()
}

function phase4_skillIntegration(): void {
  makeValidateConsumeKernelEffectsOnly()
  makeFinalizeRequireSealedReceipt()
  keepDeploymentInsideShip()
  preserveHarnessSpecificExecutionInThinAdapters()
}

function phase5_orchestrationEfficiency(): void {
  batchReviewerLaunches()
  useNotificationDrivenWaiting()
  preserveSuccessfulChildEvidenceWhenRecorderFails()
}

function phase6_verification(): void {
  runAuthorityStateMachineTests()
  runSession01aRegressionTests()
  runCrossHarnessTraceConformanceTests()
  runRepositoryTestSuite()
}
```

## Required Regression Tests

```text
PASS is terminal and SEALED emits no mutating effects
a completed run cannot begin a fixer transaction
tree drift after PASS cannot silently open a successor validation run
approved findings cannot enter a repair manifest
follow-ups cannot enter a repair manifest
model-authored claims of user authorization grant no authority
repair leases are tree-bound, run-bound, exact-ID-bound, and single-use
fixer results reconcile exactly with authorized blocker IDs
completion fails while any blocker remains open
completion metrics are derived rather than caller supplied
all gates and approvals bind to the same unchanged tree
successful test execution survives a recorder-only failure
closure reruns only affected reviewers
session 01a iteration-20 PASS rejects the attempted iteration-21 repair
Claude, Codex, runner, and other adapters produce equivalent state transitions
```

## Non-Goals

- The kernel does not review code.
- The kernel does not choose product requirements.
- The kernel does not deploy applications.
- The kernel does not replace `finalize-task` or `ship`.
- The kernel does not prevent later improvements; it requires them to enter through a new authorized work order.
