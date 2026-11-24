/** Router parity: every skill is surfaced by the lifecycle router (using-groundwork).
 *
 * A skill the router never mentions is undiscoverable for user-only leaves (invisible
 * to the model at call time) and a stale entry naming a removed skill is a router
 * that lies. Guarded in both directions, mirroring docs/developing-skills.md →
 * "Router Discoverability".
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const ROUTER_PATH = path.join(SKILLS_DIR, 'using-groundwork', 'SKILL.md');

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

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

// A real routing form, not any occurrence of the word: the slash command
// `/groundwork:<name>`, or the bare skill name in backticks. A raw substring match
// would let `work-on` be satisfied by `work-on-next-task` and `debug` by `swarm-debug`;
// whole-token matching still lets `skills` pass on the prose "List skills".
function routes(text, name) {
  const slashCommand = new RegExp(`groundwork:${name}(?![A-Za-z0-9-])`).test(text);
  const backticked = [...text.matchAll(/`([^`\n]+)`/g)].some((match) => match[1] === name);
  return slashCommand || backticked;
}

console.log('\nrouter-parity');

const router = fs.readFileSync(ROUTER_PATH, 'utf8');

const skillNames = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((dir) => {
    const skillFile = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) return null; // malformed skill: validate-plugin covers it
    return parseFrontmatter(fs.readFileSync(skillFile, 'utf8')).name || dir.name;
  })
  .filter((name) => name && name !== 'using-groundwork'); // the router mentions itself implicitly

test('skills directory is non-empty', () => {
  assert.ok(skillNames.length > 0, 'no skills found');
});

// Negative controls: the first version of this suite passed on substring matches and
// reported a green router while `skills` had no entry at all.
test('a non-routing mention does not count as routed', () => {
  assert.strictEqual(routes('Execute `work-on-next-task`', 'work-on'), false, 'substring');
  assert.strictEqual(routes('Investigate `swarm-debug`', 'debug'), false, 'suffix');
  assert.strictEqual(routes('List skills / health-check the plugin', 'skills'), false, 'prose word');
  assert.strictEqual(routes('`/groundwork:work-on-next-task`', 'work-on'), false, 'slash prefix');
  assert.strictEqual(routes('Run `/groundwork:work-on`', 'work-on'), true, 'slash command');
  assert.strictEqual(routes('Write any feature | `test-driven-development` |', 'test-driven-development'), true, 'backticked name');
});

const missing = skillNames.filter((name) => !routes(router, name));

test(`every skill is routed by the using-groundwork router (${skillNames.length} skills checked)`, () => {
  assert.strictEqual(
    missing.length,
    0,
    `skills the router never mentions (a router that lies — add lifecycle-map entries): ${missing.join(', ')}`
  );
});

// The reverse lie: `/groundwork:<name>` references naming skills that do not exist.
const referenced = new Set();
for (const match of router.matchAll(/groundwork:([a-z0-9][a-z0-9-]*)/g)) {
  referenced.add(match[1]);
}
const known = new Set(skillNames);
known.add('using-groundwork');
const dangling = [...referenced].filter((name) => !known.has(name));

test(`router slash references name only skills that exist (${referenced.size} references checked)`, () => {
  assert.strictEqual(dangling.length, 0, `router mentions unknown skills: ${dangling.join(', ')}`);
});

test('the reverse check is not vacuous', () => {
  assert.ok(referenced.size > 0, 'found no /groundwork:<name> references in the router');
});

// Tier labels: the router marks each skill "(user runs)" or "(auto)". A "user runs"
// label on a model-invocable skill tells the model it cannot invoke something it can
// (design-product, ux-design and create-tasks sat that way); an "(auto)" label on a
// user-only leaf sends the model to call something it cannot.
function tierLabels(text) {
  const labels = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split(/(?<!\\)\|/).map((cell) => cell.trim());
    const cell = cells[cells.length - 2];
    if (!cell || !/\((?:user runs|auto)\)/.test(cell)) continue;
    for (const token of cell.matchAll(/`([^`]+)`/g)) {
      const name = token[1].replace(/^\/?groundwork:/, '').replace(/[ \[].*$/, '');
      const after = cell.slice(token.index);
      const userRunsAt = after.indexOf('(user runs)');
      const autoAt = after.indexOf('(auto)');
      labels.set(name, userRunsAt !== -1 && (autoAt === -1 || userRunsAt < autoAt) ? 'user runs' : 'auto');
    }
  }
  return labels;
}

function isUserOnly(name) {
  const source = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
  return /^disable-model-invocation:\s*true/m.test(source);
}

test('tier labels are read per skill, not per row, and survive escaped pipes', () => {
  const mixed = tierLabels('| Investigate | `debug` (auto), `/groundwork:swarm-debug` (user runs) |');
  assert.strictEqual(mixed.get('debug'), 'auto');
  assert.strictEqual(mixed.get('swarm-debug'), 'user runs');
  const escaped = tierLabels('| Install | `/groundwork:statusline [install\\|uninstall]` (user runs) |');
  assert.strictEqual(escaped.get('statusline'), 'user runs');
  assert.strictEqual(tierLabels('| Plain prose | mentions `skills` without a label |').size, 0);
});

const labelled = [...tierLabels(router)].filter(([name]) => skillNames.includes(name));
const tierErrors = [];
for (const [name, label] of labelled) {
  const userOnly = isUserOnly(name);
  if (label === 'user runs' && !userOnly) {
    tierErrors.push(`${name}: labelled "(user runs)" but the model can invoke it (no disable-model-invocation: true)`);
  }
  if (label === 'auto' && userOnly) {
    tierErrors.push(`${name}: labelled "(auto)" but it is a user-only leaf`);
  }
}

test(`router tier labels match each skill's frontmatter (${labelled.length} labelled skills)`, () => {
  assert.strictEqual(tierErrors.length, 0, `\n    ${tierErrors.join('\n    ')}`);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
