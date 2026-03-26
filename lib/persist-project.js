#!/usr/bin/env node
/**
 * CLI entry point for persisting project selection.
 *
 * Usage:
 *   GROUNDWORK_SESSION_ID=<id> node persist-project.js <project-name>
 *
 * Reads the project path from .groundwork.yml and writes to the
 * session file keyed by session_id.
 */

const path = require('path');
const fs = require('fs');
const { getSessionId, persistSelection, loadConfig, getRepoRoot } = require('./project-context');

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

  const sessionId = getSessionId();
  persistSelection(projectName, projectPath, sessionId);

  console.log(JSON.stringify({ project: projectName, root: projectPath, sessionId: sessionId || 'none' }));
}

try {
  main();
} catch (error) {
  console.error(`persist-project error: ${error.message}`);
  process.exit(1);
}
