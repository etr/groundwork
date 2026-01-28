#!/usr/bin/env node
/**
 * Evolve - Cluster related instincts into skills, commands, or agents
 *
 * Usage:
 *   node evolve.js [--execute] [--dry-run] [--domain <name>] [--threshold <n>] [--json]
 *
 * Options:
 *   --execute     Actually create the evolved structures (default is preview)
 *   --dry-run     Preview without creating (same as default)
 *   --domain      Only evolve instincts in specified domain
 *   --threshold   Minimum instincts required to form cluster (default: 3)
 *   --json        Output as JSON instead of human-readable
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractFrontmatter } = require('./frontmatter');

const HOMUNCULUS_DIR = path.join(os.homedir(), '.claude', 'homunculus');
const INSTINCTS_DIR = path.join(HOMUNCULUS_DIR, 'instincts');
const EVOLVED_DIR = path.join(HOMUNCULUS_DIR, 'evolved');

// Parse arguments
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const DRY_RUN = args.includes('--dry-run') || !EXECUTE;
const JSON_OUTPUT = args.includes('--json');
const domainIdx = args.indexOf('--domain');
const DOMAIN_FILTER = domainIdx !== -1 ? args[domainIdx + 1] : null;
const thresholdIdx = args.indexOf('--threshold');
const THRESHOLD = thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1], 10) : 3;

function log(msg) {
  if (!JSON_OUTPUT) console.log(msg);
}

/**
 * Load all instincts from personal and inherited directories
 */
function loadInstincts() {
  const instincts = [];

  for (const subdir of ['personal', 'inherited']) {
    const dir = path.join(INSTINCTS_DIR, subdir);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const fm = extractFrontmatter(content);

        if (!fm || !fm.id) continue;

        // Extract action from content
        const actionMatch = content.match(/## Action\s*\n([\s\S]*?)(?=\n## |$)/);
        const action = actionMatch ? actionMatch[1].trim() : '';

        instincts.push({
          id: fm.id,
          trigger: fm.trigger || '',
          action: action,
          confidence: parseFloat(fm.confidence) || 0.5,
          domain: fm.domain || 'general',
          source: subdir,
          observationCount: parseInt(fm.observation_count, 10) || 1,
          file: filePath
        });
      } catch (e) {
        // Skip malformed files
      }
    }
  }

  return instincts;
}

/**
 * Calculate similarity between two instincts based on domain, trigger, and action keywords
 */
function calculateSimilarity(a, b) {
  let score = 0;

  // Same domain is a strong signal
  if (a.domain === b.domain) score += 0.4;

  // Trigger word overlap
  const triggerWordsA = new Set((a.trigger || '').toLowerCase().split(/\s+/));
  const triggerWordsB = new Set((b.trigger || '').toLowerCase().split(/\s+/));
  const triggerOverlap = [...triggerWordsA].filter(w => triggerWordsB.has(w) && w.length > 3).length;
  score += Math.min(0.3, triggerOverlap * 0.1);

  // Action word overlap
  const actionWordsA = new Set((a.action || '').toLowerCase().split(/\s+/));
  const actionWordsB = new Set((b.action || '').toLowerCase().split(/\s+/));
  const actionOverlap = [...actionWordsA].filter(w => actionWordsB.has(w) && w.length > 3).length;
  score += Math.min(0.3, actionOverlap * 0.05);

  return score;
}

/**
 * Cluster instincts using simple agglomerative clustering
 */
function clusterInstincts(instincts, threshold) {
  if (instincts.length === 0) return [];

  // Start with each instinct in its own cluster
  let clusters = instincts.map(i => [i]);

  // Iteratively merge most similar clusters
  const SIMILARITY_THRESHOLD = 0.4;

  while (clusters.length > 1) {
    let bestPair = null;
    let bestSimilarity = 0;

    // Find most similar pair of clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Average linkage: mean similarity between all pairs
        let totalSim = 0;
        let pairs = 0;
        for (const a of clusters[i]) {
          for (const b of clusters[j]) {
            totalSim += calculateSimilarity(a, b);
            pairs++;
          }
        }
        const avgSim = totalSim / pairs;

        if (avgSim > bestSimilarity) {
          bestSimilarity = avgSim;
          bestPair = [i, j];
        }
      }
    }

    // Stop if best similarity is below threshold
    if (bestSimilarity < SIMILARITY_THRESHOLD) break;

    // Merge best pair
    const [i, j] = bestPair;
    clusters[i] = [...clusters[i], ...clusters[j]];
    clusters.splice(j, 1);
  }

  // Filter to clusters meeting minimum size
  return clusters.filter(c => c.length >= threshold);
}

