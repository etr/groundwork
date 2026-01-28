/**
 * Tests for continuous-learning components
 *
 * Run with: node tests/continuous-learning.test.js
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CL_DIR = path.join(PLUGIN_ROOT, 'skills', 'continuous-learning');

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

// Tests
describe('config.json', () => {
  const configPath = path.join(CL_DIR, 'config.json');

  test('exists and is valid JSON', () => {
    assert.ok(fs.existsSync(configPath), 'config.json should exist');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    assert.ok(config, 'Should parse as valid JSON');
  });

  test('has current structure', () => {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);

    assert.ok(config.version, 'Should have version');
    assert.ok(config.mode, 'Should have mode');
  });

  test('has observation config', () => {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);

    assert.ok(config.observation, 'Should have observation config');
    assert.strictEqual(typeof config.observation.enabled, 'boolean');
    assert.ok(config.observation.store_path, 'Should have store_path');
    assert.strictEqual(typeof config.observation.max_file_size_mb, 'number');
  });

  test('has instincts config', () => {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);

    assert.ok(config.instincts, 'Should have instincts config');
    assert.ok(config.instincts.personal_path, 'Should have personal_path');
    assert.ok(config.instincts.inherited_path, 'Should have inherited_path');
    assert.strictEqual(typeof config.instincts.min_confidence, 'number');
    assert.strictEqual(typeof config.instincts.auto_approve_threshold, 'number');
  });

  test('has analysis config', () => {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);

    assert.ok(config.analysis, 'Should have analysis config');
    assert.strictEqual(typeof config.analysis.trigger_threshold, 'number');
    assert.strictEqual(typeof config.analysis.run_on_session_end, 'boolean');
  });

  test('has min_session_length', () => {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);

    assert.strictEqual(typeof config.min_session_length, 'number');
  });
});

describe('observe.sh', () => {
  const observePath = path.join(CL_DIR, 'hooks', 'observe.sh');

  test('exists', () => {
    assert.ok(fs.existsSync(observePath), 'observe.sh should exist');
  });

  test('has shebang', () => {
    const content = fs.readFileSync(observePath, 'utf8');
    assert.ok(content.startsWith('#!/bin/bash'), 'Should start with bash shebang');
  });

  test('has error recovery wrapper', () => {
    const content = fs.readFileSync(observePath, 'utf8');
    assert.ok(content.includes('log_error'), 'Should have log_error function');
    assert.ok(content.includes('main()'), 'Should wrap logic in main function');
  });

  test('reads JSON from stdin', () => {
    const content = fs.readFileSync(observePath, 'utf8');
    assert.ok(content.includes('cat'), 'Should read from stdin');
  });

  test('writes to observations.jsonl', () => {
    const content = fs.readFileSync(observePath, 'utf8');
    assert.ok(content.includes('observations.jsonl'), 'Should write to observations.jsonl');
  });

  test('handles file size limits', () => {
    const content = fs.readFileSync(observePath, 'utf8');
    assert.ok(content.includes('MAX_FILE_SIZE_MB'), 'Should have file size limit');
    assert.ok(content.includes('archive'), 'Should archive when limit reached');
  });
});

describe('evaluate-session.sh', () => {
  const evalPath = path.join(CL_DIR, 'hooks', 'evaluate-session.sh');

  test('exists', () => {
    assert.ok(fs.existsSync(evalPath), 'evaluate-session.sh should exist');
  });

  test('has shebang', () => {
    const content = fs.readFileSync(evalPath, 'utf8');
    assert.ok(content.startsWith('#!/bin/bash'), 'Should start with bash shebang');
  });

  test('has error recovery wrapper', () => {
    const content = fs.readFileSync(evalPath, 'utf8');
    assert.ok(content.includes('log_error'), 'Should have log_error function');
    assert.ok(content.includes('main()'), 'Should wrap logic in main function');
  });

  test('loads config.json if available', () => {
    const content = fs.readFileSync(evalPath, 'utf8');
    assert.ok(content.includes('config.json'), 'Should reference config.json');
  });

  test('respects minimum session length', () => {
    const content = fs.readFileSync(evalPath, 'utf8');
    assert.ok(content.includes('MIN_SESSION_LENGTH'), 'Should check min session length');
  });

  test('runs analysis synchronously', () => {
    const content = fs.readFileSync(evalPath, 'utf8');
    assert.ok(content.includes('analyze-observations.js'), 'Should run analysis');
    assert.ok(content.includes('ANALYSIS_THRESHOLD'), 'Should check threshold');
  });

  test('outputs valid hook JSON', () => {
    const content = fs.readFileSync(evalPath, 'utf8');
    assert.ok(content.includes('hookSpecificOutput'), 'Should output hook JSON');
    assert.ok(content.includes('hookEventName'), 'Should include hookEventName');
  });
});

describe('start-observer.sh', () => {
  const startPath = path.join(CL_DIR, 'agents', 'start-observer.sh');

  test('exists', () => {
    assert.ok(fs.existsSync(startPath), 'start-observer.sh should exist');
  });

  test('supports start/stop/status commands', () => {
    const content = fs.readFileSync(startPath, 'utf8');
    assert.ok(content.includes('case'), 'Should use case statement');
    assert.ok(content.includes('stop)'), 'Should handle stop');
    assert.ok(content.includes('status)'), 'Should handle status');
    assert.ok(content.includes('start)'), 'Should handle start');
  });

  test('checks for claude CLI availability', () => {
    const content = fs.readFileSync(startPath, 'utf8');
    assert.ok(content.includes('command -v claude'), 'Should check for claude command');
  });

  test('provides fallback message if claude not available', () => {
    const content = fs.readFileSync(startPath, 'utf8');
    assert.ok(content.includes('Claude CLI not available'), 'Should have fallback message');
  });

  test('manages PID file', () => {
    const content = fs.readFileSync(startPath, 'utf8');
    assert.ok(content.includes('PID_FILE'), 'Should manage PID file');
    assert.ok(content.includes('rm -f "$PID_FILE"'), 'Should clean up PID file');
  });
});

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
