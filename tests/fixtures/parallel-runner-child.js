'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [runnerPath, root, project, readyFile, releaseFile, doneFile] = process.argv.slice(2);
const { runTasks } = require(runnerPath);

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function waitFor(file) {
  while (!fs.existsSync(file)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}

try {
  runTasks(
    { command: 'task', harness: 'codex', repo: root, project, tasks: ['TASK-004'], dryRun: false },
    {
      log: () => {},
      invokePhase(input) {
        if (input.phase === 'plan') {
          fs.mkdirSync(path.join(input.projectRoot, '.groundwork-plans'), { recursive: true });
          fs.writeFileSync(path.join(input.projectRoot, '.groundwork-plans', 'TASK-004-plan.md'), '# Plan\n');
          fs.writeFileSync(readyFile, 'ready\n');
          waitFor(releaseFile);
          return 'RESULT: PLANNED | plan_file_path=.groundwork-plans/TASK-004-plan.md | identifier=TASK-004 | branch_prefix=task';
        }
        if (input.phase === 'implement') {
          const taskFile = path.join(input.projectRoot, 'specs', 'tasks.md');
          fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('Not Started', 'In Progress'));
          fs.writeFileSync(path.join(input.projectRoot, 'feature.txt'), `${project}\n`);
          return `RESULT: IMPLEMENTED | ${JSON.stringify({
            v: 1,
            token: input.receiptToken,
            task_id: 'TASK-004',
            phase: 'implement',
            action: 'commit',
            worktree_path: input.worktreePath,
            branch: input.branch,
            base_branch: 'main',
            commit: {
              subject: `TASK-004: Implement ${project} fixture`,
              body: 'Prepares the parallel runner project for validation.',
            },
          })}`;
        }
        if (input.phase === 'validate') {
          return `RESULT: VALIDATED | ${JSON.stringify({
            v: 1,
            token: input.receiptToken,
            task_id: 'TASK-004',
            phase: 'validate',
            action: 'none',
            iterations: 1,
            fixed: 0,
            unworked: 0,
          })}`;
        }
        const baseHead = git(root, 'rev-parse', 'main');
        if (git(input.worktreePath, 'merge-base', 'HEAD', baseHead) !== baseHead) {
          git(input.worktreePath, 'merge', '--no-commit', '--no-ff', baseHead);
          return `RESULT: BASE_INTEGRATED | ${JSON.stringify({
            v: 1,
            token: input.receiptToken,
            task_id: 'TASK-004',
            phase: 'finalize',
            action: 'commit',
            base_head: baseHead,
            conflicts_resolved: false,
            commit: {
              subject: `TASK-004: Integrate base for ${project}`,
              body: 'Prepares the concurrent project for publication.',
            },
          })}`;
        }
        const taskFile = path.join(input.projectRoot, 'specs', 'tasks.md');
        if (fs.readFileSync(taskFile, 'utf8').includes('In Progress')) {
          fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('In Progress', 'Complete'));
        }
        const action = git(input.worktreePath, 'status', '--porcelain') ? 'commit' : 'none';
        return `RESULT: READY_TO_MERGE | ${JSON.stringify({
          v: 1,
          token: input.receiptToken,
          task_id: 'TASK-004',
          phase: 'finalize',
          action,
          ...(action === 'commit' ? { commit: {
            subject: 'TASK-004: Mark task complete',
            body: `Records successful validation for ${project}.`,
          } } : {}),
          merge: {
            subject: `Merge TASK-004: Complete ${project} fixture`,
            body: 'Publishes the runner-verified parallel project.',
          },
        })}`;
      },
    }
  );
  fs.writeFileSync(doneFile, 'done\n');
} catch (error) {
  fs.writeFileSync(doneFile, `error: ${error.stack || error.message}\n`);
  process.exitCode = 1;
}
