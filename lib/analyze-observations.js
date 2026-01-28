#!/usr/bin/env node
/**
 * Observation Analyzer for Continuous Learning
 *
 * Analyzes observations.jsonl to detect patterns and create/update instincts.
 * Implements the logic described in the observer agent as executable code.
 *
 * Usage:
 *   node analyze-observations.js [--verbose] [--dry-run]
 *
 * Options:
 *   --verbose   Show detailed analysis output
 *   --dry-run   Analyze but don't write instinct files
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOMUNCULUS_DIR = path.join(os.homedir(), '.claude', 'homunculus');
const OBSERVATIONS_FILE = path.join(HOMUNCULUS_DIR, 'observations.jsonl');
const INSTINCTS_DIR = path.join(HOMUNCULUS_DIR, 'instincts', 'personal');
const PROCESSED_MARKER = path.join(HOMUNCULUS_DIR, '.last-analysis');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const DRY_RUN = args.includes('--dry-run');

function log(msg) {
  if (VERBOSE) console.error(`[analyze] ${msg}`);
}

function loadObservations() {
  if (!fs.existsSync(OBSERVATIONS_FILE)) {
    return [];
  }

  const content = fs.readFileSync(OBSERVATIONS_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(l => l);
  const observations = [];

  for (const line of lines) {
    try {
      observations.push(JSON.parse(line));
    } catch (e) {
      log(`Skipping invalid JSON line: ${e.message}`);
    }
  }

  return observations;
}

function loadExistingInstincts() {
  const instincts = new Map();

  if (!fs.existsSync(INSTINCTS_DIR)) {
    return instincts;
  }

  const files = fs.readdirSync(INSTINCTS_DIR).filter(f => f.endsWith('.md'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(INSTINCTS_DIR, file), 'utf8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fm = {};
        for (const line of fmMatch[1].split('\n')) {
          const [key, ...rest] = line.split(':');
          if (key && rest.length) {
            fm[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
          }
        }
        if (fm.id) {
          instincts.set(fm.id, { ...fm, file, content });
        }
      }
    } catch (e) {
      log(`Error reading instinct ${file}: ${e.message}`);
    }
  }

  return instincts;
}

/**
 * Detect tool workflow patterns (e.g., Grep -> Read -> Edit)
 */
function detectWorkflowPatterns(observations) {
  const patterns = new Map();
  const windowSize = 5;

  // Group by session
  const sessions = new Map();
  for (const obs of observations) {
    const sid = obs.session || 'unknown';
    if (!sessions.has(sid)) sessions.set(sid, []);
    sessions.get(sid).push(obs);
  }

  for (const [sessionId, sessionObs] of sessions) {
    // Look for tool sequences
    const tools = sessionObs
      .filter(o => o.event === 'tool_start' || o.event === 'tool_complete')
      .map(o => o.tool);

    // Find repeated sequences
    for (let i = 0; i < tools.length - 2; i++) {
      const seq = tools.slice(i, i + 3).join(' -> ');
      if (!patterns.has(seq)) {
        patterns.set(seq, { count: 0, sessions: new Set() });
      }
      patterns.get(seq).count++;
      patterns.get(seq).sessions.add(sessionId);
    }
  }

  // Filter to patterns seen 3+ times across 2+ sessions
  const significant = [];
  for (const [seq, data] of patterns) {
    if (data.count >= 3 && data.sessions.size >= 1) {
      significant.push({
        type: 'workflow',
        pattern: seq,
        count: data.count,
        sessions: data.sessions.size
      });
    }
  }

  return significant;
}

/**
 * Detect tool preferences (consistent use of certain tools)
 */
function detectToolPreferences(observations) {
  const toolUsage = new Map();

  for (const obs of observations) {
    if (obs.event === 'tool_start' && obs.tool) {
      toolUsage.set(obs.tool, (toolUsage.get(obs.tool) || 0) + 1);
    }
  }

  const total = Array.from(toolUsage.values()).reduce((a, b) => a + b, 0);
  const preferences = [];

  // Tools used more than 20% of the time are preferences
  for (const [tool, count] of toolUsage) {
    const ratio = count / total;
    if (ratio > 0.2 && count >= 5) {
      preferences.push({
        type: 'tool-preference',
        tool,
        count,
        ratio: Math.round(ratio * 100)
      });
    }
  }

  return preferences;
}

/**
 * Detect error resolution patterns
 */
