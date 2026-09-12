'use strict';

/**
 * Process worker for multi-process validation-session tests.
 *
 * Deterministic file-based IPC barrier (no sleeps used as synchronization):
 *   1. the worker writes {"ready":true} to WORKER_READY,
 *   2. the parent creates the WORKER_RELEASE marker to release it,
 *   3. the worker performs exactly one operation and writes its JSON outcome
 *      to WORKER_RESULT, then exits.
 *
 * File markers keep the whole protocol synchronizable from a synchronous
 * test parent: the parent blocks in Atomics.wait slices while independent
 * worker processes make progress.
 *
 * The operation is passed as JSON in the WORKER_OPERATION env var.
 */

const fs = require('fs');

const HELPER = require.resolve('../../lib/validation-session.js');

function perform(helper, operation) {
  switch (operation.op) {
    case 'open':
      return helper.openValidationSession({
        repoRoot: operation.repoRoot,
        projectRoot: operation.projectRoot,
        worktreePath: operation.worktreePath,
        taskId: operation.taskId,
        branch: operation.branch,
        baseHead: operation.baseHead,
        protocolVersion: 1,
        runnerMode: operation.runnerMode,
        resumeRun: operation.resumeRun,
        ownerToken: operation.ownerToken,
      });
    case 'checkpoint':
      return helper.checkpointValidationSession(operation.runDir, {
        expectedStage: operation.expectedStage,
        nextStage: operation.nextStage,
        iteration: operation.iteration,
        coordinatorFile: operation.coordinatorFile,
        ownerToken: operation.ownerToken,
        expectedRevision: operation.expectedRevision,
      });
    case 'heartbeat-register':
      return helper.heartbeatRegister(operation.runDir, operation.ownerToken);
    case 'heartbeat-beat':
      return helper.heartbeatBeat(operation.runDir, operation.ownerToken);
    default:
      throw new Error(`unknown worker operation: ${operation.op}`);
  }
}

function waitForFile(file) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    if (fs.existsSync(file)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  throw new Error(`worker timed out waiting for ${file}`);
}

function main() {
  const helper = require(HELPER);
  const { WORKER_OPERATION, WORKER_READY, WORKER_RELEASE, WORKER_RESULT } = process.env;
  const operation = JSON.parse(WORKER_OPERATION || '{}');
  fs.writeFileSync(WORKER_READY, `${JSON.stringify({ ready: true, pid: process.pid })}\n`);
  waitForFile(WORKER_RELEASE);
  let outcome;
  try {
    outcome = { ok: true, result: perform(helper, operation) };
  } catch (error) {
    outcome = { ok: false, error: error.message };
  }
  fs.writeFileSync(WORKER_RESULT, `${JSON.stringify(outcome)}\n`);
}

main();
