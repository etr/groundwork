/**
 * The router and the contributor guide name the skills that carry the rigid
 * marker, so each "today …" list must equal the set of skills actually marked.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');
const MARKER = '**This is a rigid skill.** Follow steps exactly.';
const read = (file) => fs.readFileSync(file, 'utf8');
const carrying = fs.readdirSync(SKILLS).filter((name) => (
  fs.existsSync(path.join(SKILLS, name, 'SKILL.md')) &&
  read(path.join(SKILLS, name, 'SKILL.md')).split('\n').includes(MARKER)
));
// "…says so in its first lines: (today `a` and `b`)" — the list a document claims.
function namesListed(text) {
  const match = text.match(/\(today ([^)]+)\)/);
  return match ? [...match[1].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]).sort() : [];
}

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

console.log('rigid-marker.test.js');

test('the marker sits on its own line near the top of every skill that carries it', () => {
  assert.ok(carrying.length >= 2, `expected the known corpus, found ${carrying.length}`);
  for (const name of carrying) {
    const lines = read(path.join(SKILLS, name, 'SKILL.md')).split('\n');
    assert.ok(lines.indexOf(MARKER) < 20, `${name}: the marker must be near the top`);
  }
});

test('the router and the guide name exactly the skills that carry the marker', () => {
  for (const [label, file] of [
    ['router', path.join(SKILLS, 'using-groundwork', 'SKILL.md')],
    ['guide', path.join(ROOT, 'docs', 'developing-skills.md')],
  ]) {
    const listed = namesListed(read(file));
    assert.ok(listed.length > 0, `${label} no longer lists the rigid skills`);
    assert.deepStrictEqual(listed, carrying.slice().sort(), `${label}'s list drifted from the skills that carry the marker`);
  }
});

if (failed > 0) {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
