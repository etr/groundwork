/** Docs pages: every page under docs/skills/ describes a real skill, keeps the
 * four required sections in order, and is listed in the index.
 *
 * A page is the user's first impression of a skill. One that names a skill that
 * was renamed, or has lost its "It's working if" section, teaches the wrong
 * expectation — so the shape is guarded the same way the router is.
 *
 * Run with: node tests/docs-parity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const DOCS_DIR = path.join(PLUGIN_ROOT, 'docs', 'skills');

// Heading text, without the "##" marker.
const REQUIRED_SECTIONS = [
  'What it does',
  'When to reach for it',
  'Common questions',
  'It\'s working if',
];
const NOT_PAGES = new Set(['README.md', 'TEMPLATE.md']);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

function headings(text, level) {
  const marker = '#'.repeat(level);
  return text
    .split('\n')
    .filter((line) => line.startsWith(`${marker} `))
    .map((line) => line.slice(marker.length).trim());
}

console.log('\ndocs-parity');

const skillNames = new Set(
  fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(SKILLS_DIR, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
);

const pages = fs.existsSync(DOCS_DIR)
  ? fs.readdirSync(DOCS_DIR).filter((file) => file.endsWith('.md') && !NOT_PAGES.has(file)).sort()
  : [];

test('there is at least one docs page', () => {
  assert.ok(pages.length > 0, `no pages found under ${DOCS_DIR}`);
});

test('every docs page describes an existing skill', () => {
  const dangling = pages.filter((page) => !skillNames.has(page.replace(/\.md$/, '')));
  assert.strictEqual(dangling.length, 0, `pages naming skills that do not exist: ${dangling.join(', ')}`);
});

const shapeErrors = [];
for (const page of pages) {
  const skill = page.replace(/\.md$/, '');
  const text = fs.readFileSync(path.join(DOCS_DIR, page), 'utf8');
  const [h1] = headings(text, 1);
  if (h1 !== `\`${skill}\``) shapeErrors.push(`${page}: first heading is "${h1 || '(none)'}", expected \`${skill}\``);
  const positions = REQUIRED_SECTIONS.map((section) => {
    const at = headings(text, 2).indexOf(section);
    if (at === -1) shapeErrors.push(`${page}: missing section "## ${section}"`);
    return at;
  });
  if (positions.every((at) => at !== -1) && positions.some((at, i) => i > 0 && at < positions[i - 1])) {
    shapeErrors.push(`${page}: sections out of order (expected ${REQUIRED_SECTIONS.map((s) => `## ${s}`).join(' → ')})`);
  }
}

test('every page keeps the four sections, in order, under a heading naming the skill', () => {
  assert.strictEqual(shapeErrors.length, 0, `\n    ${shapeErrors.join('\n    ')}`);
});

test('every page is listed in the docs/skills/README.md index', () => {
  const index = fs.readFileSync(path.join(DOCS_DIR, 'README.md'), 'utf8');
  const unlisted = pages.filter((page) => !index.includes(`](${page})`));
  assert.strictEqual(unlisted.length, 0, `pages missing from docs/skills/README.md: ${unlisted.join(', ')}`);
});

// The header states the skill's tier. A page that calls a user-only skill
// "model-invoked" sends the reader to wait for a model that cannot run it;
// one that calls a model-invoked skill "user-run" hides it from nobody.
function statedTier(text) {
  const header = text.split('\n').find((line) => line.startsWith('> **'));
  const match = header && header.match(/\*\*Tier:\*\* (user-run or model-invoked|user-run|library)/);
  return match ? match[1] : null;
}

function frontmatterTier(name) {
  const frontmatter = fs
    .readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8')
    .match(/^---\n([\s\S]*?)\n---/)[1];
  if (/^disable-model-invocation:\s*true/m.test(frontmatter)) return 'user-run';
  if (/^user-invocable:\s*false/m.test(frontmatter)) return 'library';
  return 'user-run or model-invoked';
}

test('every page states the tier its skill actually has', () => {
  const unstated = [];
  const wrong = [];
  for (const page of pages) {
    const skill = page.replace(/\.md$/, '');
    const stated = statedTier(fs.readFileSync(path.join(DOCS_DIR, page), 'utf8'));
    if (stated === null) unstated.push(page);
    else if (stated !== frontmatterTier(skill)) {
      wrong.push(`${page}: says "${stated}", frontmatter says "${frontmatterTier(skill)}"`);
    }
  }
  assert.strictEqual(unstated.length, 0, `pages with no tier in their header: ${unstated.join(', ')}`);
  assert.strictEqual(wrong.length, 0, `\n    ${wrong.join('\n    ')}`);
});

test('the template itself satisfies the shape the pages must keep', () => {
  const template = fs.readFileSync(path.join(DOCS_DIR, 'TEMPLATE.md'), 'utf8');
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(headings(template, 2).includes(section), `TEMPLATE.md lost its "## ${section}" section`);
  }
});

console.log(`\n  ${passed} passed, ${failed} failed (${pages.length} pages checked)\n`);
if (failed > 0) process.exit(1);
