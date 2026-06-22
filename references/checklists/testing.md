# Testing Review Checklist

Authoritative criteria for test-quality review. Tests are assets that protect against regressions — not liabilities that slow change. A test that only fails when behavior is intentionally changed is preventing change, not testing it; flag it.

## Test Pyramid (~80 / 15 / 5)

- [ ] **~80% unit** — fast, isolated, cover domain logic, algorithms, edge cases
- [ ] **~15% integration** — real collaborators across a boundary (DB, HTTP, queue), one happy path + edge cases units can't reach
- [ ] **~5% end-to-end** — a few critical user journeys only
- [ ] Inverted pyramid (mostly E2E) is a smell: slow, flaky, poor failure localization — flag it
- [ ] Heavy logic pushed down to unit-testable units rather than tested only through E2E

## Where to Focus (production-code taxonomy)

Spend test effort where it pays. Classify the code under test:

| Code type | Complexity | Collaborators | Strategy |
|-----------|-----------|---------------|----------|
| Trivial (getters, pure delegation) | low | few | don't test |
| Domain model & algorithms | high | few | unit-test heavily — highest-value tests |
| Controllers / orchestrators | low | many | integration tests only |
| Overcomplicated | high | many | flag for refactor, then test |

## DAMP over DRY (in tests)

- [ ] Tests are **D**escriptive **A**nd **M**eaningful **P**hrases — readable top-to-bottom without jumping to helpers
- [ ] Each test's setup, action, and assertion are visible in the test body; some duplication is acceptable for clarity
- [ ] Avoid over-abstracted shared setup that hides what makes each case different
- [ ] Builders/factories with sensible defaults are fine; deep helper indirection that obscures intent is not
- [ ] Test names state scenario + expected behavior (`method_condition_result`); no vague "works"/"is correct"

## State-Based over Interaction-Based Assertions

- [ ] Assert on observable outcomes (return values, resulting state, emitted output), not internal steps
- [ ] Avoid asserting on mock call counts/order unless the interaction **is** the contract (e.g. "must call payment API exactly once")
- [ ] Tests survive refactoring that preserves behavior (resistance to refactoring)
- [ ] Verify behavior through the public interface; no testing private methods via reflection/`send`/`__`
- [ ] No logic in tests (if/for/while/switch) — use parameterized/table-driven tests instead

## Test Structure

- [ ] **AAA** — Arrange / Act / Assert phases visually separated; no asserts mixed into arrange, no actions after asserts
- [ ] **Single concern** — one unit of behavior per test; "and" in the name means split it (one logical assertion; multiple asserts on one object are fine)
- [ ] **Minimally passing** — only the setup the test needs; builders/factories with sensible defaults; no irrelevant data obscuring intent
- [ ] **Public interface only** — never test private methods via reflection/`send`/`__`; extract a private that needs testing into its own public unit

## Mocking Gates

- [ ] **Mock at the right level** — mock external/process boundaries (network, DB, third-party, clock, filesystem), not internal classes you own
- [ ] **Preserve real semantics** — a mock must return the same shape/type as the real thing (don't return an array where real code yields a cursor/stream/Promise)
- [ ] **Don't assert on mocks** — prefer fakes/in-memory implementations; verifying mock interactions couples the test to implementation
- [ ] Mock setup is not >50% of the test — if it is, the design (not the test) likely needs simplifying; flag it
- [ ] No `allow_any_instance_of` / `mock.patch` reaching deep into internals
- [ ] Time, randomness, and IDs are injected/controlled, not stubbed ad hoc per test

## Four Pillars (every test must hold all four)

- [ ] **Protection against regressions** — actually fails when behavior breaks
- [ ] **Resistance to refactoring** — survives implementation changes that preserve behavior
- [ ] **Fast feedback** — milliseconds for units; no `sleep`, real I/O, or heavy context per unit test
- [ ] **Maintainability** — easy to read, write, and change
> A test failing any pillar is a liability, not an asset.

## Coverage Completeness

- [ ] Every new public function with logic has a test
- [ ] Happy path **plus** error paths and boundary/edge cases (empty, null, max, off-by-one, concurrency)
- [ ] Each acceptance criterion maps to at least one test
- [ ] Negative/failure cases present, not just the success path

## What NOT to Test

- Trivial code: getters/setters, pure delegation, framework-generated code
- Static markup, CSS class names, exact element counts, icon SVGs, presentational-only components
- Third-party library internals (test your usage, not their code)
- Implementation details that change freely without changing behavior
- **Redundant tests:** duplicate assertions, subset tests (B passing implies A always passes), copy-pasted tests that add maintenance burden without catching additional bugs

## Determinism & Isolation

- [ ] No dependence on wall-clock time, timezone, locale, random seed, or test execution order
- [ ] No shared mutable state between tests; each test sets up and tears down its own world
- [ ] No flakiness; tests pass repeatably and in any order