/**
 * Determine evolution type for a cluster
 */
function determineEvolutionType(cluster) {
  const triggers = cluster.map(i => (i.trigger || '').toLowerCase()).join(' ');
  const actions = cluster.map(i => (i.action || '').toLowerCase()).join(' ');
  const combined = triggers + ' ' + actions;

  // Command indicators: user-invoked actions
  const commandIndicators = ['when user asks', 'when creating', 'when starting', 'run', 'execute', 'generate'];
  const commandScore = commandIndicators.filter(ind => combined.includes(ind)).length;

  // Agent indicators: complex multi-step processes
  const agentIndicators = ['debug', 'investigate', 'analyze', 'research', 'refactor', 'review', 'multi-step'];
  const agentScore = agentIndicators.filter(ind => combined.includes(ind)).length;

  // Skill indicators: automatic behaviors
  const skillIndicators = ['when writing', 'when editing', 'pattern', 'style', 'prefer', 'avoid', 'always', 'never'];
  const skillScore = skillIndicators.filter(ind => combined.includes(ind)).length;

  if (agentScore > commandScore && agentScore > skillScore) return 'agent';
  if (commandScore > skillScore) return 'command';
  return 'skill';
}

/**
 * Generate a name from cluster content
 */
function generateName(cluster) {
  // Use most common domain or first instinct's domain
  const domains = cluster.map(i => i.domain);
  const domainCounts = {};
  for (const d of domains) {
    domainCounts[d] = (domainCounts[d] || 0) + 1;
  }
  const primaryDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Extract key action words
  const allActions = cluster.map(i => i.action).join(' ').toLowerCase();
  const words = allActions.split(/\s+/).filter(w => w.length > 4);
  const wordCounts = {};
  for (const w of words) {
    if (!['when', 'then', 'should', 'always', 'never', 'using', 'with'].includes(w)) {
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }
  }
  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([w]) => w);

  const nameParts = [primaryDomain, ...topWords].filter(Boolean);
  return nameParts.join('-').replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'evolved-' + Date.now();
}

/**
 * Calculate cluster confidence based on member instincts
 */
function calculateClusterConfidence(cluster) {
  const totalObs = cluster.reduce((sum, i) => sum + i.observationCount, 0);
  const avgConfidence = cluster.reduce((sum, i) => sum + i.confidence, 0) / cluster.length;

  // Boost confidence based on cluster size and total observations
  const sizeBoost = Math.min(0.1, cluster.length * 0.02);
  const obsBoost = Math.min(0.1, totalObs * 0.005);

  return Math.min(0.95, avgConfidence + sizeBoost + obsBoost);
}

/**
 * Generate file content for evolved structure
 */
function generateContent(cluster, type, name) {
  const instinctIds = cluster.map(i => i.id);
  const confidence = calculateClusterConfidence(cluster);
  const totalObs = cluster.reduce((sum, i) => sum + i.observationCount, 0);
  const domain = cluster[0].domain;

  // Combine actions into description
  const actions = cluster.map(i => `- ${i.action}`).join('\n');

  const date = new Date().toISOString().split('T')[0];
  const titleCase = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  if (type === 'command') {
    return `---
name: ${name}
description: ${cluster[0].trigger || 'Evolved from learned patterns'}
argument-hint: "[options]"
allowed-tools: ["Bash", "Read", "Write", "Glob", "Grep"]
evolved_from:
${instinctIds.map(id => `  - ${id}`).join('\n')}
evolved_date: "${date}"
confidence: ${confidence.toFixed(2)}
---

# ${titleCase} Command

This command was evolved from ${cluster.length} related instincts based on ${totalObs} observations.

## What This Does

${actions}

## Usage

\`/${name}\`

## When to Use

${cluster.map(i => `- ${i.trigger}`).filter(Boolean).join('\n') || '- When performing related tasks'}

## Implementation Notes

Review and customize this evolved command before activating.
`;
  }

  if (type === 'agent') {
    return `---
name: ${name}
description: |
  Evolved agent for ${domain} tasks. ${cluster[0].trigger || 'Handles complex multi-step workflows.'}
model: inherit
evolved_from:
${instinctIds.map(id => `  - ${id}`).join('\n')}
evolved_date: "${date}"
confidence: ${confidence.toFixed(2)}
---

You are a specialized agent evolved from ${cluster.length} learned patterns.

## Core Behaviors

${actions}

## When You're Invoked

${cluster.map(i => `- ${i.trigger}`).filter(Boolean).join('\n') || '- For complex multi-step tasks in this domain'}

## How to Work

1. Analyze the task against the learned patterns above
2. Apply each relevant behavior systematically
3. Verify your work matches the expected patterns
4. Report what you did and why

## Notes

This agent was evolved from observations. Review and refine before regular use.
`;
  }

  // Default: skill
  return `---
name: ${name}
description: Use when ${cluster[0].trigger || 'performing ' + domain + ' tasks'} - applies learned patterns automatically
evolved_from:
${instinctIds.map(id => `  - ${id}`).join('\n')}
evolved_date: "${date}"
confidence: ${confidence.toFixed(2)}
---

# ${titleCase}

This skill was evolved from ${cluster.length} related instincts.

## Learned Patterns

${actions}

## When This Applies

${cluster.map(i => `- ${i.trigger}`).filter(Boolean).join('\n') || '- When working in the ' + domain + ' domain'}

## How to Apply

Follow these patterns automatically when the trigger conditions match.

## Evidence

- Based on ${totalObs} observations
- Confidence: ${(confidence * 100).toFixed(0)}%
- Domain: ${domain}
`;
}

