/**
 * Tests for hooks/validate-agent-output.sh
 *
 * Focus areas (regression guards for the false-positive storm that looped
 * reviewer subagents):
 *   - Truncation detection only fires on a *trailing* ellipsis, not on a
 *     "..." buried in a spread operator, path, diff, or mid-sentence pause.
 *   - The review-agent verdict check matches the real Groundwork agent names
 *     ("<area>-reviewer" / "<area>-checker") and verdict vocabulary
 *     ("approve" / "request-changes"), instead of a stale list that never fired.
 *
 * Run with: node tests/validate-agent-output.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(PLUGIN_ROOT, 'hooks', 'validate-agent-output.sh');

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

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

/** Run the hook with a SubagentStop payload and return its additionalContext. */
function runHook(payload) {
  const out = execSync(`bash "${HOOK}"`, {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(out);
  assert.ok(parsed.hookSpecificOutput, 'hook must emit hookSpecificOutput');
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'SubagentStop');
  return parsed.hookSpecificOutput.additionalContext || '';
}

/** additionalContext produced for a review agent emitting `output`. */
function review(output, type = 'code-quality-reviewer') {
  return runHook({ subagent_type: type, tool_output: output });
}

/**
 * additionalContext for a NON-review agent emitting `output`. Used to exercise
 * the truncation/error checks in isolation, without the verdict check (which
 * only applies to "-reviewer"/"-checker" agents) muddying the assertion.
 */
function neutral(output) {
  return runHook({ subagent_type: 'task-executor', tool_output: output });
}

/**
 * Build a temp transcript JSONL containing `messages` (each an assistant text
 * string) and return the path. This mirrors the REAL SubagentStop contract:
 * the harness ships a `transcript_path`, not the output inline. The last
 * non-empty assistant message in the file is the agent's effective output.
 */
let _tmpSeq = 0;
function writeTranscript(messages) {
  const file = path.join(os.tmpdir(), `gw-transcript-${process.pid}-${_tmpSeq++}.jsonl`);
  const lines = messages.map((text) =>
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } }),
  );
  // Prepend a user turn so the file looks like a real transcript.
  lines.unshift(JSON.stringify({ type: 'user', message: { role: 'user', content: 'go' } }));
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

/** Run the hook the way the harness actually does: output lives in a transcript. */
function viaTranscript(lastMessage, type = 'task-executor') {
  const file = writeTranscript([lastMessage]);
  try {
    return runHook({ subagent_type: type, transcript_path: file });
  } finally {
    fs.unlinkSync(file);
  }
}

function assertClean(ctx) {
  assert.strictEqual(ctx, '', `expected no validation issues, got: ${ctx}`);
}

function assertFlagged(ctx, re) {
  assert.ok(ctx.length > 0, 'expected the hook to flag an issue, got none');
  assert.ok(re.test(ctx), `expected issue matching ${re}, got: ${ctx}`);
}

// ---------------------------------------------------------------------------

describe('truncation: false positives (a "..." that is NOT truncation)', () => {
  test('object spread operator in quoted code', () => {
    assertClean(neutral('The result is built with const details = { ...result, sprScheduled };'));
  });

  test('array spread in quoted code', () => {
    assertClean(neutral('It drains the queue via Promise.all([...this.pendingSpr]) before returning.'));
  });

  test('rest parameters in quoted code', () => {
    assertClean(neutral('The helper mapWithConcurrency(items, limit, worker) spreads (...args) internally.'));
  });

  test('intra-sentence ellipsis pause', () => {
    assertClean(neutral('The function starts well... but the validation could be tightened a bit.'));
  });

  test('ellipsis inside a file path', () => {
    assertClean(neutral('Findings were written to /tmp/groundwork-validation-.../findings.json as expected.'));
  });

  test('ellipsis inside a git diff hunk header', () => {
    assertClean(neutral('The hunk @@ -1,3 ... +1,9 @@ shows the new background scheduling path.'));
  });

  test('compact verdict JSON containing a spread snippet (the real reviewer response)', () => {
    const compact = JSON.stringify({
      verdict: 'approve',
      score: 90,
      summary: 'Clean SPR integration; one redundant spread { ...x } pattern remains',
      findings_file: '/tmp/x/findings.json',
      counts: { critical: 0, major: 0, minor: 3 },
    });
    // A real reviewer response: both the spread "..." AND the verdict must
    // leave it completely clean.
    assertClean(review(compact));
  });

  test('complete sentence ending in "etc." is not flagged', () => {
    assertClean(neutral('It supports the standard memory types: user, feedback, project, etc.'));
  });

  test('"etc." mid-sentence is not flagged', () => {
    assertClean(neutral('The tool handles user, project, reference, etc. and routes each by scope.'));
  });

  test('sentence ending in "and so on" is not flagged', () => {
    assertClean(neutral('The sweep stats each file, regenerates stale companions, and so on'));
  });
});

describe('truncation: real positives (output genuinely cut off)', () => {
  test('trailing ASCII ellipsis', () => {
    assertFlagged(neutral('The function processes the input and then it'.concat('...')), /truncated/);
  });

  test('trailing ellipsis with trailing whitespace/newline', () => {
    assertFlagged(neutral('The write path looks correct so far but...\n   '), /truncated/);
  });

  test('trailing Unicode ellipsis (…)', () => {
    assertFlagged(neutral('The verdict is pending while I examine the stale path…'), /truncated/);
  });

  test('four trailing dots still reads as truncated', () => {
    assertFlagged(neutral('The remaining analysis is left incomplete....'), /truncated/);
  });

  test('explicit "to be continued" marker anywhere', () => {
    assertFlagged(
      neutral('Here are the first three findings. To be continued in the next pass.'),
      /truncated/,
    );
  });

  test('a trailing ellipsis still flags even for a reviewer (with a verdict present)', () => {
    assertFlagged(review('Verdict: approve. Still finishing the last file...'), /truncated/);
  });
});

