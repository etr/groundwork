# Unworked Review Issues

**Run:** 2026-10-18 16:52:23
**Task:** FEATURE-coordinator-batch
**Total:** 1 (0 critical, 1 major, 0 minor)

## Major

1. [ ] **housekeeper** | `specs/product_specs.md:3` | spec-not-updated
   The feature changes the user-facing `/groundwork:just-do-it` behavior so the coordinator conversation owns Plan → Implement → Validate → Finalize for every harness and the external runner must be launched separately. README.md and skills/just-do-it/SKILL.md now state that behavior, but the product spec still only defines the terminal runner lifecycle and does not specify the coordinator batch workflow.
   *Recommendation:* Update the product spec to document the coordinator-owned batch workflow and the separately callable standalone runner. Run /groundwork-source-product-specs-from-code to capture the implemented behavior.
