#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILL = path.join(ROOT, 'skills', 'statusline', 'SKILL.md');
const SCRIPT = path.join(ROOT, 'statusline-command.sh');
const ROUTER = path.join(ROOT, 'skills', 'using-groundwork', 'SKILL.md');
const INSTALLER = path.join(ROOT, 'install-skills.sh');
const DOCS = path.join(ROOT, 'docs', 'getting-started.md');

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

console.log('\nstatusline workflow');

test('is an explicit user-only install/uninstall workflow', () => {
  const skill = fs.readFileSync(SKILL, 'utf8');
  assert.ok(skill.includes('argument-hint: "[install|uninstall]"'));
  assert.ok(skill.includes('disable-model-invocation: true'));
  assert.ok(skill.includes('default to `install`'));
  assert.ok(skill.includes('## Install'));
  assert.ok(skill.includes('## Uninstall'));
});

test('uses a stable wrapper and confirms before replacing foreign configuration', () => {
  const skill = fs.readFileSync(SKILL, 'utf8');
  assert.ok(skill.includes('$HOME/.claude/groundwork-statusline.sh'));
  assert.ok(skill.includes('${CLAUDE_PLUGIN_ROOT}/statusline-command.sh'));
  assert.ok(skill.includes('newest installed Groundwork plugin version'));
  assert.ok(skill.includes('ask the user before replacing it'));
  assert.ok(skill.includes('remove the wrapper only when Groundwork owns the configured statusLine'));
});

test('bundles an executable three-line Claude renderer', () => {
  assert.ok(fs.existsSync(SCRIPT));
  assert.notStrictEqual(fs.statSync(SCRIPT).mode & 0o111, 0);
  const script = fs.readFileSync(SCRIPT, 'utf8');
  assert.ok(script.includes('# LINE 1'));
  assert.ok(script.includes('# LINE 2'));
  assert.ok(script.includes('# LINE 3'));
});

test('lifecycle router surfaces the user-only statusline leaf', () => {
  const router = fs.readFileSync(ROUTER, 'utf8');
  assert.ok(router.includes('/groundwork:statusline'));
});

test('dry runs list the translated skill only for Codex', () => {
  for (const target of ['codex', 'opencode', 'kiro', 'pi']) {
    const output = execFileSync(
      'bash',
      [INSTALLER, `--${target}`, '--project', '--dry-run', '--source', ROOT],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.strictEqual(output.includes('groundwork-statusline/SKILL.md'), target === 'codex');
    assert.ok(!output.includes('groundwork-statusline/statusline-command.sh'));
  }
});

test('manual Claude plugin copy includes the source workflow and renderer', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-copy-'));
  try {
    execFileSync(
      'bash',
      [INSTALLER, '--claude-code', '--project', '--force', '--source', ROOT,
        '--allow-manual-claude-code-install'],
      { cwd: tmp, stdio: 'pipe' }
    );
    const installed = path.join(tmp, '.claude', 'plugins', 'groundwork');
    assert.ok(fs.existsSync(path.join(installed, 'skills', 'statusline', 'SKILL.md')));
    const renderer = path.join(installed, 'statusline-command.sh');
    assert.ok(fs.existsSync(renderer));
    assert.notStrictEqual(fs.statSync(renderer).mode & 0o111, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('getting started documents opt-in setup and replaces the separate plugin', () => {
  const docs = fs.readFileSync(DOCS, 'utf8');
  assert.ok(docs.includes('/groundwork:statusline install'));
  assert.ok(docs.includes('No separate `groundwork-statusline` plugin is needed'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
