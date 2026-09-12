#!/usr/bin/env node
/**
 * CLI entry point for persisting project selection.
 *
 * Usage:
 *   node persist-project.js <project-name>
 *
 * Reads the project path from .groundwork.yml and writes it to the
 * harness state file. The script resolves its own harness-specific scope and
 * repo root internally — no env vars required.
 *
 * On success this prints a groundwork-project-selection-v1 receipt (the
 * PostToolUse pin hook trusts exactly that shape from the tool response).
 * GROUNDWORK_SESSION_ID, when set, is carried in the receipt and pins the
 * per-chat snapshot in the same successful operation.
 */

const path = require('path');
const fs = require('fs');
const {
  persistSelection,
  persistSessionSelection,
  createSelectionReceipt,
  loadConfig,
  getRepoRoot,
  getPaneKey,
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
  // sessionId from the env as audit metadata. A stable session id also pins
  // the per-chat snapshot in the same successful operation.
  const sessionId = getSessionId();
  persistSelection(projectName, projectPath);
  if (sessionId) persistSessionSelection(sessionId, projectName, projectPath);

  console.log(JSON.stringify({
    paneKey: getPaneKey(),
    ...createSelectionReceipt({
      projectName,
      projectRoot: projectPath,
      // The receipt records the repository whose .groundwork.yml was
      // consulted — the same root validateSelectionReceipt compares against.
      repoRoot,
      sessionId,
    }),
  }));
}

try {
  main();
} catch (error) {
  console.error(`persist-project error: ${error.message}`);
  process.exit(1);
}
