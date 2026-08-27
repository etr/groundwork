const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createRunReporter,
  createTranscriptWriter,
  parseRunnerMarker,
  parseValidationProgress,
  showTaskLogs,
  showTaskStatus,
} = require('../lib/run-reporting');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.stack || error.message}`);
    failed++;
  }
}

test('publishes semantic phase progress to terminal and durable logs', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let terminal = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write(value) { terminal += value; } },
    });

    reporter.emit({ type: 'phase.started', phase: 'validate' });

    const humanLog = fs.readFileSync(path.join(runDir, 'runner.log'), 'utf8');
    const event = JSON.parse(fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8'));
    assert.match(terminal, /TASK-005 · validate · STARTED/);
    assert.strictEqual(humanLog, terminal);
    assert.deepStrictEqual(event, {
      v: 1,
      seq: 1,
      ts: '2026-08-26T16:48:00.000Z',
      run_id: 'run-1',
      project: 'maillist',
      task_id: 'TASK-005',
      type: 'phase.started',
      phase: 'validate',
    });
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('publishes phase completion with elapsed time', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let terminal = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write(value) { terminal += value; } },
    });

    reporter.emit({ type: 'phase.finished', phase: 'validate', outcome: 'pass', elapsed_ms: 91_000 });

    assert.match(terminal, /TASK-005 · validate · PASS · 01:31/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('default mode journals activity without adding human noise', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let terminal = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write(value) { terminal += value; } },
    });

    reporter.emit({ type: 'activity', summary: '$ python scripts/run_tests.py' });

    assert.strictEqual(terminal, '');
    assert.strictEqual(fs.readFileSync(path.join(runDir, 'runner.log'), 'utf8'), '');
    const event = JSON.parse(fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8'));
    assert.strictEqual(event.type, 'activity');
    assert.strictEqual(event.summary, '$ python scripts/run_tests.py');
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('verbose mode shows activity without polluting the human log', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let terminal = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      verbose: true,
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write(value) { terminal += value; } },
    });

    reporter.emit({ type: 'activity', summary: '$ python scripts/run_tests.py' });

    assert.match(terminal, /TASK-005 · activity · \$ python scripts\/run_tests\.py/);
    assert.strictEqual(fs.readFileSync(path.join(runDir, 'runner.log'), 'utf8'), '');
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('renders an explicit named gate outcome with evidence', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let terminal = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write(value) { terminal += value; } },
    });

    reporter.emit({
      type: 'gate.finished',
      gate: 'setup',
      outcome: 'baseline_fail',
      summary: 'administrator_onboarding missing httpx',
    });

    assert.match(terminal, /setup\s+· BASELINE FAIL · administrator_onboarding missing httpx/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('summarizes a completed repair batch', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let terminal = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write(value) { terminal += value; } },
    });

    reporter.emit({ type: 'repair.finished', iteration: 3, fixed: 30, files: 14, deferred: 1 });

    assert.match(terminal, /repair iteration 3 · COMPLETE · fixed 30 · files 14 · deferred 1/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('renders the current validation iteration and stage', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let terminal = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write(value) { terminal += value; } },
    });

    reporter.emit({ type: 'validation.stage', iteration: 4, stage: 'project gates' });

    assert.match(terminal, /TASK-005 · validate · iteration 4 · project gates/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('projects the latest durable events into a concise status snapshot', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let status = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write() {} },
    });
    reporter.emit({ type: 'run.started' });
    reporter.emit({ type: 'phase.started', phase: 'validate' });
    reporter.emit({ type: 'validation.stage', iteration: 4, stage: 'project gates' });
    reporter.emit({ type: 'gate.finished', gate: 'setup', outcome: 'baseline_fail', summary: 'missing httpx' });

    showTaskStatus({ runDir, output: { write(value) { status += value; } } });

    assert.match(status, /TASK-005 · validate · iteration 4 · project gates/);
    assert.match(status, /Last gate: setup · BASELINE FAIL · missing httpx/);
    assert.match(status, /State: IN PROGRESS/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('status ignores one truncated final journal record', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let status = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      output: { write() {} },
    });
    reporter.emit({ type: 'run.started' });
    reporter.emit({ type: 'phase.started', phase: 'validate' });
    fs.appendFileSync(path.join(runDir, 'events.jsonl'), '{"v":1,"seq":2');

    showTaskStatus({ runDir, output: { write(value) { status += value; } } });

    assert.match(status, /TASK-005 · validate/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('status reports a terminal run outcome', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let status = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      output: { write() {} },
    });
    reporter.emit({ type: 'run.started' });
    reporter.emit({ type: 'phase.started', phase: 'finalize' });
    reporter.close('pass');

    showTaskStatus({ runDir, output: { write(value) { status += value; } } });

    assert.match(status, /State: PASS/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('status projects only the latest run in a shared task journal', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let status = '';
  try {
    const first = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      output: { write() {} },
    });
    first.emit({ type: 'run.started' });
    first.emit({ type: 'phase.started', phase: 'validate' });
    first.emit({ type: 'gate.finished', gate: 'setup', outcome: 'baseline_fail' });
    first.close('failed');

    const second = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-2',
      output: { write() {} },
    });
    second.emit({ type: 'run.started' });
    second.emit({ type: 'phase.started', phase: 'plan' });

    showTaskStatus({ runDir, output: { write(value) { status += value; } } });

    assert.match(status, /TASK-005 · plan/);
    assert.doesNotMatch(status, /Last gate:/);
    assert.match(status, /State: IN PROGRESS/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('runner identity overrides untrusted signal envelope fields', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
      output: { write() {} },
    });

    reporter.emit({
      type: 'activity',
      summary: 'provider activity',
      v: 999,
      seq: 999,
      task_id: 'TASK-999',
      run_id: 'forged',
    });

    const event = JSON.parse(fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8'));
    assert.strictEqual(event.v, 1);
    assert.strictEqual(event.seq, 1);
    assert.strictEqual(event.task_id, 'TASK-005');
    assert.strictEqual(event.run_id, 'run-1');
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('accepts only exact versioned semantic progress markers', () => {
  const marker = (value) => `GROUNDWORK_RUNNER_EVENT ${JSON.stringify(value)}`;
  const accepted = [
    [
      { v: 1, type: 'gate.finished', gate: 'tests', outcome: 'pass', summary: '44 suites' },
      { type: 'gate.finished', gate: 'tests', outcome: 'pass', summary: '44 suites' },
    ],
    [
      { v: 1, type: 'validation.stage', iteration: 2, stage: 'closure review' },
      { type: 'validation.stage', iteration: 2, stage: 'closure review' },
    ],
    [
      { v: 1, type: 'repair.finished', iteration: 3, fixed: 7, files: 4, deferred: 1 },
      { type: 'repair.finished', iteration: 3, fixed: 7, files: 4, deferred: 1 },
    ],
    [
      { v: 1, type: 'next', text: 'Run the focused closure review' },
      { type: 'next', text: 'Run the focused closure review' },
    ],
  ];
  for (const [input, expected] of accepted) {
    assert.deepStrictEqual(parseRunnerMarker(marker(input)), expected);
  }

  const rejected = [
    'All tests passed',
    marker({ v: 1, type: 'gate.finished', gate: 'tests', outcome: 'excellent' }),
    marker({ v: 1, type: 'gate.finished', gate: 'tests', outcome: 'pass', extra: true }),
    marker({ v: 1, type: 'gate.finished', gate: 'Tests', outcome: 'pass' }),
    marker({ v: 1, type: 'gate.finished', gate: 'tests', outcome: 'pass', summary: 'x'.repeat(201) }),
    marker({ v: 1, type: 'validation.stage', iteration: 0, stage: 'project gates' }),
    marker({ v: 1, type: 'validation.stage', iteration: 1_001, stage: 'project gates' }),
    marker({ v: 1, type: 'validation.stage', iteration: 1, stage: 'invented' }),
    marker({ v: 1, type: 'validation.stage', iteration: 1, stage: 'repair', extra: true }),
    marker({ v: 1, type: 'repair.finished', iteration: 1, fixed: -1, files: 0, deferred: 0 }),
    marker({ v: 1, type: 'repair.finished', iteration: 1, fixed: 0, files: 100_001, deferred: 0 }),
    marker({ v: 1, type: 'repair.finished', iteration: 1, fixed: 0, files: 0, deferred: 0, extra: true }),
    marker({ v: 1, type: 'next', text: '' }),
    marker({ v: 1, type: 'next', text: 'line one\nline two' }),
    marker({ v: 1, type: 'next', text: 'x'.repeat(201) }),
    marker({ v: 1, type: 'next', text: 'safe', extra: true }),
  ];
  for (const input of rejected) assert.strictEqual(parseRunnerMarker(input), null, input);
});

test('redacts credentials and rejects terminal controls in semantic marker text', () => {
  const marker = (text) => parseRunnerMarker(
    `GROUNDWORK_RUNNER_EVENT ${JSON.stringify({ v: 1, type: 'next', text })}`
  );
  const secrets = [
    'OPENAI_API_KEY=sk-proj-example123456789',
    'Authorization: Bearer bearer-secret-value',
    'https://example.test/?X-Amz-Credential=access-id&X-Amz-Signature=signed-secret',
    'token=generic-secret-value',
    'sk-proj-standaloneSecret123456',
    '-----BEGIN PRIVATE KEY----- private-key-value -----END PRIVATE KEY-----',
  ];
  for (const secret of secrets) {
    const parsed = marker(`Continue after ${secret}`);
    assert.ok(parsed, secret);
    assert.match(parsed.text, /\[redacted\]/);
    assert.ok(!parsed.text.includes(secret), secret);
  }

  const controls = [
    '\u001b]52;c;YXR0YWNrZWQ=\u0007',
    '\u001b[31mred',
    'bell\u0007',
    'tab\ttext',
    'back\bspace',
    'delete\u007ftext',
    'c1\u009btext',
    'bidi\u202etext',
    'isolate\u2066text',
  ];
  for (const control of controls) assert.strictEqual(marker(control), null, JSON.stringify(control));
});

test('sanitizes semantic text at durable ingestion and when projecting forged journal records', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let terminal = '';
  let status = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      output: { write(value) { terminal += value; } },
    });
    reporter.emit({ type: 'run.started' });
    reporter.emit({
      type: 'gate.finished',
      gate: 'tests',
      outcome: 'pass',
      summary: 'OPENAI_API_KEY=sk-proj-example123456789',
    });
    reporter.close('pass');

    const eventPath = path.join(runDir, 'events.jsonl');
    const logPath = path.join(runDir, 'runner.log');
    const durable = `${fs.readFileSync(eventPath, 'utf8')}\n${fs.readFileSync(logPath, 'utf8')}`;
    assert.doesNotMatch(terminal, /sk-proj-example123456789/);
    assert.doesNotMatch(durable, /sk-proj-example123456789/);
    assert.match(durable, /\[redacted\]/);

    fs.appendFileSync(eventPath, `${JSON.stringify({
      v: 1,
      seq: 100,
      ts: '2026-08-26T16:48:00.000Z',
      run_id: 'run-2',
      project: 'maillist',
      task_id: 'TASK-005',
      type: 'phase.started',
      phase: 'validate',
    })}\n`);
    fs.appendFileSync(eventPath, `${JSON.stringify({
      v: 1,
      seq: 101,
      ts: '2026-08-26T16:48:01.000Z',
      run_id: 'run-2',
      project: 'maillist',
      task_id: 'TASK-005',
      type: 'gate.finished',
      gate: 'tests',
      outcome: 'pass',
      summary: 'Authorization: Bearer forged-status-secret',
    })}\n`);
    fs.appendFileSync(eventPath, `${JSON.stringify({
      v: 1,
      seq: 102,
      ts: '2026-08-26T16:48:02.000Z',
      run_id: 'run-2',
      project: 'maillist',
      task_id: 'TASK-005',
      type: 'gate.finished',
      gate: 'tests',
      outcome: 'forged',
      summary: '\u001b]52;c;YXR0YWNrZWQ=\u0007',
    })}\n`);

    showTaskStatus({ runDir, output: { write(value) { status += value; } } });

    assert.match(status, /tests · PASS · OPENAI_API_KEY=\[redacted\]/);
    assert.doesNotMatch(status, /forged-status-secret|YXR0YWNrZWQ|\u001b|\u0007/);
    assert.doesNotMatch(status, /forged/i);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('status rejects incomplete and non-contiguous tail runs', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  const eventPath = path.join(runDir, 'events.jsonl');
  let status = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'coherent-run',
      output: { write() {} },
    });
    reporter.emit({ type: 'run.started' });
    reporter.emit({ type: 'phase.started', phase: 'validate' });
    reporter.emit({ type: 'gate.finished', gate: 'tests', outcome: 'pass', summary: 'coherent result' });
    reporter.close('pass');

    const append = (event) => fs.appendFileSync(eventPath, `${JSON.stringify({
      v: 1,
      ts: '2026-08-26T16:48:00.000Z',
      project: 'maillist',
      task_id: 'TASK-005',
      ...event,
    })}\n`);
    append({ seq: 1, run_id: 'incomplete-tail', type: 'phase.started', phase: 'finalize' });
    append({ seq: 2, run_id: 'incomplete-tail', type: 'run.finished', outcome: 'failed' });
    append({ seq: 1, run_id: 'gapped-tail', type: 'run.started' });
    append({ seq: 3, run_id: 'gapped-tail', type: 'phase.started', phase: 'plan' });

    showTaskStatus({ runDir, output: { write(value) { status += value; } } });

    assert.match(status, /TASK-005 · validate/);
    assert.match(status, /Last gate: tests · PASS · coherent result/);
    assert.match(status, /State: PASS/);
    assert.doesNotMatch(status, /finalize|plan|FAILED/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('status reverse-scans only the latest run from a large append-only journal', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  const eventPath = path.join(runDir, 'events.jsonl');
  const originalReadSync = fs.readSync;
  const originalReadFileSync = fs.readFileSync;
  let bytesRead = 0;
  let wholeFileReads = 0;
  let status = '';
  try {
    const oldEvent = `${JSON.stringify({
      v: 1,
      seq: 1,
      ts: '2026-08-26T16:00:00.000Z',
      run_id: 'old-run',
      project: 'maillist',
      task_id: 'TASK-005',
      type: 'activity',
      summary: 'historical activity',
    })}\n`;
    fs.writeFileSync(eventPath, oldEvent.repeat(20_000));
    const latest = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'latest-run',
      output: { write() {} },
    });
    latest.emit({ type: 'run.started' });
    latest.emit({ type: 'phase.started', phase: 'validate' });
    latest.emit({ type: 'validation.stage', iteration: 2, stage: 'closure review' });
    latest.close('pass');

    fs.readSync = function trackedRead(fd, buffer, offset, length, position) {
      const read = originalReadSync.call(fs, fd, buffer, offset, length, position);
      bytesRead += read;
      return read;
    };
    fs.readFileSync = function trackedReadFile(...args) {
      wholeFileReads++;
      return originalReadFileSync.apply(fs, args);
    };
    showTaskStatus({ runDir, output: { write(value) { status += value; } } });

    assert.match(status, /TASK-005 · validate · iteration 2 · closure review/);
    assert.match(status, /State: PASS/);
    assert.strictEqual(wholeFileReads, 0);
    assert.ok(bytesRead < 128 * 1024, `status read ${bytesRead} bytes`);
  } finally {
    fs.readSync = originalReadSync;
    fs.readFileSync = originalReadFileSync;
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('batches durable event writes through descriptors that close with the run', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  const originalOpenSync = fs.openSync;
  const originalCloseSync = fs.closeSync;
  const originalWriteSync = fs.writeSync;
  const opened = [];
  const closed = [];
  let writes = 0;
  try {
    fs.openSync = function trackedOpen(...args) {
      const fd = originalOpenSync.apply(fs, args);
      opened.push(fd);
      return fd;
    };
    fs.closeSync = function trackedClose(fd) {
      closed.push(fd);
      return originalCloseSync.call(fs, fd);
    };
    fs.writeSync = function trackedWrite(...args) {
      writes++;
      return originalWriteSync.apply(fs, args);
    };
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      output: { write() {} },
    });
    reporter.emitBatch(Array.from({ length: 500 }, (_, index) => ({
      type: 'activity',
      summary: `tool ${index} completed`,
    })), { display: false });
    reporter.close('pass');

    assert.strictEqual(opened.length, 2);
    assert.ok(writes <= 4, `expected bounded writes, received ${writes}`);
    assert.deepStrictEqual(new Set(closed), new Set(opened));
    assert.strictEqual(fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').trim().split('\n').length, 501);
  } finally {
    fs.openSync = originalOpenSync;
    fs.closeSync = originalCloseSync;
    fs.writeSync = originalWriteSync;
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('refuses symlinked durable output files', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  const external = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-external-')), 'outside.log');
  try {
    fs.writeFileSync(external, 'sentinel\n');
    fs.symlinkSync(external, path.join(runDir, 'runner.log'));

    assert.throws(() => createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-005',
      runId: 'run-1',
      output: { write() {} },
    }), /symlink|regular file/i);
    assert.strictEqual(fs.readFileSync(external, 'utf8'), 'sentinel\n');
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(external), { recursive: true, force: true });
  }
});

test('persists multiline user-visible agent output with credential redaction', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  try {
    const transcript = createTranscriptWriter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-006',
      runId: 'run-1',
      phase: 'validate',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
    });

    transcript.emit({
      type: 'agent.output',
      agent: 'validation-coordinator',
      text: 'Round 4 repair complete.\nOPENAI_API_KEY=sk-proj-example123456789',
    });
    transcript.close();

    const record = JSON.parse(fs.readFileSync(path.join(runDir, 'transcript.jsonl'), 'utf8'));
    assert.strictEqual(record.type, 'agent.output');
    assert.strictEqual(record.agent, 'validation-coordinator');
    assert.match(record.text, /Round 4 repair complete\.\nOPENAI_API_KEY=\[redacted\]/);
    assert.doesNotMatch(record.text, /sk-proj-example123456789/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('records explicit original and retained byte counts when agent output is truncated', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  try {
    const transcript = createTranscriptWriter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-006',
      runId: 'run-1',
      phase: 'validate',
    });
    transcript.emit({
      type: 'agent.output',
      agent: 'validation-coordinator',
      text: `head-${'x'.repeat(300 * 1024)}-tail`,
    });
    transcript.close();

    const record = JSON.parse(fs.readFileSync(path.join(runDir, 'transcript.jsonl'), 'utf8'));
    assert.strictEqual(record.truncated, true);
    assert.strictEqual(record.original_bytes, 300 * 1024 + 10);
    assert.strictEqual(record.retained_bytes, Buffer.byteLength(record.text, 'utf8'));
    assert.ok(record.retained_bytes < record.original_bytes);
    assert.match(record.text, /^head-/);
    assert.match(record.text, /-tail$/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('parses reviewer launch and verdict progress into per-agent state', () => {
  const launched = parseValidationProgress(
    'GROUNDWORK_VALIDATION_PROGRESS '
      + '{"iteration":4,"status":"launched","agents":["spec-alignment-checker","code-quality-reviewer"]}'
  );
  const completed = parseValidationProgress(
    'GROUNDWORK_VALIDATION_PROGRESS '
      + '{"iteration":4,"status":"completed","agents":'
      + '[{"name":"spec-alignment-checker","verdict":"request-changes"},'
      + '{"name":"code-quality-reviewer","verdict":"approve"}]}'
  );

  assert.deepStrictEqual(launched, {
    type: 'review.batch',
    iteration: 4,
    agents: [
      { name: 'spec-alignment-checker', status: 'running' },
      { name: 'code-quality-reviewer', status: 'running' },
    ],
  });
  assert.deepStrictEqual(completed, {
    type: 'review.batch',
    iteration: 4,
    agents: [
      { name: 'spec-alignment-checker', status: 'request-changes' },
      { name: 'code-quality-reviewer', status: 'approve' },
    ],
  });
});

test('status shows the durable validation round stage and reviewer state', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let status = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-006',
      runId: 'run-1',
      output: { write() {} },
    });
    reporter.emit({ type: 'run.started' });
    reporter.emit({ type: 'phase.started', phase: 'validate' });

    showTaskStatus({
      runDir,
      validation: {
        iteration: 4,
        stage: 'fixer-result-ready',
        updatedAt: '2026-08-26T23:24:30.538Z',
        reviewers: [
          { name: 'architecture-alignment-checker', status: 'approve', carried: true },
          { name: 'spec-alignment-checker', status: 'request-changes' },
          { name: 'code-quality-reviewer', status: 'approve' },
        ],
      },
      output: { write(value) { status += value; } },
    });

    assert.match(status, /TASK-006 · validate · round 4/);
    assert.match(status, /Stage: repair accepted · post-repair gates pending/);
    assert.match(status, /architecture-alignment-checker\s+APPROVED · carried/);
    assert.match(status, /spec-alignment-checker\s+REQUEST CHANGES/);
    assert.match(status, /code-quality-reviewer\s+APPROVED/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('status shows live reviewer states from the current transcript batch', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let status = '';
  try {
    const reporter = createRunReporter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-006',
      runId: 'run-1',
      output: { write() {} },
    });
    reporter.emit({ type: 'run.started' });
    reporter.emit({ type: 'phase.started', phase: 'validate' });
    const transcript = createTranscriptWriter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-006',
      runId: 'run-1',
      phase: 'validate',
    });
    transcript.emit({
      type: 'review.batch',
      iteration: 4,
      agents: [
        { name: 'security-reviewer', status: 'approve' },
        { name: 'spec-alignment-checker', status: 'running' },
      ],
    });
    transcript.close();

    showTaskStatus({ runDir, output: { write(value) { status += value; } } });

    assert.match(status, /TASK-006 · validate · round 4/);
    assert.match(status, /security-reviewer\s+APPROVED/);
    assert.match(status, /spec-alignment-checker\s+RUNNING/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('logs tails the current run transcript with multiline agent output', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let logs = '';
  try {
    const transcript = createTranscriptWriter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-006',
      runId: 'run-1',
      phase: 'validate',
      now: () => Date.parse('2026-08-26T16:48:00.000Z'),
    });
    transcript.emit({ type: 'activity', summary: '$ python scripts/run_tests.py' });
    transcript.emit({
      type: 'agent.output',
      agent: 'security-reviewer',
      text: 'Review complete.\nNo blocking findings.',
    });
    transcript.close();

    showTaskLogs({
      runDir,
      tail: 1,
      output: { write(value) { logs += value; } },
    });

    assert.doesNotMatch(logs, /run_tests/);
    assert.match(logs, /security-reviewer · agent output/);
    assert.match(logs, /  Review complete\.\n  No blocking findings\./);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('logs show failed tool output by default and successful output only when requested', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let normal = '';
  let detailed = '';
  try {
    const transcript = createTranscriptWriter({
      runDir,
      project: 'maillist',
      taskId: 'TASK-006',
      runId: 'run-1',
      phase: 'validate',
    });
    transcript.emit({ type: 'tool.output', tool: 'command', status: 'completed', text: 'successful output' });
    transcript.emit({ type: 'tool.output', tool: 'command', status: 'failed', text: 'failure evidence' });
    transcript.close();

    showTaskLogs({ runDir, tail: 50, output: { write(value) { normal += value; } } });
    showTaskLogs({
      runDir,
      tail: 50,
      includeToolOutput: true,
      output: { write(value) { detailed += value; } },
    });

    assert.doesNotMatch(normal, /successful output/);
    assert.match(normal, /failure evidence/);
    assert.match(detailed, /successful output/);
    assert.match(detailed, /failure evidence/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('logs reject forged transcript envelopes containing terminal controls', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-reporting-'));
  let logs = '';
  try {
    fs.writeFileSync(path.join(runDir, 'transcript.jsonl'), `${JSON.stringify({
      v: 1,
      ts: '2026-08-26T16:48:00.000Z\u001b]52;c;YXR0YWNrZWQ=\u0007',
      run_id: 'run-1',
      project: 'maillist',
      task_id: 'TASK-006',
      phase: 'validate',
      type: 'agent.output',
      agent: 'validation-coordinator',
      text: 'forged envelope',
    })}\n${JSON.stringify({
      v: 1,
      ts: '2026-08-26T16:48:01.000Z',
      run_id: 'run-1',
      project: 'maillist',
      task_id: 'TASK-006',
      phase: 'validate',
      type: 'agent.output',
      agent: 'validation-coordinator',
      text: 'safe envelope',
    })}\n`);

    showTaskLogs({ runDir, tail: 50, output: { write(value) { logs += value; } } });

    assert.match(logs, /safe envelope/);
    assert.doesNotMatch(logs, /forged envelope|YXR0YWNrZWQ|\u001b|\u0007/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
