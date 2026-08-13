'use strict';

const fs = require('fs');
const path = require('path');

const [runnerPath, commonDir, startFile, readyFile, releaseFile, doneFile] = process.argv.slice(2);
const { processStartIdentity } = require(runnerPath);
const gateRoot = path.join(commonDir, 'groundwork', 'repository-gate');
const writer = path.join(gateRoot, 'writer.lock');
const recovery = path.join(gateRoot, '.reclaim.lock');

while (!fs.existsSync(startFile)) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}

const record = {
  version: 1,
  pid: process.pid,
  processStart: processStartIdentity(process.pid),
  token: 'f'.repeat(48),
  project: 'recovery',
  projectPath: '.',
  taskId: 'setup',
  startedAt: Date.now(),
};
const recoveryFd = fs.openSync(recovery, 'wx', 0o600);
fs.writeFileSync(recoveryFd, `${JSON.stringify(record)}\n`, 'utf8');
fs.fsyncSync(recoveryFd);
fs.closeSync(recoveryFd);

JSON.parse(fs.readFileSync(writer, 'utf8'));
fs.writeFileSync(readyFile, 'identity-checked\n');
while (!fs.existsSync(releaseFile)) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}

fs.unlinkSync(writer);
fs.unlinkSync(recovery);
fs.writeFileSync(doneFile, 'done\n');
