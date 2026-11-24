/**
 * The layout pattern library is split by what a reader needs: the guide holds
 * decisions (selection table, compatibility matrix, when-to-use), the
 * techniques file holds the CSS/JS, and both keep the same section numbers so
 * a citation like "§2.3" resolves in either.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'references', 'design-system');
const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
const guide = read('layout-architecture-guide.md');
const techniques = read('layout-techniques.md');
const examples = read('layout-examples.md');
const numbered = (text) => text.split('\n').filter((line) => /^#{2,3} \d/.test(line));
const fences = (text) => (text.match(/^```/gm) || []).length;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${error.message}`);
  }
}

console.log('layout-guide-split.test.js');

test('the decision guide carries no code and leads with the selection aids', () => {
  assert.strictEqual(fences(guide), 0, 'implementation code belongs in layout-techniques.md');
  const lines = guide.split('\n');
  const table = lines.indexOf('| Pattern | What it does | Complexity |');
  const matrix = lines.indexOf('## Quick Reference: Pattern Compatibility Matrix');
  const firstPattern = lines.findIndex((line) => /^## 1\. /.test(line));
  assert.ok(table > 0 && matrix > 0 && firstPattern > 0);
  assert.ok(table < firstPattern && matrix < firstPattern, 'the selection table and the matrix come before the patterns');
  assert.strictEqual(lines.indexOf('| Pattern | What it does | Complexity |', table + 1), -1, 'one selection table');
  // One row per pattern.
  const rows = lines.filter((line) => /^\| \d+\.\d+ /.test(line));
  assert.strictEqual(rows.length, numbered(guide).filter((line) => line.startsWith('###')).length);
  assert.ok(guide.includes('`layout-techniques.md`'), 'the guide says where the code lives');
});

test('the techniques file keeps the guide\'s section numbers and holds the code', () => {
  assert.deepStrictEqual(numbered(techniques), numbered(guide));
  assert.ok(fences(techniques) > 0, 'the code blocks live here');
  assert.ok(techniques.includes('`layout-architecture-guide.md`'), 'the techniques file points back at the decisions');
});

test('the strategy bundles lead with their selection guide', () => {
  const lines = examples.split('\n');
  const firstBundle = lines.findIndex((line) => /^## 1\. /.test(line));
  assert.ok(firstBundle > 0 && lines.indexOf('## Bundle Selection Guide') < firstBundle, 'the selection guide comes before the bundles');
});

test('the layout references carry no plugin-root pointer or template variable (they export verbatim)', () => {
  for (const [name, text] of [['layout-architecture-guide.md', guide], ['layout-techniques.md', techniques], ['layout-examples.md', examples]]) {
    assert.ok(!text.includes('${CLAUDE_PLUGIN_ROOT}'), `${name}: plugin-root pointer would leak on export`);
    assert.ok(!/\{\{/.test(text), `${name}: template variable would stay unresolved on export`);
  }
});

if (failed > 0) {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
