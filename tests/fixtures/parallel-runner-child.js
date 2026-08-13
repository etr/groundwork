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
          git(input.worktreePath, 'add', '.');
          git(input.worktreePath, 'commit', '-m', `Implement ${project}`);
          return `RESULT: IMPLEMENTED | worktree_path=${input.worktreePath} | branch=${input.branch} | base_branch=main`;
        }
        if (input.phase === 'validate') {
          const base = git(root, 'rev-parse', 'main');
          if (git(input.worktreePath, 'merge-base', 'HEAD', base) !== base) {
            git(input.worktreePath, 'merge', 'main', '-m', `Integrate main for ${project}`);
          }
          return `RESULT: VALIDATED | iterations=1 | fixed=0 | unworked=0 | validated_head=${git(input.worktreePath, 'rev-parse', 'HEAD')}`;
        }
        const taskFile = path.join(input.projectRoot, 'specs', 'tasks.md');
        if (fs.readFileSync(taskFile, 'utf8').includes('In Progress')) {
          fs.writeFileSync(taskFile, fs.readFileSync(taskFile, 'utf8').replace('In Progress', 'Complete'));
          git(input.worktreePath, 'add', '.');
          git(input.worktreePath, 'commit', '-m', `Finalize ${project}`);
        }
        return `RESULT: READY_TO_MERGE | task_id=TASK-004 | task_head=${git(input.worktreePath, 'rev-parse', 'HEAD')} | base_head=${git(root, 'rev-parse', 'main')} | merge_message=Merge ${project}`;
      },
    }
  );
  fs.writeFileSync(doneFile, 'done\n');
} catch (error) {
  fs.writeFileSync(doneFile, `error: ${error.stack || error.message}\n`);
  process.exitCode = 1;
}