describe('verdict check: correct agent names and vocabulary', () => {
  test('reviewer with an "approve" verdict is clean', () => {
    assertClean(review('{"verdict":"approve","score":88}', 'security-reviewer'));
  });

  test('checker with a "request-changes" verdict is clean', () => {
    assertClean(review('{"verdict":"request-changes","score":74}', 'spec-alignment-checker'));
  });

  test('fully-qualified subagent_type still recognized as a reviewer', () => {
    assertClean(
      review('{"verdict":"approve","score":97}', 'groundwork:architecture-alignment-checker:architecture-alignment-checker'),
    );
  });

  test('reviewer that omits any verdict IS flagged (check now actually fires)', () => {
    assertFlagged(
      review('I examined the auth code and the input validation paths thoroughly.', 'security-reviewer'),
      /verdict/,
    );
  });

  test('non-review agent without a verdict is NOT flagged', () => {
    assertClean(review('Implemented the feature and ran the whole suite; all green.', 'task-executor'));
  });
});

describe('unchanged checks still work (regression guards)', () => {
  test('very short output is flagged', () => {
    assertFlagged(review('ok'), /short or empty/);
  });

  test('error indicator is still flagged (and emits valid JSON despite regex chars)', () => {
    assertFlagged(
      neutral('Traceback (most recent call last): the run failed: boom'),
      /error indicator/,
    );
  });

  test('a clean, complete review produces no context', () => {
    assertClean(
      review('The change is well structured and the tests cover the new branches. Verdict: approve.'),
    );
  });
});

describe('output resolution: the actual root cause of the rogue-agent storm', () => {
  // The original hook read the output from "tool_output"/"output" -- keys the
  // real SubagentStop payload never contains. So output_str was ALWAYS empty
  // and EVERY subagent got "short or empty output", which agents then fought by
  // editing this hook and settings.json. These guard that a payload shaped like
  // the real harness never produces a phantom warning.

  test('realistic payload (no output field, no transcript) produces NO warning', () => {
    assertClean(
      runHook({
        session_id: 'abc',
        hook_event_name: 'SubagentStop',
        stop_hook_active: false,
        subagent_type: 'security-reviewer',
      }),
    );
  });

  test('payload pointing at a missing transcript file produces NO warning', () => {
    assertClean(
      runHook({ subagent_type: 'code-quality-reviewer', transcript_path: '/no/such/transcript.jsonl' }),
    );
  });

  test('output is recovered from the transcript: a real compact approve verdict is clean', () => {
    assertClean(
      viaTranscript(
        JSON.stringify({ verdict: 'approve', score: 90, summary: 'clean { ...x } spread', findings_file: '/tmp/f.json' }),
        'security-reviewer',
      ),
    );
  });

  test('transcript with a genuinely short last assistant message IS flagged', () => {
    assertFlagged(viaTranscript('ok'), /short or empty/);
  });

  test('transcript truncation check works off the recovered output', () => {
    assertFlagged(viaTranscript('The verdict is pending while I read the last file...'), /truncated/);
  });

  test('only the LAST assistant message counts (earlier short turns are ignored)', () => {
    const file = writeTranscript(['thinking...', 'ok', 'Verdict: approve. The change is well structured and complete.']);
    try {
      assertClean(runHook({ subagent_type: 'code-quality-reviewer', transcript_path: file }));
    } finally {
      fs.unlinkSync(file);
    }
  });
});

describe('crash check: only a real traceback, not a reviewer talking about errors', () => {
  test('a reviewer summary mentioning "error:" is NOT flagged', () => {
    assertClean(review('{"verdict":"request-changes","summary":"error: missing null check on input"}'));
  });

  test('a test reviewer reporting "failed:" is NOT flagged', () => {
    assertClean(review('{"verdict":"request-changes","summary":"test_login failed: no assertions present"}', 'test-quality-reviewer'));
  });

  test('a security reviewer discussing an "exception:" path is NOT flagged', () => {
    assertClean(neutral('The handler swallows the exception: it should log and rethrow instead.'));
  });

  test('an actual Python traceback IS still flagged', () => {
    assertFlagged(neutral('Traceback (most recent call last):\n  File "x.py", line 1\nValueError'), /error indicator/);
  });
});

describe('message safety: the diagnostic must not invite infrastructure edits', () => {
  // Agents "went rogue" because the warning read as an actionable instruction.
  // The message must explicitly scope itself as non-actionable.
  test('a flagged message tells the agent NOT to edit hooks/settings or leave scope', () => {
    const ctx = viaTranscript('ok');
    assert.ok(/do not act on it/i.test(ctx), `message should be non-actionable, got: ${ctx}`);
    assert.ok(/hooks|settings/i.test(ctx), `message should name hooks/settings as off-limits, got: ${ctx}`);
  });

  test('the stale action-inviting phrasing is gone', () => {
    const ctx = viaTranscript('ok');
    assert.ok(!/consider reviewing the agent output/i.test(ctx), `stale phrasing must be removed, got: ${ctx}`);
  });
});

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
