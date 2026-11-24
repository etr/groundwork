# Test Quality Review: Language-Specific Checks

The language-specific checks of the `test-quality-reviewer` agent. Apply the section for each language family present in the changed test files and skip the rest; a family with no file in the change has nothing to check.

### JavaScript/TypeScript (Jest/Vitest)
- Vague test names (`it('works')`, `it('should handle input')`)
- Element count assertions (`expect(items).toHaveLength(3)` for presentational lists)
- Missing `await` on async assertions
- Snapshot abuse on large objects (`toMatchSnapshot()` on entire component trees)
- `fireEvent` vs `userEvent` (prefer `userEvent` for realistic interactions)
- Testing CSS output or class names instead of behavior
- `toMatchSnapshot()` fragility — prefer explicit assertions

### Python (pytest)
- Vague test names (`test_it_works`, `test_function`)
- `assert True` without meaningful comparison
- Broad fixture scope (`session` when `function` suffices)
- `time.sleep` in tests (indicates real I/O or timing dependency)
- Wrong-level monkeypatch (patching too deep or too shallow)
- Not using `@pytest.mark.parametrize` for multiple similar inputs

### Java (JUnit)
- Missing `@DisplayName` for clarity
- `@SpringBootTest` for unit tests (loads entire application context unnecessarily)
- `Thread.sleep` in tests
- Catching exceptions instead of `assertThrows`
- `@Autowired` in unit tests (should use constructor injection or mocks)

### Go
- Missing table-driven tests for similar test cases
- `time.Sleep` in tests
- Testing unexported functions directly
- Missing `t.Parallel()` for independent tests
- Inconsistent assertion library usage (mixing `testify` and manual checks)

### C# (xUnit/NUnit)
- Missing `[Theory]`/`[InlineData]` for parameterized cases
- `Thread.Sleep` in tests
- `Assert.True(a == b)` instead of `Assert.Equal(a, b)` (worse error messages)
- Shared mutable state in `[SetUp]`

### Ruby (RSpec/Minitest)
- Vague descriptions (`it 'works'`, `it 'is valid'`)
- `sleep` in tests
- `allow_any_instance_of` (couples to implementation)
- Not using `let` lazily
- `before(:all)` with mutable state
- Testing private methods with `send`
- Missing `shared_examples` for duplicate test logic
- Not using `described_class`

### React (Testing Library)
- `getByTestId` over semantic queries (`getByRole`, `getByText`, `getByLabelText`)
- Snapshot testing presentational components
- Testing state/props directly instead of rendered output
- Not using `screen` for queries
- Testing CSS classes instead of behavior
