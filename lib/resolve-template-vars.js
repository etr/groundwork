/**
 * PostToolUse hook for Skill tool.
 * Resolves template variables and injects them as additionalContext
 * so the model substitutes {{var_name}} patterns in skill text.
 *
 * Reads hook input from stdin (JSON with tool_input),
 * outputs hook response JSON to stdout.
 */

// Consume stdin (required for hook protocol)
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {
  try {
    const { getEffortLevel } = require('./skills-core');
    const {
      getSpecsDir, getPlansDir, getDebugDir, getResearchDir,
      getProjectRoot, getProjectName,
    } = require('./project-context');

    // Bindings follow the shared absolute-path contract: every directory is
    // absolute and invariant to the caller's working directory.
    const effortLevel = getEffortLevel();
    const specsDir = getSpecsDir();
    const plansDir = getPlansDir();
    const debugDir = getDebugDir();
    const researchDir = getResearchDir();
    const projectRoot = getProjectRoot();
    const projectName = getProjectName();

    const lines = [
      `- {{effort_level}} = ${effortLevel}`,
      `- {{specs_dir}} = ${specsDir}`,
      `- {{plans_dir}} = ${plansDir}`,
      `- {{debug_dir}} = ${debugDir}`,
      `- {{research_dir}} = ${researchDir}`,
      `- {{project_root}} = ${projectRoot}`,
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
