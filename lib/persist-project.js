#!/usr/bin/env node
/**
 * CLI entry point for persisting project selection.
 *
 * Usage:
 *   node persist-project.js <project-name>
 *
 * Reads the project path from .groundwork.yml and writes it to the
 * pane state file keyed by terminal pane identity. The script resolves
 * its own pane key + repo root internally — no env vars required.
 *
 * GROUNDWORK_SESSION_ID, if set in the environment, is recorded in the
 * payload as audit metadata only. It is never used as a lookup key.
 */

const path = require('path');
const fs = require('fs');
const {
  persistSelection,
  loadConfig,
  getRepoRoot,
  getPaneKey,
  getMainRepoRoot,
  getSessionId
} = require('./project-context');

function main() {
  const projectName = process.argv[2];
  if (!projectName) {
    console.error('Usage: persist-project.js <project-name>');
    process.exit(1);
  }

  const configResult = loadConfig();
  if (!configResult) {
    console.error('No .groundwork.yml found');
    process.exit(1);
  }

  const project = configResult.config.projects[projectName];
  if (!project) {
    console.error(`Project "${projectName}" not found in .groundwork.yml`);
    process.exit(1);
  }

  const repoRoot = getRepoRoot() || process.cwd();
  const projectPath = path.resolve(repoRoot, project.path);
  if (!fs.existsSync(projectPath)) {
    console.error(`Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  // persistSelection() resolves paneKey + repoRoot internally and records
  // sessionId from the env as audit metadata.
  persistSelection(projectName, projectPath);

  console.log(JSON.stringify({
    project: projectName,
    root: projectPath,
    paneKey: getPaneKey(),
    repoRoot: getMainRepoRoot() || repoRoot,
    sessionId: getSessionId()
  }));
}

try {
  main();
} catch (error) {
  console.error(`persist-project error: ${error.message}`);
  process.exit(1);
}
