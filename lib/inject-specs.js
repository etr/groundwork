#!/usr/bin/env node
/**
 * Spec Content Injection for SessionStart hook
 *
 * Extracts structured summaries from PRD and architecture files for context injection.
 * Provides a two-layer context loading approach:
 * - Layer 1: Static summary (feature index, NFRs, decisions with file references)
 * - Layer 2: Instructions for on-demand loading of full details
 */

const path = require('path');
const fs = require('fs');

// Import specs-io utilities
const specsIo = require('./specs-io');

// Size limit for injected content (~3KB)
const MAX_CONTENT_SIZE = 3000;

// Debug mode - enabled via GROUNDWORK_DEBUG environment variable
const DEBUG = process.env.GROUNDWORK_DEBUG === '1' || process.env.GROUNDWORK_DEBUG === 'true';

function debug(message, data = null) {
  if (!DEBUG) return;
  if (data !== null) {
    console.error(`[inject-specs] ${message}:`, JSON.stringify(data, null, 2));
  } else {
    console.error(`[inject-specs] ${message}`);
  }
}

/**
 * Extract feature definitions from PRD content.
 * Looks for headers like: # FEAT-XXX: Name, ### CODE: Name, etc.
 *
 * @param {string} content - PRD content
 * @param {string[]} files - Source files for the content
 * @param {string} basePath - Base path for relative file references
 * @returns {Array<{code: string, name: string, file: string}>}
 */
