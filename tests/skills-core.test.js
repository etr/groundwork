/**
 * Tests for lib/skills-core.js
 *
 * Run with: node tests/skills-core.test.js
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Import the module under test
const {
  extractFrontmatter,
  findSkillsInDir,
  stripFrontmatter
} = require('../lib/skills-core');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');

// Test utilities
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// Tests
describe('extractFrontmatter', () => {
  test('extracts name and description from valid skill file', () => {
    const skillFile = path.join(SKILLS_DIR, 'product-design', 'SKILL.md');
    const result = extractFrontmatter(skillFile);

    assert.strictEqual(result.name, 'product-design');
    assert.ok(result.description.includes('Use when'));
  });

  test('returns empty strings for missing file', () => {
    const result = extractFrontmatter('/nonexistent/file.md');

    assert.strictEqual(result.name, '');
    assert.strictEqual(result.description, '');
  });

  test('extracts frontmatter from all skill files', () => {
    const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    for (const skillName of skillDirs) {
      const skillFile = path.join(SKILLS_DIR, skillName, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const result = extractFrontmatter(skillFile);
        assert.ok(result.name, `Skill ${skillName} should have a name`);
      }
    }
  });
});

describe('findSkillsInDir', () => {
  test('finds all skills in directory', () => {
    const skills = findSkillsInDir(SKILLS_DIR, 'plugin');

    assert.ok(skills.length > 0, 'Should find at least one skill');
    assert.ok(skills.some(s => s.name === 'product-design'), 'Should find product-design');
  });

  test('returns empty array for nonexistent directory', () => {
    const skills = findSkillsInDir('/nonexistent/dir', 'test');

    assert.deepStrictEqual(skills, []);
  });

  test('includes path and sourceType for each skill', () => {
    const skills = findSkillsInDir(SKILLS_DIR, 'plugin');

    for (const skill of skills) {
      assert.ok(skill.path, 'Each skill should have a path');
      assert.ok(skill.skillFile, 'Each skill should have a skillFile');
      assert.strictEqual(skill.sourceType, 'plugin');
    }
  });
});

describe('stripFrontmatter', () => {
  test('removes frontmatter from content', () => {
    const content = `---
name: test
description: Test skill
---

# Test Skill

Content here.`;

    const result = stripFrontmatter(content);

    assert.ok(!result.includes('---'));
    assert.ok(!result.includes('name: test'));
    assert.ok(result.includes('# Test Skill'));
    assert.ok(result.includes('Content here.'));
  });

  test('handles content without frontmatter', () => {
    const content = '# No Frontmatter\n\nJust content.';
    const result = stripFrontmatter(content);

    assert.ok(result.includes('# No Frontmatter'));
  });

  test('handles empty content', () => {
    const result = stripFrontmatter('');
    assert.strictEqual(result, '');
  });
});

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

process.exit(failed > 0 ? 1 : 0);