/**
 * Write evolved structure to file
 */
function writeEvolved(cluster, type, name) {
  const content = generateContent(cluster, type, name);

  let targetDir, fileName;
  if (type === 'skill') {
    targetDir = path.join(EVOLVED_DIR, 'skills', name);
    fileName = 'SKILL.md';
  } else if (type === 'command') {
    targetDir = path.join(EVOLVED_DIR, 'commands');
    fileName = `${name}.md`;
  } else {
    targetDir = path.join(EVOLVED_DIR, 'agents');
    fileName = `${name}.md`;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, fileName), content);

  return path.join(targetDir, fileName);
}

/**
 * Main evolution logic
 */
function evolve() {
  let instincts = loadInstincts();

  if (instincts.length === 0) {
    log('No instincts found to evolve.');
    if (JSON_OUTPUT) console.log(JSON.stringify({ clusters: [], created: [] }));
    return;
  }

  // Filter by domain if specified
  if (DOMAIN_FILTER) {
    instincts = instincts.filter(i => i.domain === DOMAIN_FILTER);
    if (instincts.length === 0) {
      log(`No instincts found in domain: ${DOMAIN_FILTER}`);
      if (JSON_OUTPUT) console.log(JSON.stringify({ clusters: [], created: [] }));
      return;
    }
  }

  log(`Analyzing ${instincts.length} instincts...\n`);

  // Cluster instincts
  const clusters = clusterInstincts(instincts, THRESHOLD);

  if (clusters.length === 0) {
    log(`No clusters found meeting threshold of ${THRESHOLD} instincts.`);
    log('Try lowering the threshold with --threshold 2');
    if (JSON_OUTPUT) console.log(JSON.stringify({ clusters: [], created: [] }));
    return;
  }

  const results = [];

  log(`Found ${clusters.length} cluster(s) ready for evolution:\n`);

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const type = determineEvolutionType(cluster);
    const name = generateName(cluster);
    const confidence = calculateClusterConfidence(cluster);
    const totalObs = cluster.reduce((sum, inst) => sum + inst.observationCount, 0);

    log(`## Cluster ${i + 1}: ${name}`);
    log(`Instincts: ${cluster.map(inst => inst.id).join(', ')}`);
    log(`Type: ${type.charAt(0).toUpperCase() + type.slice(1)}`);
    log(`Confidence: ${(confidence * 100).toFixed(0)}% (based on ${totalObs} observations)`);

    let targetPath;
    if (type === 'skill') {
      targetPath = path.join(EVOLVED_DIR, 'skills', name, 'SKILL.md');
    } else {
      targetPath = path.join(EVOLVED_DIR, `${type}s`, `${name}.md`);
    }

    log(`Would create: ${targetPath}`);
    log('');

    const result = {
      name,
      type,
      instincts: cluster.map(inst => inst.id),
      confidence,
      observations: totalObs,
      path: targetPath
    };

    if (EXECUTE && !DRY_RUN) {
      const createdPath = writeEvolved(cluster, type, name);
      result.created = true;
      result.path = createdPath;
      log(`Created: ${createdPath}\n`);
    }

    results.push(result);
  }

  if (!EXECUTE || DRY_RUN) {
    log('---');
    log('Run with --execute to create these files.');
  }

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      clusters: results,
      created: results.filter(r => r.created).map(r => r.path)
    }));
  }
}

// Run
try {
  evolve();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
