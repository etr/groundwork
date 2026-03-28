/**
 * PostToolUse hook for Skill tool.
 * Resolves template variables and injects them as additionalContext
 * so the model substitutes {{var_name}} patterns in skill text.
 *
 * Reads hook input from stdin (JSON with tool_input),
 * outputs hook response JSON to stdout.
 */

const path = require('path');

// Consume stdin (required for hook protocol)
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {
  try {
    const { getEffortLevel } = require('./skills-core');
    const { getSpecsDir, getProjectRoot, getProjectName, getRepoRoot } = require('./project-context');

    const effortLevel = getEffortLevel();
    const specsDir = getSpecsDir();
    const repoRoot = getRepoRoot() || process.cwd();
    const projectRoot = getProjectRoot();
    const projectName = getProjectName();

    const relativeProjectRoot = projectRoot === repoRoot
      ? '.'
      : path.relative(repoRoot, projectRoot);

    const lines = [
      `- {{effort_level}} = ${effortLevel}`,
      `- {{specs_dir}} = ${specsDir}`,
      `- {{project_root}} = ${relativeProjectRoot}`,
      `- {{project_name}} = ${projectName}`
    ].join('\n');

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Skill template variables — substitute these values wherever you see {{variable}} placeholders in the skill loaded above:\n${lines}`
      }
    }));
  } catch (e) {
    // Defensive: output empty context on any failure
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: ''
      }
    }));
  }
});
