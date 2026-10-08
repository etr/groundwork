/** Regression coverage for harnesses that close stdin before reading the prompt. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { invokePhase } = require('../bin/groundwork-run');

const root = path.resolve(__dirname, '..');
const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-phase-stdin-'));
const previousPath = process.env.PATH;
const prompt = 'prompt\n'.repeat(150000);
let failed = 0;

function test(name, source, check) {
  try {
    fs.writeFileSync(path.join(fakeBin, 'claude'), source, { mode: 0o755 });
    check(() => invokePhase({
      harness: 'claude', phase: 'validate', cwd: root, pluginRoot: root, prompt, env: {},
    }));
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}\n${error.stack}`);
  }
}

try {
  process.env.PATH = `${fakeBin}${path.delimiter}${previousPath}`;
  test('early stdin close preserves the child exit code and stderr',
    '#!/bin/sh\nexec 0<&-\nprintf "%s\\n" "simulated failure" >&2\nexit 7\n',
    (invoke) => assert.throws(invoke, /validate process exited 7: simulated failure/));

  test('early stdin close preserves a successful final result',
    '#!/bin/sh\nexec 0<&-\nprintf \'%s\\n\' \'{"type":"result","result":"RESULT: TEST"}\'\n',
    (invoke) => assert.strictEqual(invoke(), 'RESULT: TEST'));

  test('the harness receives the complete prompt on stdin',
    `#!${process.execPath}\nconst fs = require('fs');\nconst prompt = fs.readFileSync(0, 'utf8');\nconsole.log(JSON.stringify({type: 'result', result: prompt}));\n`,
    (invoke) => assert.strictEqual(invoke(), prompt));

  test('genuine spawn failures retain their error code',
    '',
    (invoke) => {
      fs.unlinkSync(path.join(fakeBin, 'claude'));
      process.env.PATH = fakeBin;
      assert.throws(invoke, { code: 'ENOENT' });
    });
} finally {
  process.env.PATH = previousPath;
  fs.rmSync(fakeBin, { recursive: true, force: true });
}

process.exitCode = failed ? 1 : 0;
