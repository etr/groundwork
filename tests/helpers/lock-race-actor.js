#!/usr/bin/env node
'use strict';

// Lock-race actor used by tests/owned-lock.test.js subprocess fixtures.
//
// Usage: node lock-race-actor.js <lockFile> <role> <staleMs> <markerDir>
// Roles:
//   acquire  — try to acquire (reaping a stale holder); on success write
//              <markerDir>/<pid>-acquired with the holder id and STAY ALIVE
//              holding the lock until <markerDir>/finish appears (so a
//              concurrent racer can never legitimately reap it). Always
//              writes <markerDir>/<pid>-done on outcome.
//   release  — release a lock whose holder id is in <markerDir>/holder-id.
//
// Exit code 0 = acquired (acquire role) or released (release role).

const path = require('path');
const fs = require('fs');
const { acquireOwnedLock, releaseOwnedLock } = require(path.resolve(
  path.dirname(module.filename),
  '..',
  '..',
  'lib',
  'owned-lock.js'
));

const [lockFile, role, staleMsRaw, markerDir] = process.argv.slice(2);
fs.mkdirSync(markerDir, { recursive: true });
const done = path.join(markerDir, `${process.pid}-done`);

function finish(body) {
  fs.writeFileSync(done, `${JSON.stringify(body)}\n`);
  process.exitCode = body.acquired || body.released ? 0 : 1;
}

function waitForFinish() {
  const finishFile = path.join(markerDir, 'finish');
  const deadline = Date.now() + 30_000;
  while (!fs.existsSync(finishFile)) {
    if (Date.now() > deadline) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}

try {
  if (role === 'acquire') {
    const handle = acquireOwnedLock(lockFile, { staleMs: Number(staleMsRaw) });
    fs.writeFileSync(path.join(markerDir, `${process.pid}-acquired`), `${handle.holder.id}\n`);
    finish({ acquired: true, holderId: handle.holder.id });
    waitForFinish(); // stay alive: a live holder must not be reapable
  } else if (role === 'release') {
    const holderId = fs.readFileSync(path.join(markerDir, 'holder-id'), 'utf8').trim();
    const released = releaseOwnedLock(lockFile, holderId);
    finish({ released });
  } else {
    finish({ error: `unknown role ${role}` });
  }
} catch (error) {
  finish({ error: error.message });
}
