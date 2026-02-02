#!/usr/bin/env node

/**
 * Validates the Groundwork plugin for common issues:
 * - YAML frontmatter parsing
 * - File references existence
 * - Naming conventions
 * - Consistent field usage
 * - Hook script existence
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

const issues = [];
const warnings = [];

function addIssue(file, message, severity = 'error') {
  const relativePath = path.relative(PLUGIN_ROOT, file);
  if (severity === 'warning') {
    warnings.push({ file: relativePath, message });
  } else {
    issues.push({ file: relativePath, message });
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fm = extractFrontmatter(content);

  if (!fm) {
    addIssue(filePath, 'Missing or invalid YAML frontmatter');
    return;
  }

  // Check for required fields
  if (!fm.name) {
    addIssue(filePath, 'Missing required field: name');
  }

  if (!fm.description) {
    addIssue(filePath, 'Missing required field: description');
  }

  // Check for non-standard fields in skills
  if (filePath.includes('/skills/')) {
    const allowedFields = ['name', 'description', 'requires'];
    for (const key of Object.keys(fm)) {
      if (!allowedFields.includes(key)) {
        addIssue(filePath, `Non-standard field in skill frontmatter: ${key}`, 'warning');
      }
    }

    // Check description format
    if (fm.description && !fm.description.startsWith('Use when')) {
      addIssue(filePath, 'Description should start with "Use when..." for CSO compliance', 'warning');
    }
  }

  // Check for literal \n in descriptions (common YAML mistake)
  if (fm.description && fm.description.includes('\\n')) {
    addIssue(filePath, 'Description contains literal \\n - use YAML block scalar (|) for multi-line');
  }

  // Check name format
  if (fm.name && !/^[a-z0-9-]+$/.test(fm.name)) {
    addIssue(filePath, `Name should use only lowercase letters, numbers, and hyphens: ${fm.name}`, 'warning');
  }

  // Check for allowed-tools vs allowed_tools consistency
  if (fm.allowed_tools) {
    addIssue(filePath, 'Use "allowed-tools" (hyphen) instead of "allowed_tools" (underscore)');
  }

  // Check for non-empty allowed-tools when declared (commands only)
  if (filePath.includes('/commands/')) {
    // Check if allowed-tools is declared but empty
    const rawContent = content.match(/^---\n([\s\S]*?)\n---/);
    if (rawContent) {
      const hasAllowedToolsKey = /^allowed-tools\s*:/m.test(rawContent[1]);
      const allowedToolsValue = fm['allowed-tools'];
      const isEmpty = !allowedToolsValue ||
                      (typeof allowedToolsValue === 'string' && allowedToolsValue.trim() === '') ||
                      (Array.isArray(allowedToolsValue) && allowedToolsValue.length === 0);
      if (hasAllowedToolsKey && isEmpty) {
        addIssue(filePath, 'allowed-tools is declared but has no values');
      }
    }

    // Check for missing argument-hint when command accepts arguments
    const usesArguments = content.includes('$ARGUMENTS') ||
                          /^##?\s*Arguments/m.test(content) ||
                          /^Options:/m.test(content);
    const hasArgumentHint = fm['argument-hint'];
    if (usesArguments && !hasArgumentHint) {
      addIssue(filePath, 'Command accepts arguments but missing argument-hint in frontmatter', 'warning');
    }
  }

  // Store requires field for dependency validation (done later)
  if (fm.requires) {
    let requires = [];
    if (Array.isArray(fm.requires)) {
      requires = fm.requires.map(s => String(s).trim()).filter(s => s);
    } else {
      requires = fm.requires.split(',').map(s => s.trim()).filter(s => s);
    }
    if (requires.length > 0) {
      // Store for cross-validation
      if (!global.skillRequirements) global.skillRequirements = [];
      global.skillRequirements.push({
        file: filePath,
        name: fm.name,
        requires: requires
      });
    }
  }

  // Check for @ references in content (anti-pattern)
  // Look for standalone @mention patterns, not email addresses
  // Match @ followed by word, but only when not preceded by word char (email pattern)
  // First strip out code blocks and inline code to avoid false positives on examples
  const contentWithoutCodeBlocks = content
    .replace(/```[\s\S]*?```/g, '')  // fenced code blocks
    .replace(/`[^`]+`/g, '');        // inline code
  const atRefPattern = /(?<![a-zA-Z0-9._%+-])@([a-zA-Z][\w.-]+)/g;
  let atMatch;
  while ((atMatch = atRefPattern.exec(contentWithoutCodeBlocks)) !== null) {
    const ref = atMatch[0];
    const refName = atMatch[1];
    // Skip JSDoc annotations
    if (ref === '@param' || ref === '@returns' || ref === '@type' ||
        ref === '@example' || ref === '@see' || ref === '@deprecated' ||
        ref === '@private' || ref === '@public') continue;
    // Skip npm scoped packages (e.g., @playwright/test, @types/node)
    if (ref.startsWith('@playwright') || ref.startsWith('@types') ||
        ref.startsWith('@testing-library') || ref.startsWith('@babel') ||
        ref.startsWith('@jest') || ref.startsWith('@vitest')) continue;
    // Skip local file references (e.g., @example-file.md, @helper.js)
    // These are relative files in the same directory, not skill path references
    if (/\.(md|js|ts|sh|py|json|yaml|yml|txt)$/.test(refName)) continue;
    addIssue(filePath, `@ syntax used (anti-pattern): ${ref}`, 'warning');
  }
}

function checkDirectory(dir, pattern) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // For skills, check SKILL.md in subdirectory
      if (dir.includes('skills')) {
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          checkFile(skillFile);
        }
      } else {
        checkDirectory(fullPath, pattern);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // For agents and commands, check .md files directly
      if (dir.includes('agents') || dir.includes('commands')) {
        checkFile(fullPath);
      }
    }
  }
}

function checkFileReferences() {
  // Check for broken file references in skills
  const skillsDir = path.join(PLUGIN_ROOT, 'skills');
  if (!fs.existsSync(skillsDir)) return;

  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const skillName of skillDirs) {
    const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;

    const content = fs.readFileSync(skillFile, 'utf-8');

    // Check for explicit references to supporting files in this skill directory
    // Look for patterns like "See `filename.md`" or "`filename.md` in this directory"
    // Skip generic mentions of files in error messages or paths like `specs/tasks.md`
    const explicitRefPatterns = [
      /[Ss]ee\s+`([a-z][a-z0-9-]*\.(md|js|ts|sh|dot))`/g,
      /`([a-z][a-z0-9-]*\.(md|js|ts|sh|dot))`\s+in this directory/g,
      /script\s+`([a-z][a-z0-9-]*\.(md|js|ts|sh|dot))`/g,
    ];

    for (const pattern of explicitRefPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const fileName = match[1];
        const refPath = path.join(skillsDir, skillName, fileName);
        if (!fs.existsSync(refPath)) {
          addIssue(skillFile, `Referenced file not found: ${fileName}`);
        }
      }
    }
  }
}

function checkHookPermissions() {
  const hooksDir = path.join(PLUGIN_ROOT, 'hooks');
  if (!fs.existsSync(hooksDir)) return;

  const entries = fs.readdirSync(hooksDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lowerName = entry.name.toLowerCase();
    if (!lowerName.endsWith('.js') && !lowerName.endsWith('.sh') && !lowerName.endsWith('.py')) continue;

    const fullPath = path.join(hooksDir, entry.name);
    const stats = fs.statSync(fullPath);
    const mode = stats.mode & 0o777;

    if ((mode & 0o111) === 0) {
      addIssue(fullPath, 'Script missing execute permission', 'warning');
    }
  }
}

function checkSkillDependencies() {
  // Get all skill names
  const skillsDir = path.join(PLUGIN_ROOT, 'skills');
  if (!fs.existsSync(skillsDir)) return;

  const skillNames = new Set();
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const skillName of skillDirs) {
    const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      // Extract name from frontmatter
      const content = fs.readFileSync(skillFile, 'utf8');
      const fm = extractFrontmatter(content);
      skillNames.add(fm && fm.name ? fm.name : skillName);
    }
  }

  // Validate requirements
  if (global.skillRequirements) {
    for (const { file, name, requires } of global.skillRequirements) {
      for (const requiredSkill of requires) {
        if (!skillNames.has(requiredSkill)) {
          addIssue(file, `Required skill not found: "${requiredSkill}"`);
        }
      }
    }
  }
}

function checkHookScriptExistence() {
  const hooksJsonPath = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) return;

  let hooksConfig;
  try {
    const content = fs.readFileSync(hooksJsonPath, 'utf8');
    hooksConfig = JSON.parse(content);
  } catch (e) {
    addIssue(hooksJsonPath, `Invalid JSON: ${e.message}`);
    return;
  }

  const hooks = hooksConfig.hooks || {};

  for (const [eventName, hookEntries] of Object.entries(hooks)) {
    for (const entry of hookEntries) {
      for (const hook of entry.hooks || []) {
        if (hook.type === 'command' && hook.command) {
          // Extract script path from command
          // Commands look like: "bash ${CLAUDE_PLUGIN_ROOT}/path/to/script.sh"
          // or: "python3 ${CLAUDE_PLUGIN_ROOT}/path/to/script.py"
          // or: "node ${CLAUDE_PLUGIN_ROOT}/path/to/script.js"
          // or: "${CLAUDE_PLUGIN_ROOT}/path/to/script.sh"
          const match = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s]+)/);
          if (match) {
            const relativePath = match[1];
            const fullPath = path.join(PLUGIN_ROOT, relativePath);
            if (!fs.existsSync(fullPath)) {
              addIssue(hooksJsonPath, `Hook script not found: ${relativePath} (${eventName} event)`);
            }
          }
        }
      }
    }
  }
}

function checkHookMatchers() {
  const hooksJsonPath = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) return;

  let hooksConfig;
  try {
    const content = fs.readFileSync(hooksJsonPath, 'utf8');
    hooksConfig = JSON.parse(content);
  } catch {
    return; // JSON errors already reported by checkHookScriptExistence
  }

  const hooks = hooksConfig.hooks || {};

  // Valid matchers for different hook events
  const validSessionMatchers = ['startup', 'resume', 'clear', 'compact'];
  const validToolMatchers = ['Edit', 'Write', 'MultiEdit', 'Read', 'Bash', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch', '*'];

  for (const [eventName, hookEntries] of Object.entries(hooks)) {
    for (const entry of hookEntries) {
      const matcher = entry.matcher;
      if (!matcher) continue;

      // Parse matcher (could be "startup|resume" or "Edit|Write" or "*")
      const matcherParts = matcher.split('|').map(s => s.trim());

      for (const part of matcherParts) {
        if (part === '*') continue; // Wildcard always valid

        if (eventName === 'SessionStart') {
          if (!validSessionMatchers.includes(part)) {
            addIssue(hooksJsonPath, `Unknown SessionStart matcher "${part}" - valid: ${validSessionMatchers.join(', ')}`, 'warning');
          }
        } else if (['PreToolUse', 'PostToolUse'].includes(eventName)) {
          if (!validToolMatchers.includes(part)) {
            addIssue(hooksJsonPath, `Unknown ${eventName} tool matcher "${part}" - valid: ${validToolMatchers.join(', ')}`, 'warning');
          }
        }
        // Note: SubagentStop and PreCompact events typically use wildcard matchers ("*")
        // and are intentionally not validated here since they don't have a fixed set of
        // valid matcher values like SessionStart or tool-use events do.
      }
    }
  }
}

// Run validation
console.log('Validating Groundwork plugin...\n');

checkDirectory(path.join(PLUGIN_ROOT, 'skills'), 'SKILL.md');
checkDirectory(path.join(PLUGIN_ROOT, 'agents'), '*.md');
checkDirectory(path.join(PLUGIN_ROOT, 'commands'), '*.md');
checkFileReferences();
checkHookPermissions();
checkHookScriptExistence();
checkHookMatchers();
checkSkillDependencies();

// Output results
if (issues.length === 0 && warnings.length === 0) {
  console.log('All checks passed!\n');
  process.exit(0);
}

if (issues.length > 0) {
  console.log(`Found ${issues.length} error(s):\n`);
  for (const issue of issues) {
    console.log(`  [ERROR] ${issue.file}`);
    console.log(`          ${issue.message}\n`);
  }
}

if (warnings.length > 0) {
  console.log(`Found ${warnings.length} warning(s):\n`);
  for (const warning of warnings) {
    console.log(`  [WARN]  ${warning.file}`);
    console.log(`          ${warning.message}\n`);
  }
}

console.log(`\nSummary: ${issues.length} error(s), ${warnings.length} warning(s)`);
process.exit(issues.length > 0 ? 1 : 0);
