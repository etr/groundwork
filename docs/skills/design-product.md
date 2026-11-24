# `design-product`

> **Run it:** `/groundwork:design-product [product-name]` · **Tier:** user-run · **Reads:** the existing PRD, architecture, and `specs/design_system.md`, when present · **Writes:** a feature block in `specs/product_specs.md` (or `specs/product_specs/`), plus any open questions and a traceability note; past 500 lines or 15 features, a split into that directory

## What it does

Turns a feature request into requirements written in EARS syntax and added to the PRD. It clarifies the request through `understanding-feature-requests`, drafts the requirements, checks them against the existing PRD, the architecture, and the design system, then shows you the whole feature block before it edits anything. You approve the draft; only then is the PRD changed.

## When to reach for it

- You are defining a product's requirements for the first time.
- You want to add, change, or remove a feature in an existing PRD.
- **Not when:** the feature is already built and the PRD has to catch up. That is `source-product-specs-from-code`.

## Common questions

**It stopped and asked whether I want to switch models.**

That is the pre-flight step, not a failure. It recommends Opus (1M context) at high effort, and is skipped silently only when both are already true. Choose *Continue* to proceed as you are. The question is asked once per conversation — a skill invoked by another skill skips it once it has been shown — and a non-interactive run (a batch or the runner) skips it too.

**I ran it in plan mode. Did it skip the interview?**

No. The full workflow still runs — clarify, draft, approve — but the plan describes only the PRD file edits: which file, where to insert, what content. It does not plan architecture or code.

**It turned my single-file PRD into a directory without asking.**

By design. After the edit, it counts the PRD's lines and features. At 500 lines or 15 features it runs `split-specs` automatically, with no user input, and says so in its confirmation.

**It stopped on a conflict with an existing requirement.**

Each conflict it finds — with an existing requirement, a technology choice in the architecture, or a design-system pattern — comes with a recommended resolution. For a contradiction with an existing requirement it offers three options: modify the new requirement, update the existing one, or accept the conflict as a known trade-off. It does not move on until the conflict is resolved or explicitly accepted.

## It's working if

- The clarifying interview ran first, and each conflict it raised came with a recommended resolution.
- Every requirement has an ID such as `PRD-XXX-REQ-001` and follows an EARS pattern, for example "When [trigger] then the system shall [response]".
- The complete feature block — problem, scope, requirements, acceptance criteria — was shown before the PRD was edited, with the question "Does this capture your requirements?"
- The new block sits in Section 3 (Feature list), after the existing features.
- The confirmation names the range added: "I've added [feature] to the PRD with requirements PRD-XXX-REQ-001 through PRD-XXX-REQ-NNN."
- It ended with a next-step choice: *Design architecture*, *Design UX*, *Create tasks*, or *Add another feature*.

**It is not working if:** the PRD changed before you saw the draft, or a requirement has no ID or describes the implementation.
