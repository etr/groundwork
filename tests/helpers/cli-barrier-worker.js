'use strict';

/**
 * Generic CLI barrier worker: waits for the WORKER_RELEASE marker, runs one
 * `node <script> <args...>` invocation (WORKER_COMMAND env, JSON array), and
 * writes {ok, status, stdout} to WORKER_RESULT. Keeps multi-process tests
 * synchronizable from a synchronous test parent.
 *
 * READY and RESULT files are rename-published via the shared atomic write:
 * once the parent observes the filename, the content is always complete and
 * parseable — a plain writeFileSync makes the inode visible before its
 * content is flushed, which a loaded parent can read as a torn file.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeJsonSyncAtomic } = require(path.resolve(__dirname, '..', '..', 'lib', 'atomic-write.js'));

function waitForFile(file) {
  for (let attempt = 0; attempt < 3000; attempt++) {
    if (fs.existsSync(file)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  throw new Error(`worker timed out waiting for ${file}`);
}

const command = JSON.parse(process.env.WORKER_COMMAND);
writeJsonSyncAtomic(process.env.WORKER_READY, { ready: true, pid: process.pid });
waitForFile(process.env.WORKER_RELEASE);
const result = spawnSync(process.execPath, command, { encoding: 'utf8' });
writeJsonSyncAtomic(process.env.WORKER_RESULT, {
  ok: result.status === 0,
  status: result.status,
  stdout: result.stdout,
  stderr: result.stderr,
});