function extractFeatures(content, files, basePath) {
  const features = [];
  if (!content) return features;

  // Pattern for feature headers: # FEAT-XXX: Name or ### Feature Name (FEAT-XXX)
  // Accepts 1-3 # symbols to catch top-level headers in split files
  const featurePattern = /^#{1,3}\s+(?:FEAT[-_]?(\w+)[:.\s]+(.+?)|(.+?)\s*\(FEAT[-_]?(\w+)\))\s*$/gm;

  let match;
  while ((match = featurePattern.exec(content)) !== null) {
    const code = match[1] || match[4];
    const name = (match[2] || match[3]).trim();

    // Find which file contains this feature
    let sourceFile = files[0] || 'specs/product_specs.md';
    if (files.length > 1) {
      for (const file of files) {
        try {
          const fileContent = fs.readFileSync(file, 'utf8');
          if (fileContent.includes(match[0])) {
            sourceFile = file;
            break;
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    features.push({
      code: code.toUpperCase(),
      name,
      file: path.relative(basePath, sourceFile)
    });
  }

  // Also check for simpler feature patterns: # CODE: Description (accepts 1-3 # symbols)
  const simplePattern = /^#{1,3}\s+([A-Z]{2,8})[:.\s]+(.+?)\s*$/gm;
  while ((match = simplePattern.exec(content)) !== null) {
    // Skip if already captured or if it's a reserved keyword
    const code = match[1].toUpperCase();
    const reserved = ['NFR', 'DR', 'ADR', 'TASK', 'TODO', 'NOTE', 'TIP', 'WARN'];
    if (reserved.includes(code)) continue;
    if (features.some(f => f.code === code)) continue;

    let sourceFile = files[0] || 'specs/product_specs.md';
    if (files.length > 1) {
      for (const file of files) {
        try {
          const fileContent = fs.readFileSync(file, 'utf8');
          if (fileContent.includes(match[0])) {
            sourceFile = file;
            break;
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    features.push({
      code,
      name: match[2].trim(),
      file: path.relative(basePath, sourceFile)
    });
  }

  return features;
}

/**
 * Extract NFRs (Non-Functional Requirements) from PRD content.
 * Looks for headers like: ### NFR-XXX: Name
 *
 * @param {string} content - PRD content
 * @returns {Array<{code: string, summary: string}>}
 */
function extractNFRs(content) {
  const nfrs = [];
  if (!content) return nfrs;

  // Pattern for NFR headers and their first line of content
  const nfrPattern = /^#{2,3}\s+NFR[-_]?([A-Z0-9-]+)[:.\s]+(.+?)$/gm;

  let match;
  while ((match = nfrPattern.exec(content)) !== null) {
    nfrs.push({
      code: `NFR-${match[1].toUpperCase()}`,
      summary: match[2].trim()
    });
  }

  return nfrs;
}

/**
 * Extract architectural decisions from architecture content.
 * Looks for headers like: ### DR-NNN: Title or ### ADR-NNN: Title
 *
 * @param {string} content - Architecture content
 * @param {string[]} files - Source files for the content
 * @param {string} basePath - Base path for relative file references
 * @returns {Array<{id: string, title: string, file: string}>}
 */
function extractDecisions(content, files, basePath) {
  const decisions = [];
  if (!content) return decisions;

  // Pattern for decision records: ### DR-NNN: Title or ### ADR-NNN: Title
  const drPattern = /^#{2,3}\s+((?:A?DR)[-_]?(\d+))[:.\s]+(.+?)$/gm;

  let match;
  while ((match = drPattern.exec(content)) !== null) {
    let sourceFile = files[0] || 'specs/architecture.md';
    if (files.length > 1) {
      for (const file of files) {
        try {
          const fileContent = fs.readFileSync(file, 'utf8');
          if (fileContent.includes(match[0])) {
            sourceFile = file;
            break;
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    decisions.push({
      id: match[1].toUpperCase().replace('_', '-'),
      title: match[3].trim(),
      file: path.relative(basePath, sourceFile)
    });
  }

  return decisions;
}

/**
 * Format extracted data as markdown for injection.
 *
 * @param {object} data - Extracted spec data
 * @param {Array} data.features - Feature list
 * @param {Array} data.nfrs - NFR list
 * @param {Array} data.decisions - Decision list
 * @returns {string} Formatted markdown
 */
function formatAsMarkdown(data) {
  const { features, nfrs, decisions } = data;
  const sections = [];

  // Features table
  if (features.length > 0) {
    const featureRows = features
      .map(f => `| ${f.code} | ${f.name} | ${f.file} |`)
      .join('\n');
    sections.push(`## Features\n| Code | Name | File |\n|------|------|------|\n${featureRows}`);
  }

  // NFRs as bullet list
  if (nfrs.length > 0) {
    const nfrItems = nfrs
      .map(n => `- **${n.code}**: ${n.summary}`)
      .join('\n');
    sections.push(`## Non-Functional Requirements\n${nfrItems}`);
  }

  // Decisions table
  if (decisions.length > 0) {
    const decisionRows = decisions
      .map(d => `| ${d.id} | ${d.title} | ${d.file} |`)
      .join('\n');
    sections.push(`## Architectural Decisions\n| ID | Decision | File |\n|----|----------|------|\n${decisionRows}`);
  }

  // Add usage guidance
  if (sections.length > 0) {
    sections.push('**Usage**: When implementing a feature, read the full requirements from the referenced file.');
  }

  return sections.join('\n\n');
}

/**
 * Main function to extract and format spec content for injection.
 *
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {string} Formatted content for injection, or empty string if nothing to inject
 */
function injectSpecs(baseDir = process.cwd()) {
  try {
    debug('Starting spec injection', { baseDir });

    const prdResult = specsIo.readSpec('product_specs', baseDir);
    const archResult = specsIo.readSpec('architecture', baseDir);

    debug('Spec files found', {
      prdFiles: prdResult.files,
      archFiles: archResult.files,
      prdContentLength: prdResult.content?.length || 0,
      archContentLength: archResult.content?.length || 0
    });

    // Extract structured data
    const features = extractFeatures(prdResult.content, prdResult.files, baseDir);
    const nfrs = extractNFRs(prdResult.content);
    const decisions = extractDecisions(archResult.content, archResult.files, baseDir);

    debug('Extraction results', {
      featuresCount: features.length,
      nfrsCount: nfrs.length,
      decisionsCount: decisions.length
    });

    if (DEBUG && features.length > 0) {
      debug('Extracted features', features);
    }
    if (DEBUG && nfrs.length > 0) {
      debug('Extracted NFRs', nfrs);
    }
    if (DEBUG && decisions.length > 0) {
      debug('Extracted decisions', decisions);
    }

    // If nothing was extracted, return empty
    if (features.length === 0 && nfrs.length === 0 && decisions.length === 0) {
      debug('No content extracted, returning empty');
      return '';
    }

    // Format as markdown
    let content = formatAsMarkdown({ features, nfrs, decisions });

    // Enforce size limit - truncate if needed
    if (content.length > MAX_CONTENT_SIZE) {
      // Prioritize: features first, then NFRs, then decisions
      const reducedData = { features, nfrs: [], decisions: [] };

      let reduced = formatAsMarkdown(reducedData);
      if (reduced.length <= MAX_CONTENT_SIZE) {
        // Try adding NFRs
        reducedData.nfrs = nfrs;
        reduced = formatAsMarkdown(reducedData);
        if (reduced.length > MAX_CONTENT_SIZE) {
          reducedData.nfrs = [];
        }
      }

      if (reduced.length <= MAX_CONTENT_SIZE) {
        // Try adding decisions
        reducedData.decisions = decisions;
        reduced = formatAsMarkdown(reducedData);
        if (reduced.length > MAX_CONTENT_SIZE) {
          reducedData.decisions = [];
        }
      }

      content = formatAsMarkdown(reducedData);
      debug('Content truncated due to size limit', {
        originalSize: formatAsMarkdown({ features, nfrs, decisions }).length,
        reducedSize: content.length,
        maxSize: MAX_CONTENT_SIZE,
        keptFeatures: reducedData.features.length,
        keptNfrs: reducedData.nfrs.length,
        keptDecisions: reducedData.decisions.length
      });
    }

    debug('Final content size', { size: content.length });
    return content;
  } catch (error) {
    // Log error but don't fail - return empty string
    debug('Error during injection', { error: error.message, stack: error.stack });
    console.error(`inject-specs error: ${error.message}`);
    return '';
  }
}

// CLI execution
if (require.main === module) {
  const content = injectSpecs();
  if (content) {
    console.log(content);
  }
}

module.exports = {
  injectSpecs,
  extractFeatures,
  extractNFRs,
  extractDecisions,
  formatAsMarkdown
};
