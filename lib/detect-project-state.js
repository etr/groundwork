#!/usr/bin/env node
/**
 * Detect project state for SessionStart hook.
 * Outputs JSON with project context for hook consumption.
 */

const { getProjectRoot, getProjectName, detectMonorepo, restoreSelection, setProjectRoot, loadConfig } = require('./project-context');
const { detectSpecs } = require('./specs-io');

function main() {
  // Try to restore previous project selection
  const saved = restoreSelection();
  if (saved) {
    process.env.GROUNDWORK_PROJECT = saved.projectName;
    setProjectRoot(saved.projectPath);
  }

  const projectRoot = getProjectRoot();
  const projectName = getProjectName();
  const mono = detectMonorepo();
  const specs = detectSpecs(projectRoot);

  const result = {
    projectRoot,
    projectName,
    isMonorepo: mono.isMonorepo,
    projects: mono.projects || [],
    hasPRD: specs.hasPRD,
    hasArchitecture: specs.hasArchitecture,
    hasTasks: specs.hasTasks
  };

  console.log(JSON.stringify(result));
}

try {
  main();
} catch (error) {
  // Fallback: output minimal state
  console.log(JSON.stringify({
    projectRoot: process.cwd(),
    projectName: '',
    isMonorepo: false,
    projects: [],
    hasPRD: false,
    hasArchitecture: false,
    hasTasks: false
  }));
}
