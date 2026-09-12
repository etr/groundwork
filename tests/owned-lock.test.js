/**
 * Tests for lib/owned-lock.js fixed-lock transition serialization.
 *
 * Fixed mutable state (lockfiles at stable paths) is mutated only inside a
 * serialized mutation turn (lib/lease-mutation.js): the compare/unlink inside
 * a release or reap can never interleave with another library process's
 * acquire, so a successor that legitimately re-acquired a slot is never
 * deleted, and two racers can never both believe they own the lock.
 *
 * Run with: node tests/owned-lock.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const OWNED_LOCK = path.resolve(__dirname, '..', 'lib', 'owned-lock.js');
const VALIDATION_SESSION = path.resolve(__dirname, '..', 'lib', 'validation-session.js');
const ACTOR = path.resolve(__dirname, 'helpers', 'lock-race-actor.js');

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

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gw-owned-lock-'));
}

function errorWithCode(code) {
  const error = new Error(`expected LockError with code ${code}`);
  error.code = code;
  return error;
}

// Assert an error carries one of the typed codes from the shared mutation
// protocol: contention, malformed-owner, ownership-loss, unreadable-path,
// foreign-host-unsupported.
function assertErrorCode(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.strictEqual(error.code, code, `error code was ${error.code}: ${error.message}`);
    return error;
  }
  throw errorWithCode(code);
}

function holderJson(overrides = {}) {
  return JSON.stringify({
    id: 'some-holder',
    pid: process.pid,
    host: os.hostname(),
    processStart: 'proc:0',
    acquiredAt: new Date().toISOString(),
    ...overrides,
  });
}

describe('typed transition errors', () => {
  test('a young foreign-host holder is never reaped and fails with foreign-host-unsupported', () => {
    const dir = tmp();
    try {
      const lockFile = path.join(dir, 'owned.lock');
      write(lockFile, holderJson({ host: 'definitely-not-this-host', pid: 1234 }));
      const error = assertErrorCode(
        () => require(OWNED_LOCK).acquireOwnedLock(lockFile),
        'foreign-host-unsupported'
      );
      // A foreign host cannot be probed: the lock must survive untouched.
      assert.strictEqual(JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid, 1234);
      assert.ok(/definitely-not-this-host|1234|foreign/i.test(error.message), error.message);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a malformed owner (valid JSON, not a lock record) fails with malformed-owner and no mutation', () => {
    const dir = tmp();
    try {
      const lockFile = path.join(dir, 'owned.lock');
      write(lockFile, JSON.stringify([1, 2, 3]));
      assertErrorCode(
        () => require(OWNED_LOCK).acquireOwnedLock(lockFile),
        'malformed-owner'
      );
      assert.strictEqual(
        fs.readFileSync(lockFile, 'utf8'),
        JSON.stringify([1, 2, 3]),
        'a malformed owner was mutated during the failed acquire'
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an unreadable lock path fails with unreadable-path and without mutation', () => {
    const dir = tmp();
    fs.chmodSync(dir, 0o700);
    try {
      const lockFile = path.join(dir, 'owned.lock');
      write(lockFile, holderJson({ id: 'someone-else' }));
      fs.chmodSync(lockFile, 0o000);
      assertErrorCode(
        () => require(OWNED_LOCK).acquireOwnedLock(lockFile),
        'unreadable-path'
      );
      fs.chmodSync(lockFile, 0o600);
      assert.strictEqual(
        JSON.parse(fs.readFileSync(lockFile, 'utf8')).id,
        'someone-else',
        'the unreadable lock was mutated'
      );
    } finally {
      fs.chmodSync(dir, 0o700);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('contention against a live same-host holder carries the contention code', () => {
    const dir = tmp();
    try {
      const lockFile = path.join(dir, 'owned.lock');
      // No processStart: the holder cannot be proved dead, and the live pid
      // keeps the lock contested.
      write(lockFile, holderJson({ id: 'live-holder', processStart: undefined }));
      const error = assertErrorCode(
        () => require(OWNED_LOCK).acquireOwnedLock(lockFile),
        'contention'
      );
      assert.ok(/live-holder|another/i.test(error.message), error.message);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('serialized transitions (successor survival)', () => {
  test('release cannot delete a successor swapped in after the final identity check', () => {
    const dir = tmp();
    try {
      const { acquireOwnedLock, releaseOwnedLock } = require(OWNED_LOCK);
      const lockFile = path.join(dir, 'owned.lock');
      const acquired = acquireOwnedLock(lockFile);
      const marker = path.join(dir, 'creator');
      fs.mkdirSync(marker, { recursive: true });
      const creatorScript = `
        const path = require('path');
        const fs = require('fs');
        const { acquireOwnedLock } = require(${JSON.stringify(OWNED_LOCK)});
        try {
          const handle = acquireOwnedLock(${JSON.stringify(lockFile)}, { staleMs: 1 });
          fs.writeFileSync(${JSON.stringify(path.join(marker, 'acquired'))}, handle.holder.id + '\\n');
          process.exit(0); // holds the lock; never releases
        } catch (error) {
          process.exit(9);
        }
      `;
      // Simulate preemption exactly between releaseOwnedLock's final identity
      // verification and its unlink: at that point a real contender acquires
      // the (aged-out) slot through the library in a subprocess.
      const realUnlinkSync = fs.unlinkSync;
      let creatorResult = null;
      try {
        fs.unlinkSync = function patchedUnlink(target, ...rest) {
          if (target === lockFile && creatorResult === null) {
            creatorResult = spawnSync(
              process.execPath,
              ['--eval', creatorScript],
              { encoding: 'utf8', timeout: 2_000 }
            );
          }
          return realUnlinkSync.call(fs, target, ...rest);
        };
        releaseOwnedLock(lockFile, acquired.holder.id);
      } finally {
        fs.unlinkSync = realUnlinkSync;
      }
      const acquiredMarker = path.join(marker, 'acquired');
      if (fs.existsSync(acquiredMarker)) {
        const creatorId = fs.readFileSync(acquiredMarker, 'utf8').trim();
        assert.ok(creatorId, 'creator marker is empty');
        assert.strictEqual(
          fs.existsSync(lockFile),
          true,
          'the release deleted a successor lock acquired after the final identity check'
        );
        assert.strictEqual(
          JSON.parse(fs.readFileSync(lockFile, 'utf8')).id,
          creatorId,
          'the successor holder was clobbered'
        );
      }
      // If the creator could not acquire in time (serialized behind the
      // release's mutation turn and killed by the timeout), that is the other
      // lawful outcome: no double ownership either way.
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('active.lock release cannot delete a successor swapped at the same boundary', () => {
    const dir = tmp();
    try {
      const helper = require(VALIDATION_SESSION);
      const parent = path.join(dir, 'slot');
      const lockFile = path.join(parent, 'active.lock');
      const release = helper.tryAcquireOpenLock(parent, lockFile);
      // Preempt the release between its final holder verification and its
      // unlink: the successor publishes its own open lock under the path while
      // the releaser is still reading the old content.
      const successorContent = JSON.stringify({
        version: 2,
        pid: 424242,
        host: os.hostname(),
        acquiredAt: new Date().toISOString(),
      });
      const currentContent = fs.readFileSync(lockFile, 'utf8');
      const realReadFileSync = fs.readFileSync;
      const successor = path.join(parent, 'successor.lock');
      write(successor, successorContent);
      let swapped = false;
      try {
        fs.readFileSync = function patchedRead(target, ...rest) {
          if (target === lockFile && !swapped) {
            swapped = true;
            fs.renameSync(successor, lockFile);
          }
          return realReadFileSync.call(fs, target, ...rest);
        };
        release();
      } finally {
        fs.readFileSync = realReadFileSync;
      }
      assert.strictEqual(swapped, true, 'the release never read the lockfile');
      assert.strictEqual(
        JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid,
        424242,
        'the active.lock release deleted a successor open lock at the identity boundary'
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('subprocess races', () => {
  function runActor(lockFile, role, staleMs, markerDir) {
    const child = spawn(
      process.execPath,
      [ACTOR, lockFile, role, String(staleMs), markerDir],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stderrBuffer = stderr;
    return child;
  }

  function waitForFile(file, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (fs.existsSync(file)) return;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }

  test('three barrier-controlled processes: the successor survives the stale reaper and releaser', () => {
    const dir = tmp();
    try {
      const { acquireOwnedLock, releaseOwnedLock } = require(OWNED_LOCK);
      const lockFile = path.join(dir, 'owned.lock');
      const marker = path.join(dir, 'markers');
      fs.mkdirSync(marker, { recursive: true });

      // Stale releaser: acquired the lock legitimately; its lock also ages out
      // (tiny staleMs for the reaper) while it still holds the holder id.
      const releaser = acquireOwnedLock(lockFile);
      write(path.join(marker, 'holder-id'), `${releaser.holder.id}\n`);
      const reaper = runActor(lockFile, 'acquire', 1, marker);
      waitForFile(path.join(marker, `${reaper.pid}-done`));
      const releaserResult = spawnSync(
        process.execPath,
        [ACTOR, lockFile, 'release', 0, marker],
        { encoding: 'utf8' }
      );
      assert.strictEqual(releaserResult.status, 1, 'the stale releaser was allowed to release a reaped lock');
      // Successor: acquires through the library after the dust settles.
      const successor = runActor(lockFile, 'acquire', 1, marker);
      waitForFile(path.join(marker, `${successor.pid}-done`));
      write(path.join(marker, 'finish'), 'finish\n');
      reaper.kill();
      // The successor is the last successful acquirer: its lock must be the
      // one on disk, no matter what the reaper/releaser interleaving did.
      const successorMarker = path.join(marker, `${successor.pid}-acquired`);
      assert.strictEqual(fs.existsSync(successorMarker), true, 'the successor reported no acquisition');
      const successorId = fs.readFileSync(successorMarker, 'utf8').trim();
      assert.strictEqual(
        JSON.parse(fs.readFileSync(lockFile, 'utf8')).id,
        successorId,
        'the last successful acquirer does not own the lockfile'
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('100 repeated races never produce two owners of the same lock', () => {
    const repetitions = Number(process.env.GROUNDWORK_RACE_REPS || 100);
    const dir = tmp();
    try {
      for (let repetition = 0; repetition < repetitions; repetition++) {
        const round = path.join(dir, `round-${repetition}`);
        fs.mkdirSync(round, { recursive: true });
        const lockFile = path.join(round, 'owned.lock');
        write(lockFile, holderJson({ id: 'crashed-holder', pid: -1, host: 'definitely-not-this-host', processStart: undefined, acquiredAt: new Date(Date.now() - 10 * 60_000).toISOString() }));
        const marker = path.join(round, 'markers');
        // A staleness window of 60s cannot age out a live winner: the only
        // lawful outcomes are one winner (the other sees contention) or, if
        // the loser races ahead, one winner after reaping the stale fixture.
        const racers = [runActor(lockFile, 'acquire', 60_000, marker), runActor(lockFile, 'acquire', 60_000, marker)];
        for (const racer of racers) waitForFile(path.join(marker, `${racer.pid}-done`));
        write(path.join(marker, 'finish'), 'finish\n');
        const winners = fs.readdirSync(marker).filter((name) => name.endsWith('-acquired'));
        assert.strictEqual(
          winners.length,
          1,
          `round ${repetition}: ${winners.length} racers both acquired the same lock`
        );
        const winnerId = fs.readFileSync(path.join(marker, winners[0]), 'utf8').trim();
        assert.strictEqual(
          JSON.parse(fs.readFileSync(lockFile, 'utf8')).id,
          winnerId,
          `round ${repetition}: the lockfile does not record the single winner`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('protocol wiring', () => {
  test('owned-lock routes every fixed-lock transition through the shared mutation protocol', () => {
    const source = fs.readFileSync(OWNED_LOCK, 'utf8');
    assert.match(source, /lease-mutation/, 'owned-lock must use the shared mutation protocol module');
    assert.doesNotMatch(
      source,
      /module\.exports[^;]*unlinkIfSameInode/s,
      'unlinkIfSameInode must not be exported unguarded'
    );
  });

  test('the validation active lock delegates to owned-lock', () => {
    const source = fs.readFileSync(VALIDATION_SESSION, 'utf8');
    assert.match(source, /acquireOwnedLock/, 'validation-session must delegate its active lock to owned-lock');
    assert.doesNotMatch(
      source,
      /openSync\(lockFile, 'wx'/,
      'validation-session must not implement its own O_EXCL lock creation beside owned-lock'
    );
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
