'use strict';

const fs = require('fs');
const path = require('path');

const [runnerPath, commonDir, mode, project, taskId, readyFile, releaseFile, blockedFile] = process.argv.slice(2);
const { acquireProjectLease, acquireRepositoryGate } = require(runnerPath);

const owner = { project, projectPath: project === '.' ? '.' : `apps/${project}`, taskId };
const dependencies = {
  log: () => {},
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
