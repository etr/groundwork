/**
 * Tests for library utilities
 *
 * Run with: node tests/lib.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

// Import the modules under test
const { extractFrontmatter, stripFrontmatter, hasFrontmatter } = require('../lib/frontmatter');
const { getTempDir, readFile, writeFile } = require('../lib/utils');
const { shouldCheck, isGitRepo } = require('../lib/check-updates');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

// Test utilities
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (error) {
    console.log(`  \u2717 ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ============================================================================
// frontmatter.js tests
// ============================================================================

describe('frontmatter.js - extractFrontmatter', () => {
  test('parses simple key-value pairs', () => {
    const content = `---
name: test-skill
description: A test skill
---
Content`;
    const fm = extractFrontmatter(content);
    assert.strictEqual(fm.name, 'test-skill');
    assert.strictEqual(fm.description, 'A test skill');
  });

  test('returns null for content without frontmatter', () => {
    const content = 'Just plain content without frontmatter';
    const fm = extractFrontmatter(content);
    assert.strictEqual(fm, null);
  });

  test('returns null for empty content', () => {
    const fm = extractFrontmatter('');
    assert.strictEqual(fm, null);
  });

  test('parses inline arrays', () => {
    const content = `---
name: test
tags: ["tag1", "tag2", "tag3"]
---`;
    const fm = extractFrontmatter(content);
    assert.deepStrictEqual(fm.tags, ['tag1', 'tag2', 'tag3']);
  });

  test('parses YAML list syntax', () => {
    const content = `---
name: test
items:
  - first
  - second
  - third
---`;
    const fm = extractFrontmatter(content);
    assert.deepStrictEqual(fm.items, ['first', 'second', 'third']);
  });

  test('handles block scalar (|)', () => {
    const content = `---
name: test
description: |
  This is a
  multi-line description
---`;
    const fm = extractFrontmatter(content);
    assert.ok(fm.description.includes('multi-line'));
  });

  test('handles malformed frontmatter (missing end delimiter)', () => {
    const content = `---
name: test
No closing delimiter`;
    const fm = extractFrontmatter(content);
    assert.strictEqual(fm, null);
  });

  test('handles special characters in values', () => {
    const content = `---
name: test-skill
description: Use when user asks "how do I?"
---`;
    const fm = extractFrontmatter(content);
    assert.ok(fm.description.includes('how do I?'));
  });
});

describe('frontmatter.js - stripFrontmatter', () => {
  test('removes frontmatter from content', () => {
    const content = `---
name: test
---

# Heading

Body content.`;
    const result = stripFrontmatter(content);
    assert.ok(!result.includes('name: test'));
    assert.ok(result.includes('# Heading'));
    assert.ok(result.includes('Body content.'));
  });

  test('returns content unchanged if no frontmatter', () => {
    const content = '# Just a heading\n\nSome content.';
    const result = stripFrontmatter(content);
    assert.ok(result.includes('# Just a heading'));
  });

  test('handles empty content', () => {
    const result = stripFrontmatter('');
    assert.strictEqual(result, '');
  });
});

describe('frontmatter.js - hasFrontmatter', () => {
  test('returns true for content with frontmatter', () => {
    const content = `---
name: test
---
Content`;
    assert.strictEqual(hasFrontmatter(content), true);
  });

  test('returns false for content without frontmatter', () => {
    const content = '# Just content';
    assert.strictEqual(hasFrontmatter(content), false);
  });

  test('returns false for empty content', () => {
    assert.strictEqual(hasFrontmatter(''), false);
  });

  test('returns false for incomplete frontmatter', () => {
    const content = `---
name: test
No closing`;
    assert.strictEqual(hasFrontmatter(content), false);
  });
});

// ============================================================================
// utils.js tests
// ============================================================================

describe('utils.js - getTempDir', () => {
  test('returns a path containing claude-groundwork', () => {
    const tempDir = getTempDir();
    assert.ok(tempDir.includes('claude-groundwork'));
  });

  test('creates directory if it does not exist', () => {
    const tempDir = getTempDir();
    assert.ok(fs.existsSync(tempDir));
  });

  test('returns consistent path on multiple calls', () => {
    const dir1 = getTempDir();
    const dir2 = getTempDir();
    assert.strictEqual(dir1, dir2);
  });
});

describe('utils.js - readFile', () => {
  test('reads existing file', () => {
    const content = readFile(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'));
    assert.ok(content !== null);
    assert.ok(content.includes('groundwork'));
  });

  test('returns null for non-existent file', () => {
    const result = readFile('/nonexistent/path/file.txt');
    assert.strictEqual(result, null);
  });
});

describe('utils.js - writeFile', () => {
  const testDir = path.join(os.tmpdir(), 'groundwork-test-' + Date.now());
  const testFile = path.join(testDir, 'subdir', 'test.txt');

  test('creates parent directories and writes file', () => {
    writeFile(testFile, 'test content');
    assert.ok(fs.existsSync(testFile));
    const content = fs.readFileSync(testFile, 'utf8');
    assert.strictEqual(content, 'test content');
  });

  test('overwrites existing file', () => {
    writeFile(testFile, 'new content');
    const content = fs.readFileSync(testFile, 'utf8');
    assert.strictEqual(content, 'new content');
  });

  // Cleanup
  test('cleanup test files', () => {
    fs.rmSync(testDir, { recursive: true, force: true });
    assert.ok(!fs.existsSync(testDir));
  });
});

// ============================================================================
// check-updates.js tests
// ============================================================================

describe('check-updates.js - isGitRepo', () => {
  test('returns boolean', () => {
    const result = isGitRepo();
    assert.strictEqual(typeof result, 'boolean');
  });
});

describe('check-updates.js - shouldCheck', () => {
  test('returns true when forced', () => {
    const result = shouldCheck(true);
    assert.strictEqual(result, true);
  });

  test('returns boolean without force', () => {
    const result = shouldCheck(false);
    assert.strictEqual(typeof result, 'boolean');
  });
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
