'use strict';

/**
 * Generic CLI barrier worker: waits for the WORKER_RELEASE marker, runs one
 * `node <script> <args...>` invocation (WORKER_COMMAND env, JSON array), and
 * writes {ok, status, stdout} to WORKER_RESULT. Keeps multi-process tests
 * synchronizable from a synchronous test parent.
 */

const fs = require('fs');
const { spawnSync } = require('child_process');

function waitForFile(file) {
  for (let attempt = 0; attempt < 3000; attempt++) {
    if (fs.existsSync(file)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  throw new Error(`worker timed out waiting for ${file}`);
}

const command = JSON.parse(process.env.WORKER_COMMAND);
fs.writeFileSync(process.env.WORKER_READY, `${JSON.stringify({ ready: true, pid: process.pid })}\n`);
waitForFile(process.env.WORKER_RELEASE);
const result = spawnSync(process.execPath, command, { encoding: 'utf8' });
fs.writeFileSync(process.env.WORKER_RESULT, `${JSON.stringify({
  ok: result.status === 0,
  status: result.status,
  stdout: result.stdout,
  stderr: result.stderr,
})}\n`);
