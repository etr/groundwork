'use strict';

/**
 * Atomic-write contention workers.
 *
 * writer mode: wait for WORKER_RELEASE, then repeatedly write JSON documents
 *   to WORKER_TARGET via writeJsonSyncAtomic (WORKER_WRITES times), and write
 *   {ok} to WORKER_RESULT.
 * reader mode: poll WORKER_TARGET until WORKER_STOP appears, JSON.parse every
 *   observed document, and write {reads, failures} to WORKER_RESULT. Every
 *   observed document must be complete and parseable — a torn write is a
 *   failure even though the file name always exists.
 *
 * Usage: node atomic-io-workers.js writer|reader
 */

const fs = require('fs');
const path = require('path');
const { writeJsonSyncAtomic } = require(path.resolve(__dirname, '..', '..', 'lib', 'atomic-write.js'));

function waitForFile(file) {
  for (let attempt = 0; attempt < 6000; attempt++) {
    if (fs.existsSync(file)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  throw new Error(`worker timed out waiting for ${file}`);
}

const mode = process.argv[2];

// Ready/result files are consumed by the parent via existsSync-then-read, so
// they must be published atomically (rename): name existence then implies
// complete content. Plain fs.writeFileSync makes the inode visible at open,
// before content is flushed — the parent would observe a torn file.
writeJsonSyncAtomic(process.env.WORKER_READY, { ready: true, pid: process.pid });

if (mode === 'writer') {
  waitForFile(process.env.WORKER_RELEASE);
  const target = process.env.WORKER_TARGET;
  const writes = Number(process.env.WORKER_WRITES || '40');
  let ok = true;
  let error = null;
  try {
    for (let i = 0; i < writes; i++) {
      writeJsonSyncAtomic(target, { worker: process.pid, seq: i });
    }
  } catch (e) {
    ok = false;
    error = e.message;
  }
  writeJsonSyncAtomic(process.env.WORKER_RESULT, { ok, error });
} else if (mode === 'reader') {
  const target = process.env.WORKER_TARGET;
  let reads = 0;
  let failures = 0;
  const failureSamples = [];
  while (!fs.existsSync(process.env.WORKER_STOP)) {
    try {
      const raw = fs.readFileSync(target, 'utf8');
      if (raw.length > 0) {
        reads++;
        try {
          JSON.parse(raw);
        } catch {
          failures++;
          if (failureSamples.length < 3) failureSamples.push(raw.slice(0, 80));
        }
      }
    } catch {
      // File momentarily absent between rename and re-create — not a tear.
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
  }
  writeJsonSyncAtomic(process.env.WORKER_RESULT, { reads, failures, failureSamples });
} else {
  throw new Error(`unknown mode: ${mode}`);
}
