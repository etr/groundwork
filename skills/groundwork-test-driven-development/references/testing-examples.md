# TDD Examples

Worked examples and tool-specific samples for the `test-driven-development` skill. Read the section you need; nothing here is needed to run the red-green-refactor cycle itself.

## Bug fix, start to finish

**Bug:** Empty email accepted

**RED**
```typescript
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

**Verify RED**
```bash
$ npm test
FAIL: expected 'Email required', got undefined
```

**GREEN**
```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: 'Email required' };
  }
  // ...
}
```

**Verify GREEN**
```bash
$ npm test
PASS
```

**REFACTOR**
Extract validation for multiple fields if needed.

## E2E test pattern (Playwright)

```typescript
import { test, expect } from '@playwright/test'

test('user can search and filter markets', async ({ page }) => {
  await page.goto('/')
  await page.click('a[href="/markets"]')
  await expect(page.locator('h1')).toContainText('Markets')

  await page.fill('input[placeholder="Search"]', 'election')
  await page.waitForTimeout(600) // debounce

  const results = page.locator('[data-testid="market-card"]')
  await expect(results).toHaveCount(5, { timeout: 5000 })
})
```

## Coverage verification

```bash
npm run test:coverage
# Verify 80%+ coverage achieved
```

## Coverage thresholds (jest.config.js)

```json
{
  "coverageThresholds": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

## Mock examples

One ❌/✅ pair for each gate in the skill's *Testing Anti-Patterns*.

### Don't test mock behavior

```typescript
// ❌ BAD: Testing that the mock exists
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});

// ✅ GOOD: If the sidebar must be replaced, replace it with a tiny fake and
// assert on what the user sees — never on the replacement's call arguments
vi.mock('./Sidebar', () => ({
  Sidebar: ({ user }: { user: User }) => <aside aria-label="Sidebar">{user.name}</aside>,
}));

test('page shows the signed-in user in the sidebar', () => {
  render(<Page user={testUser} />);
  expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveTextContent(testUser.name);
});
```

### Mock at the right level

```typescript
// ❌ BAD: Mock prevents config write that test depends on
test('detects duplicate server', async () => {
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));
  await addServer(config);
  await addServer(config);  // Should throw - but won't!
});

// ✅ GOOD: Mock the slow part, preserve behavior test needs
test('detects duplicate server', async () => {
  vi.mock('MCPServerManager'); // Just mock slow server startup
  await addServer(config);    // Config written
  await addServer(config);    // Duplicate detected ✓
});
```

### Preserve real semantics in mocks

```typescript
// ❌ BAD: Mock returns array, real implementation returns async cursor
const mockDb = {
  getUsers: vi.fn().mockResolvedValue([
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ])
};
// Test passes, but production breaks on 1000+ users when
// pagination and backpressure actually matter.

// ✅ GOOD: Mock preserves real cursor semantics
const mockDb = {
  getUsers: vi.fn().mockReturnValue({
    async *[Symbol.asyncIterator]() {
      yield { id: '1', name: 'Alice' };
      yield { id: '2', name: 'Bob' };
    }
  })
};
```
