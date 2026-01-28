#!/usr/bin/env node
/**
 * Load and parse instinct files using proper YAML frontmatter parsing.
 *
 * Usage: node load-instincts.js <dir1> [dir2] [dir3] [--min-confidence=0.5]
 *
 * Outputs JSON array of instincts with id, trigger, action, confidence, domain, source.
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter');

function loadInstinctsFromDir(dir, sourceLabel) {
  const instincts = [];

  if (!fs.existsSync(dir)) {
    return instincts;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const fm = extractFrontmatter(content);

      if (!fm || !fm.id) continue;

      // Extract action from content (section after "## Action")
      const actionMatch = content.match(/## Action\s*\n([\s\S]*?)(?=\n## |$)/);
      const action = actionMatch
        ? actionMatch[1].trim().split('\n').slice(0, 3).join(' ').trim()
        : '';

      instincts.push({
        id: fm.id,
        trigger: fm.trigger || 'general',
        action: action,
        confidence: parseFloat(fm.confidence) || 0.5,
        domain: fm.domain || 'general',
        source: sourceLabel
      });
    } catch (e) {
      // Skip malformed files
    }
  }

  return instincts;
}

function main() {
  const args = process.argv.slice(2);

  // Parse --min-confidence flag
  let minConfidence = 0.5;
  const minConfArg = args.find(a => a.startsWith('--min-confidence='));
  if (minConfArg) {
    minConfidence = parseFloat(minConfArg.split('=')[1]) || 0.5;
  }

  // Get directories (filter out flags)
  const dirs = args.filter(a => !a.startsWith('--'));

  if (dirs.length === 0) {
    console.log('[]');
    process.exit(0);
  }

  const allInstincts = [];

  // Load from each directory with its label
  // Expected format: dir:label or just dir (label defaults to "unknown")
  for (const arg of dirs) {
    const [dir, label] = arg.includes(':') ? arg.split(':') : [arg, 'unknown'];
    const expanded = dir.replace(/^~/, process.env.HOME || '');
    const instincts = loadInstinctsFromDir(expanded, label);
    allInstincts.push(...instincts);
  }

  // Filter by confidence
  const filtered = allInstincts.filter(i => i.confidence >= minConfidence);

  console.log(JSON.stringify(filtered));
}

main();
