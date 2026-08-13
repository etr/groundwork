'use strict';

const fs = require('fs');
const path = require('path');

const [
  runnerPath,
  commonDir,
  mode,
  project,
  taskId,
  readyFile,
  releaseFile,
  blockedFile,
  publishReady,
  publishRelease,
  removeReady,
  removeRelease,
] = process.argv.slice(2);
const { acquireProjectLease, acquireRepositoryGate } = require(runnerPath);

const owner = { project, projectPath: project === '.' ? '.' : `apps/${project}`, taskId };
const dependencies = {
  log: () => {},
  beforeLeasePublish(file) {
    if (!publishReady || path.basename(file) !== 'writer.lock') return;
    fs.writeFileSync(publishReady, 'paused\n');
    while (!fs.existsSync(publishRelease)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  },
  beforeLeaseRemove(file) {
    if (!removeReady || path.basename(file) !== 'writer.lock') return;
    fs.writeFileSync(removeReady, 'paused\n');
    while (!fs.existsSync(removeRelease)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  },
  wait() {
    if (blockedFile && !fs.existsSync(blockedFile)) fs.writeFileSync(blockedFile, 'blocked\n');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  },
};
const release = mode === 'project'
  ? acquireProjectLease(commonDir, owner, dependencies)
  : acquireRepositoryGate(commonDir, mode, owner, dependencies);

fs.writeFileSync(readyFile, `${process.pid}\n`);
while (!fs.existsSync(releaseFile)) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}
release();
fs.writeFileSync(path.join(path.dirname(readyFile), `${path.basename(readyFile)}.released`), 'released\n');
