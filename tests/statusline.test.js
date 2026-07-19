#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');

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

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '');
}

function writeExecutable(file, body) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function waitFor(predicate, description, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < deadline) {
    if (predicate()) return;
    Atomics.wait(sleeper, 0, 0, 10);
  }
  assert.fail(`timed out waiting for ${description}`);
}

function waitForFile(file) {
  waitFor(() => fs.existsSync(file), file);
}

function waitForProcessExit(pidFile) {
  waitForFile(pidFile);
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  waitFor(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if (error.code === 'ESRCH') return true;
      throw error;
    }
  }, `background process ${pid} to exit`);
}

function waitForProcessExits(pidFile) {
  waitForFile(pidFile);
  const pids = fs.readFileSync(pidFile, 'utf8').trim().split('\n').map(Number);
  for (const pid of pids) {
    waitFor(() => {
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        if (error.code === 'ESRCH') return true;
        throw error;
      }
    }, `background process ${pid} to exit`);
  }
}

function runRenderer({ cwd, home, input, fakeCommands = {}, env = {} }) {
  const fakeBin = path.join(home, 'fake-bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  for (const [name, body] of Object.entries(fakeCommands)) {
    writeExecutable(path.join(fakeBin, name), `#!/usr/bin/env bash\n${body}\n`);
  }
  return execFileSync('bash', [SCRIPT], {
    cwd,
    env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH}`, ...env },
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 3000,
  });
}

function basicInput(cwd) {
  return {
    cwd,
    model: { display_name: 'Sonnet' },
    context_window: {
      used_percentage: 25,
      context_window_size: 200000,
      current_usage: {
        input_tokens: 40000,
        cache_creation_input_tokens: 5000,
        cache_read_input_tokens: 5000,
      },
    },
  };
}

function writeUsageCache(home, usage, ageSeconds = 0) {
  const claudeDir = path.join(home, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const cache = path.join(claudeDir, 'statusline-usage-cache.json');
  fs.writeFileSync(cache, JSON.stringify(usage));
  const timestamp = new Date(Date.now() - ageSeconds * 1000);
  fs.utimesSync(cache, timestamp, timestamp);
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

test('renders model, cached usage, context, and cwd as exactly three lines', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-render-'));
  try {
    writeUsageCache(tmp, {
      five_hour: { utilization: 20 },
      seven_day: { utilization: 30 },
    });
    const output = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
    }));
    const lines = output.split('\n');
    assert.strictEqual(lines.length, 3);
    assert.match(lines[0], /^Sonnet \(default\)$/);
    assert.ok(lines[1].includes('Context:'));
    assert.ok(lines[1].includes('50k/200k (25%)'));
    assert.ok(lines[1].includes('Session: 20%'));
    assert.ok(lines[1].includes('Weekly: 30%'));
    assert.strictEqual(lines[2], '~');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('malformed optional settings preserve renderer input and default effort', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-settings-'));
  try {
    const claudeDir = path.join(tmp, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{malformed');

    const output = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
    }));
    const lines = output.split('\n');

    assert.match(lines[0], /^Sonnet \(default\)$/);
    assert.ok(lines[1].includes('50k/200k (25%)'));
    assert.strictEqual(lines[2], '~');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('renders without optional credentials, usage state, or gh', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-optional-'));
  try {
    const output = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands: { gh: 'exit 127', security: 'exit 1' },
    }));
    assert.strictEqual(output.split('\n').length, 3);
    assert.ok(!output.includes('Session:'));
    assert.ok(!output.includes('Weekly:'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('prints repository project text literally without decoding terminal escapes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-escape-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, '.groundwork.yml'), 'version: 1\nprojects: {}\n');
    fs.mkdirSync(path.join(tmp, '.claude', 'plugins', 'cache', 'groundwork-marketplace'), {
      recursive: true,
    });
    writeUsageCache(tmp, { five_hour: { utilization: 10 } });
    const paneKey = 'pts_42';
    const repoSlug = tmp.replaceAll('/', '_');
    const stateDir = path.join(tmp, '.claude', 'groundwork-state', 'panes');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, `${paneKey}__${repoSlug}.json`), JSON.stringify({
      project: '\\033]52;c;ATTACK\\a',
      timestamp: Date.now(),
    }));

    const output = runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands: { tmux: 'printf \'/dev/pts/42\\n\'' },
      env: { TMUX_PANE: '%1' },
    });
    assert.ok(
      output.includes('Project: \\033]52;c;ATTACK\\a'),
      `project segment missing from ${JSON.stringify(stripAnsi(output))}`
    );
    assert.ok(!output.includes('\x1b]52;c;ATTACK'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('strips actual terminal control bytes from project text', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-project-control-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, '.groundwork.yml'), 'version: 1\nprojects: {}\n');
    fs.mkdirSync(path.join(tmp, '.claude', 'plugins', 'cache', 'groundwork-marketplace'), {
      recursive: true,
    });
    writeUsageCache(tmp, { five_hour: { utilization: 10 } });
    const paneKey = 'pts_42';
    const repoSlug = tmp.replaceAll('/', '_');
    const stateDir = path.join(tmp, '.claude', 'groundwork-state', 'panes');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, `${paneKey}__${repoSlug}.json`), JSON.stringify({
      project: 'before\x1b]52;c;ATTACKafter',
      timestamp: Date.now(),
    }));

    const output = runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands: { tmux: 'printf \'/dev/pts/42\\n\'' },
      env: { TMUX_PANE: '%1' },
    });

    assert.ok(output.includes('Project: before]52;c;ATTACKafter'));
    assert.ok(!output.includes('\x1b]52;c;ATTACK'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('strips embedded newlines from project text and preserves three output lines', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-project-newline-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, '.groundwork.yml'), 'version: 1\nprojects: {}\n');
    fs.mkdirSync(path.join(tmp, '.claude', 'plugins', 'cache', 'groundwork-marketplace'), {
      recursive: true,
    });
    writeUsageCache(tmp, { five_hour: { utilization: 10 } });
    const paneKey = 'pts_42';
    const repoSlug = tmp.replaceAll('/', '_');
    const stateDir = path.join(tmp, '.claude', 'groundwork-state', 'panes');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, `${paneKey}__${repoSlug}.json`), JSON.stringify({
      project: 'before\nINJECTEDafter',
      timestamp: Date.now(),
    }));

    const output = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands: { tmux: 'printf \'/dev/pts/42\\n\'' },
      env: { TMUX_PANE: '%1' },
    }));

    assert.ok(output.includes('Project: beforeINJECTEDafter'));
    assert.ok(!output.includes('before\nINJECTEDafter'));
    assert.strictEqual(output.split('\n').length, 3);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('renders the selected project from a manual plugin installation', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-manual-project-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, '.groundwork.yml'), 'version: 1\nprojects: {}\n');
    fs.mkdirSync(path.join(tmp, '.claude', 'plugins', 'groundwork'), { recursive: true });
    writeUsageCache(tmp, { five_hour: { utilization: 10 } });
    const paneKey = 'pts_42';
    const repoSlug = tmp.replaceAll('/', '_');
    const stateDir = path.join(tmp, '.claude', 'groundwork-state', 'panes');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, `${paneKey}__${repoSlug}.json`), JSON.stringify({
      project: 'manual-project',
      timestamp: Date.now(),
    }));

    const output = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands: {
        gh: 'exit 127',
        nohup: '"$@"',
        tmux: 'printf \'/dev/pts/42\\n\'',
      },
      env: { TMUX_PANE: '%1' },
    }));

    assert.ok(output.includes('Project: manual-project'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('strips actual terminal control bytes from repository and cwd text', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-repo-control-'));
  const repo = path.join(parent, 'before\x1b]52;c;ATTACKafter');
  try {
    fs.mkdirSync(repo);
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeUsageCache(parent, { five_hour: { utilization: 10 } });
    const refreshPid = path.join(parent, 'refresh-pid');

    const output = runRenderer({
      cwd: repo,
      home: parent,
      input: basicInput(repo),
      fakeCommands: {
        gh: 'exit 1',
        nohup: `printf '%s\\n' "$$" > "${refreshPid}"; "$@"`,
      },
    });
    waitForProcessExit(refreshPid);

    assert.ok(stripAnsi(output).includes('before]52;c;ATTACKafter'));
    assert.ok(!output.includes('\x1b]52;c;ATTACK'));
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('keeps OAuth credentials out of curl process arguments', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-token-'));
  try {
    const claudeDir = path.join(tmp, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'secret-statusline-token' },
    }));
    const argvFile = path.join(tmp, 'curl-argv');
    const refreshPid = path.join(tmp, 'refresh-pid');
    runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands: {
        curl: `printf '%s\\n' "$@" > "${argvFile}"; cat >/dev/null; printf '{}'`,
        nohup: `printf '%s\\n' "$$" > "${refreshPid}"; "$@"`,
      },
    });
    waitForFile(argvFile);
    assert.ok(!fs.readFileSync(argvFile, 'utf8').includes('secret-statusline-token'));
    waitForProcessExit(refreshPid);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('uses stale usage immediately while refreshing in the background', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-stale-'));
  try {
    writeUsageCache(tmp, { five_hour: { utilization: 42 } }, 600);
    fs.writeFileSync(path.join(tmp, '.claude', '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'token' },
    }));
    const refreshStarted = path.join(tmp, 'refresh-started');
    const refreshRelease = path.join(tmp, 'refresh-release');
    const refreshFinished = path.join(tmp, 'refresh-finished');
    const refreshPid = path.join(tmp, 'refresh-pid');
    const output = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands: {
        curl: [
          'cat >/dev/null',
          `: > "${refreshStarted}"`,
          `while [ ! -f "${refreshRelease}" ]; do sleep 0.01; done`,
          `: > "${refreshFinished}"`,
          "printf '{}'",
        ].join('\n'),
        nohup: `printf '%s\\n' "$$" > "${refreshPid}"; "$@"`,
      },
    }));
    assert.ok(output.includes('Session: 42%'));
    waitForFile(refreshStarted);
    assert.ok(!fs.existsSync(refreshFinished), 'refresh finished before renderer returned');
    fs.writeFileSync(refreshRelease, 'continue');
    waitForFile(refreshFinished);
    waitForProcessExit(refreshPid);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('successful background usage refresh atomically replaces stale cache', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-refresh-success-'));
  try {
    writeUsageCache(tmp, { five_hour: { utilization: 42 } }, 600);
    fs.writeFileSync(path.join(tmp, '.claude', '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'token' },
    }));
    const refreshStarted = path.join(tmp, 'refresh-started');
    const refreshRelease = path.join(tmp, 'refresh-release');
    const refreshPid = path.join(tmp, 'refresh-pid');
    const fakeCommands = {
      curl: [
        'headers=$(cat)',
        'case "$headers" in',
        '  *"Authorization: Bearer token"*"anthropic-beta: oauth-2025-04-20"*) ;;',
        '  *) exit 22 ;;',
        'esac',
        `: > "${refreshStarted}"`,
        `while [ ! -f "${refreshRelease}" ]; do sleep 0.01; done`,
        "printf '%s' '{\"five_hour\":{\"utilization\":73},\"seven_day\":{\"utilization\":64}}'",
      ].join('\n'),
      nohup: `printf '%s\\n' "$$" > "${refreshPid}"; "$@"`,
    };

    const staleOutput = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands,
    }));
    assert.ok(staleOutput.includes('Session: 42%'));
    waitForFile(refreshStarted);
    fs.writeFileSync(refreshRelease, 'continue');
    waitForProcessExit(refreshPid);

    const cache = JSON.parse(fs.readFileSync(
      path.join(tmp, '.claude', 'statusline-usage-cache.json'),
      'utf8'
    ));
    assert.strictEqual(cache.five_hour.utilization, 73);
    assert.strictEqual(cache.seven_day.utilization, 64);
    const refreshedOutput = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(tmp),
      fakeCommands,
    }));
    assert.ok(refreshedOutput.includes('Session: 73%'));
    assert.ok(refreshedOutput.includes('Weekly: 64%'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('starts only one usage refresh while an earlier refresh is in flight', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-usage-single-flight-'));
  const refreshRelease = path.join(tmp, 'refresh-release');
  try {
    writeUsageCache(tmp, { five_hour: { utilization: 42 } }, 600);
    fs.writeFileSync(path.join(tmp, '.claude', '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'token' },
    }));
    const refreshStarted = path.join(tmp, 'refresh-started');
    const refreshPids = path.join(tmp, 'refresh-pids');
    const nohupCalls = path.join(tmp, 'nohup-calls');
    const fakeCommands = {
      curl: [
        'cat >/dev/null',
        `: > "${refreshStarted}"`,
        `while [ ! -f "${refreshRelease}" ]; do sleep 0.01; done`,
        "printf '{}'",
      ].join('\n'),
      nohup: [
        `printf 'called\\n' >> "${nohupCalls}"`,
        `printf '%s\\n' "$$" >> "${refreshPids}"`,
        '"$@"',
      ].join('\n'),
    };

    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp), fakeCommands });
    waitForFile(refreshStarted);
    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp), fakeCommands });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    const calls = fs.readFileSync(nohupCalls, 'utf8');
    fs.writeFileSync(refreshRelease, 'continue');
    waitForProcessExits(refreshPids);

    assert.strictEqual(calls, 'called\n');
  } finally {
    fs.writeFileSync(refreshRelease, 'continue');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('throttles usage refresh attempts after a failed background refresh', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-usage-attempt-'));
  try {
    const refreshPid = path.join(tmp, 'refresh-pid');
    const nohupCalls = path.join(tmp, 'nohup-calls');
    const fakeCommands = {
      security: 'exit 1',
      nohup: [
        `printf 'called\\n' >> "${nohupCalls}"`,
        `printf '%s\\n' "$$" > "${refreshPid}"`,
        '"$@"',
      ].join('\n'),
    };

    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp), fakeCommands });
    waitForProcessExit(refreshPid);
    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp), fakeCommands });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);

    assert.strictEqual(fs.readFileSync(nohupCalls, 'utf8'), 'called\n');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('refreshes PR metadata from the repository root and reuses the cache', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-pr-'));
  try {
    const nested = path.join(tmp, 'nested');
    fs.mkdirSync(nested);
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    writeUsageCache(tmp, { five_hour: { utilization: 10 } });
    const ghCalls = path.join(tmp, 'gh-calls');
    const nohupCalls = path.join(tmp, 'nohup-calls');
    const refreshPid = path.join(tmp, 'refresh-pid');
    const physicalRoot = fs.realpathSync(tmp);
    const fakeGh = [
      `[ "$(pwd -P)" = "${physicalRoot}" ] || exit 4`,
      `printf 'called\\n' >> "${ghCalls}"`,
      "printf '17\\n'",
    ].join('\n');
    const fakeCommands = {
      gh: fakeGh,
      nohup: [
        `printf 'called\\n' >> "${nohupCalls}"`,
        `printf '%s\\n' "$$" > "${refreshPid}"`,
        '"$@"',
      ].join('\n'),
    };

    runRenderer({
      cwd: nested,
      home: tmp,
      input: basicInput(nested),
      fakeCommands,
    });
    const prCacheDir = path.join(tmp, '.claude', 'statusline-pr-cache');
    waitFor(
      () => fs.existsSync(prCacheDir) && fs.readdirSync(prCacheDir)
        .some((entry) => !entry.endsWith('.attempt') && !entry.endsWith('.lock')),
      'PR cache write'
    );
    const output = stripAnsi(runRenderer({
      cwd: nested,
      home: tmp,
      input: basicInput(nested),
      fakeCommands,
    }));
    assert.ok(
      output.includes('#17'),
      `PR segment missing; gh_called=${fs.existsSync(ghCalls)} ` +
        `nohup_called=${fs.existsSync(nohupCalls)} output=${JSON.stringify(output)}`
    );
    assert.strictEqual(fs.readFileSync(ghCalls, 'utf8'), 'called\n');
    waitForProcessExit(refreshPid);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolves PR and project cache keys without sha1sum', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-portable-hash-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'portable-hash'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, '.groundwork.yml'), 'version: 1\nprojects: {}\n');
    writeUsageCache(tmp, { five_hour: { utilization: 10 } });

    const physicalRoot = fs.realpathSync(tmp);
    const prKey = createHash('sha1')
      .update(`${physicalRoot}\nportable-hash`)
      .digest('hex')
      .slice(0, 20);
    const prCacheDir = path.join(tmp, '.claude', 'statusline-pr-cache');
    fs.mkdirSync(prCacheDir, { recursive: true });
    fs.writeFileSync(path.join(prCacheDir, prKey), '17');

    const cwdKey = createHash('sha1').update(physicalRoot).digest('hex').slice(0, 12);
    const repoSlug = physicalRoot.replaceAll('/', '_');
    const stateDir = path.join(tmp, '.claude', 'groundwork-state', 'panes');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, `cwd-${cwdKey}__${repoSlug}.json`), JSON.stringify({
      project: 'portable-project',
      timestamp: Date.now(),
    }));

    const controlledBin = path.join(tmp, 'controlled-bin');
    fs.mkdirSync(controlledBin);
    for (const command of [
      'awk', 'bash', 'cat', 'date', 'dirname', 'env', 'git', 'jq', 'mkdir', 'nohup',
      'ps', 'python3', 'rmdir', 'sed', 'tr',
    ]) {
      const executable = execFileSync('which', [command], { encoding: 'utf8' }).trim();
      fs.symlinkSync(executable, path.join(controlledBin, command));
    }

    const output = stripAnsi(runRenderer({
      cwd: tmp,
      home: tmp,
      input: basicInput(physicalRoot),
      fakeCommands: {
        gh: 'exit 127',
        tmux: 'printf \'/dev/pts/42\\n\'',
      },
      env: {
        PATH: `${path.join(tmp, 'fake-bin')}:${controlledBin}`,
        TMUX_PANE: '%1',
      },
    }));

    assert.ok(output.includes('#17'));
    assert.ok(
      output.includes('Project: portable-project'),
      `project cache missing; files=${fs.readdirSync(stateDir)} output=${JSON.stringify(output)}`
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('starts only one PR refresh while an earlier refresh is in flight', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-pr-single-flight-'));
  const refreshRelease = path.join(tmp, 'refresh-release');
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    writeUsageCache(tmp, { five_hour: { utilization: 10 } });
    const refreshStarted = path.join(tmp, 'refresh-started');
    const refreshPids = path.join(tmp, 'refresh-pids');
    const nohupCalls = path.join(tmp, 'nohup-calls');
    const fakeCommands = {
      gh: [
        `: > "${refreshStarted}"`,
        `while [ ! -f "${refreshRelease}" ]; do sleep 0.01; done`,
        "printf '17\\n'",
      ].join('\n'),
      nohup: [
        `printf 'called\\n' >> "${nohupCalls}"`,
        `printf '%s\\n' "$$" >> "${refreshPids}"`,
        '"$@"',
      ].join('\n'),
    };

    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp), fakeCommands });
    waitForFile(refreshStarted);
    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp), fakeCommands });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    const calls = fs.readFileSync(nohupCalls, 'utf8');
    fs.writeFileSync(refreshRelease, 'continue');
    waitForProcessExits(refreshPids);

    assert.strictEqual(calls, 'called\n');
  } finally {
    fs.writeFileSync(refreshRelease, 'continue');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('keeps a warm cached render within its subprocess budget', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-latency-'));
  try {
    writeUsageCache(tmp, {
      five_hour: { utilization: 20 },
      seven_day: { utilization: 30 },
    });
    const jq = execFileSync('which', ['jq'], { encoding: 'utf8' }).trim();
    const processLog = path.join(tmp, 'render-processes');
    const fakeCommands = {
      jq: `printf 'jq\\n' >> "${processLog}"\nexec "${jq}" "$@"`,
    };

    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp), fakeCommands });
    fs.writeFileSync(processLog, '');
    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp), fakeCommands });
    const processes = fs.readFileSync(processLog, 'utf8').trim().split('\n');

    assert.deepStrictEqual(processes, ['jq', 'jq', 'jq']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('treats reset timestamps as data and writes a valid reset cache', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-reset-data-'));
  try {
    const marker = path.join(tmp, 'python-injection-marker');
    const hostileReset = `'; open('${marker}', 'w').write('executed'); #`;
    writeUsageCache(tmp, {
      five_hour: { utilization: 20, resets_at: hostileReset },
      seven_day: { utilization: 30, resets_at: 'line one\n"quoted"\\value' },
    });

    runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp) });

    assert.ok(!fs.existsSync(marker), 'reset timestamp executed as Python source');
    const resetCache = JSON.parse(fs.readFileSync(
      path.join(tmp, '.claude', 'statusline-reset-cache.json'),
      'utf8'
    ));
    assert.deepStrictEqual(resetCache, {
      session: hostileReset,
      weekly: 'line one\n"quoted"\\value',
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('renders valid session and weekly reset suffixes on their usage segments', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-reset-suffixes-'));
  try {
    writeUsageCache(tmp, {
      five_hour: {
        utilization: 20,
        resets_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
      seven_day: {
        utilization: 30,
        resets_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    const output = stripAnsi(runRenderer({ cwd: tmp, home: tmp, input: basicInput(tmp) }));
    const usageLine = output.split('\n')[1];

    assert.match(usageLine, /Session: 20% \(\d+h(?: \d+m)?\)/);
    assert.match(
      usageLine,
      /Weekly: 30% \((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d+ [A-Z][a-z]+ \d+(?:AM|PM)\)/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('lifecycle router surfaces the user-only statusline leaf', () => {
  const router = fs.readFileSync(ROUTER, 'utf8');
  assert.ok(router.includes('/groundwork:statusline'));
});

for (const target of ['codex', 'opencode', 'kiro', 'pi']) {
  test(`dry run ${target} routing for translated statusline skill`, () => {
    const output = execFileSync(
      'bash',
      [INSTALLER, `--${target}`, '--project', '--dry-run', '--source', ROOT],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.strictEqual(output.includes('groundwork-statusline/SKILL.md'), target === 'codex');
    assert.ok(!output.includes('groundwork-statusline/statusline-command.sh'));
  });
}

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

test('generated wrapper executes the renderer from a manual plugin layout', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-wrapper-'));
  try {
    const pluginRoot = path.join(tmp, '.claude', 'plugins', 'groundwork');
    fs.mkdirSync(pluginRoot, { recursive: true });
    writeExecutable(path.join(pluginRoot, 'statusline-command.sh'), 'printf manual-layout-ok');
    const skill = fs.readFileSync(SKILL, 'utf8');
    const block = [...skill.matchAll(/ {3}```bash\n([\s\S]*?)\n {3}```/g)]
      .find((match) => match[1].includes('# Auto-generated'));
    assert.ok(block, 'statusline wrapper block not found');
    const wrapper = block[1].replace(/^ {3}/gm, '')
      .replace('<VERSIONS_DIR>', path.dirname(pluginRoot))
      .replace('<PLUGIN_ROOT>', pluginRoot);
    const wrapperFile = path.join(tmp, 'wrapper.sh');
    writeExecutable(wrapperFile, wrapper);
    assert.strictEqual(execFileSync('bash', [wrapperFile], { encoding: 'utf8' }), 'manual-layout-ok');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('generated wrapper executes the newest numeric marketplace version', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-statusline-versioned-wrapper-'));
  try {
    const versionsDir = path.join(tmp, 'versions');
    const pluginRoot = path.join(tmp, 'manual', 'groundwork');
    for (const [version, output] of [
      ['1.9.9', 'old-version'],
      ['1.10.0', 'newest-version'],
      ['not-a-version', 'invalid-version'],
    ]) {
      const versionRoot = path.join(versionsDir, version);
      fs.mkdirSync(versionRoot, { recursive: true });
      writeExecutable(path.join(versionRoot, 'statusline-command.sh'), `printf ${output}`);
    }
    fs.mkdirSync(pluginRoot, { recursive: true });
    writeExecutable(path.join(pluginRoot, 'statusline-command.sh'), 'printf fallback');

    const skill = fs.readFileSync(SKILL, 'utf8');
    const block = [...skill.matchAll(/ {3}```bash\n([\s\S]*?)\n {3}```/g)]
      .find((match) => match[1].includes('# Auto-generated'));
    assert.ok(block, 'statusline wrapper block not found');
    const wrapper = block[1].replace(/^ {3}/gm, '')
      .replace('<VERSIONS_DIR>', versionsDir)
      .replace('<PLUGIN_ROOT>', pluginRoot);
    const wrapperFile = path.join(tmp, 'wrapper.sh');
    writeExecutable(wrapperFile, wrapper);

    assert.strictEqual(
      execFileSync('bash', [wrapperFile], { encoding: 'utf8' }),
      'newest-version'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('getting started documents opt-in setup and replaces the separate plugin', () => {
  const docs = fs.readFileSync(DOCS, 'utf8');
  assert.ok(docs.includes('/groundwork:statusline install'));
  assert.ok(docs.includes('No separate `groundwork-statusline` plugin is needed'));
  assert.ok(docs.includes('`jq`'));
  assert.ok(docs.includes('`curl`'));
  assert.ok(docs.includes('`gh`'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