function detectErrorPatterns(observations) {
  const patterns = [];

  for (let i = 0; i < observations.length - 1; i++) {
    const obs = observations[i];
    if (obs.event === 'tool_complete' && obs.output) {
      const output = String(obs.output).toLowerCase();
      const hasError = output.includes('error') ||
                       output.includes('failed') ||
                       output.includes('exception');

      if (hasError) {
        // Look at next few observations for resolution
        const next = observations.slice(i + 1, i + 5);
        const resolution = next.find(n =>
          n.event === 'tool_complete' &&
          n.output &&
          !String(n.output).toLowerCase().includes('error')
        );

        if (resolution) {
          patterns.push({
            type: 'error-resolution',
            errorTool: obs.tool,
            resolutionTool: resolution.tool,
            count: 1
          });
        }
      }
    }
  }

  // Aggregate similar patterns
  const aggregated = new Map();
  for (const p of patterns) {
    const key = `${p.errorTool}->${p.resolutionTool}`;
    if (!aggregated.has(key)) {
      aggregated.set(key, { ...p, count: 0 });
    }
    aggregated.get(key).count++;
  }

  return Array.from(aggregated.values()).filter(p => p.count >= 2);
}

/**
 * Calculate confidence based on observation count
 */
function calculateConfidence(count) {
  if (count <= 2) return 0.3;
  if (count <= 5) return 0.5;
  if (count <= 10) return 0.7;
  return 0.85;
}

/**
 * Generate instinct ID from pattern
 */
function generateInstinctId(pattern) {
  return pattern.type + '-' +
    (pattern.pattern || pattern.tool || `${pattern.errorTool}-${pattern.resolutionTool}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
}

/**
 * Create instinct markdown content
 */
function createInstinctContent(pattern, existingConfidence = null) {
  const id = generateInstinctId(pattern);
  const confidence = existingConfidence !== null
    ? Math.min(0.95, existingConfidence + 0.05)
    : calculateConfidence(pattern.count);
  const date = new Date().toISOString().split('T')[0];

  let trigger, action, domain;

  switch (pattern.type) {
    case 'workflow':
      trigger = 'when performing multi-step code operations';
      action = `Follow the workflow pattern: ${pattern.pattern}`;
      domain = 'workflow';
      break;
    case 'tool-preference':
      trigger = `when needing to use development tools`;
      action = `Prefer using ${pattern.tool} (used ${pattern.ratio}% of the time)`;
      domain = 'tool-usage';
      break;
    case 'error-resolution':
      trigger = `when ${pattern.errorTool} produces an error`;
      action = `Try using ${pattern.resolutionTool} to resolve the issue`;
      domain = 'error-handling';
      break;
    default:
      trigger = 'general development';
      action = JSON.stringify(pattern);
      domain = 'general';
  }

  return `---
id: ${id}
trigger: "${trigger}"
confidence: ${confidence.toFixed(2)}
domain: "${domain}"
source: "session-observation"
last_updated: "${date}"
observation_count: ${pattern.count}
---

# ${id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

## Action
${action}

## Evidence
- Observed ${pattern.count} times
- Pattern type: ${pattern.type}
- Last analyzed: ${date}
`;
}

/**
 * Write or update instinct file
 */
function writeInstinct(pattern, existingInstincts) {
  const id = generateInstinctId(pattern);
  const existing = existingInstincts.get(id);

  let content;
  if (existing) {
    // Update existing - increase confidence
    const newConfidence = Math.min(0.95, parseFloat(existing.confidence || 0.5) + 0.05);
    content = createInstinctContent(pattern, newConfidence);
    log(`Updating instinct: ${id} (confidence: ${newConfidence.toFixed(2)})`);
  } else {
    content = createInstinctContent(pattern);
    log(`Creating new instinct: ${id}`);
  }

  if (!DRY_RUN) {
    fs.mkdirSync(INSTINCTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(INSTINCTS_DIR, `${id}.md`), content);
  }

  return id;
}

/**
 * Main analysis function
 */
function analyze() {
  log('Starting observation analysis...');

  const observations = loadObservations();
  if (observations.length === 0) {
    log('No observations to analyze');
    return { analyzed: 0, created: 0, updated: 0 };
  }

  log(`Loaded ${observations.length} observations`);

  const existingInstincts = loadExistingInstincts();
  log(`Found ${existingInstincts.size} existing instincts`);

  // Detect patterns
  const workflows = detectWorkflowPatterns(observations);
  const preferences = detectToolPreferences(observations);
  const errorPatterns = detectErrorPatterns(observations);

  log(`Detected: ${workflows.length} workflows, ${preferences.length} preferences, ${errorPatterns.length} error patterns`);

  const allPatterns = [...workflows, ...preferences, ...errorPatterns];

  let created = 0, updated = 0;

  for (const pattern of allPatterns) {
    const id = generateInstinctId(pattern);
    const isUpdate = existingInstincts.has(id);
    writeInstinct(pattern, existingInstincts);
    if (isUpdate) updated++;
    else created++;
  }

  // Update marker file
  if (!DRY_RUN) {
    fs.writeFileSync(PROCESSED_MARKER, new Date().toISOString());
  }

  const result = {
    analyzed: observations.length,
    patterns: allPatterns.length,
    created,
    updated
  };

  // Output result as JSON for programmatic use
  console.log(JSON.stringify(result));

  return result;
}

// Run analysis
try {
  analyze();
} catch (err) {
  console.error(`[analyze] Error: ${err.message}`);
  process.exit(1);
}
