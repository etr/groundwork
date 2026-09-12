#!/usr/bin/env node
/**
 * Detect project state for SessionStart hook.
 * Outputs JSON with project context for hook consumption.
 */

const { getProjectRoot, getProjectName, detectMonorepo, restoreSelection, setProjectRoot, getSessionId, persistSessionSelection, loadConfig } = require('./project-context');
const { detectSpecs } = require('./specs-io');

function main() {
  // Try to restore previous project selection (session-aware)
  const sessionId = getSessionId();
  const saved = restoreSelection(sessionId);
  if (saved) {
    process.env.GROUNDWORK_PROJECT = saved.projectName;
    setProjectRoot(saved.projectPath);
    // Pin this chat's restored selection as a per-chat snapshot so a later
    // clear/compaction in the same session recovers it instead of whatever
    // workspace default another chat has written since (freshest write wins).
    if (sessionId) {
      try {
        persistSessionSelection(sessionId, saved.projectName, saved.projectPath);
      } catch {
        // Pinning is best-effort; restore already succeeded
      }
    }
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
    hasTasks: specs.hasTasks,
    selectionSource: saved ? saved.source : ''
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
