/**
 * Spec I/O utilities for reading and writing spec files.
 *
 * Supports both single-file specs (e.g., specs/product_specs.md) and
 * directory-based specs (e.g., specs/product_specs/).
 *
 * Directory structure convention:
 * - _index.md always first in any directory
 * - Files/directories sorted by numeric prefix, then alphabetically
 * - Subdirectories aggregate recursively
 */

const fs = require('fs');
const path = require('path');

// Default specs directory relative to project root
const DEFAULT_SPECS_DIR = 'specs';

// Spec type names and their corresponding paths
const SPEC_NAMES = {
  'product_specs': 'product_specs',
  'prd': 'product_specs',
  'architecture': 'architecture',
  'arch': 'architecture',
  'tasks': 'tasks'
};

/**
 * Normalize a spec name to its canonical form.
 *
 * @param {string} specName - Name like 'prd', 'product_specs', 'arch', etc.
 * @returns {string} Canonical spec name
 */
function normalizeSpecName(specName) {
  const lower = specName.toLowerCase().replace(/-/g, '_');
  return SPEC_NAMES[lower] || lower;
}

/**
 * Detect whether a spec exists as a file, directory, or neither.
 * File takes precedence over directory (backward compatible).
 *
 * @param {string} specName - Name like 'product_specs', 'architecture', 'tasks'
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{exists: boolean, type: 'file'|'directory'|null, path: string}}
 */
function detectSpecType(specName, baseDir = process.cwd()) {
  const canonicalName = normalizeSpecName(specName);
  const specsDir = path.join(baseDir, DEFAULT_SPECS_DIR);

  const filePath = path.join(specsDir, `${canonicalName}.md`);
  const dirPath = path.join(specsDir, canonicalName);

  // File takes precedence
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return { exists: true, type: 'file', path: filePath };
  }

  // Check for directory
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    return { exists: true, type: 'directory', path: dirPath };
  }

  // Neither exists
  return { exists: false, type: null, path: filePath };
}

/**
 * Compare function for sorting files/directories.
 * _index.md always first, then numeric prefix, then alphabetical.
 *
 * @param {string} a - First filename
 * @param {string} b - Second filename
 * @returns {number} Sort order
 */
function sortEntries(a, b) {
  // _index.md always first
  if (a === '_index.md') return -1;
  if (b === '_index.md') return 1;

  // Extract numeric prefixes if present (e.g., "03-features" -> 3)
  const numA = parseInt(a.match(/^(\d+)/)?.[1] || '999999', 10);
  const numB = parseInt(b.match(/^(\d+)/)?.[1] || '999999', 10);

  if (numA !== numB) return numA - numB;

  // Fall back to alphabetical
  return a.localeCompare(b);
}

/**
 * Recursively aggregate all .md files in a directory.
 *
 * @param {string} dirPath - Directory to aggregate
 * @param {string[]} fileList - Accumulator for file paths (for reporting)
 * @returns {string} Aggregated content
 */
function aggregateDirectory(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return '';
  }

  const entries = fs.readdirSync(dirPath);
  const sortedEntries = entries.filter(e => !e.startsWith('.')).sort(sortEntries);

  let content = '';

  for (const entry of sortedEntries) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && entry.endsWith('.md')) {
      fileList.push(fullPath);
      const fileContent = fs.readFileSync(fullPath, 'utf8');
      // Add separator between files, but not before first file
      if (content) {
        content += '\n\n';
      }
      content += fileContent;
    } else if (stat.isDirectory()) {
      // Recurse into subdirectory
      const subContent = aggregateDirectory(fullPath, fileList);
      if (subContent) {
        if (content) {
          content += '\n\n';
        }
        content += subContent;
      }
    }
  }

  return content;
}

/**
 * Read a spec, handling both file and directory formats.
 *
 * @param {string} specName - Name like 'product_specs', 'architecture', 'tasks'
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{content: string|null, type: 'file'|'directory'|null, files: string[], path: string}}
 */
function readSpec(specName, baseDir = process.cwd()) {
  const detection = detectSpecType(specName, baseDir);

  if (!detection.exists) {
    return { content: null, type: null, files: [], path: detection.path };
  }

  if (detection.type === 'file') {
    const content = fs.readFileSync(detection.path, 'utf8');
    return {
      content,
      type: 'file',
      files: [detection.path],
      path: detection.path
    };
  }

  // Directory mode
  const files = [];
  const content = aggregateDirectory(detection.path, files);

  return {
    content: content || null,
    type: 'directory',
    files,
    path: detection.path
  };
}

/**
 * Find which file in a spec directory contains a given pattern.
 * Useful for locating specific requirements, decisions, or tasks.
 *
 * @param {string} specName - Name like 'product_specs', 'architecture', 'tasks'
 * @param {string|RegExp} pattern - Pattern to search for
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{file: string|null, line: number|null, match: string|null}}
 */
function findFileContaining(specName, pattern, baseDir = process.cwd()) {
  const detection = detectSpecType(specName, baseDir);

  if (!detection.exists) {
    return { file: null, line: null, match: null };
  }

  const regex = typeof pattern === 'string'
    ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : pattern;

  if (detection.type === 'file') {
    const content = fs.readFileSync(detection.path, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(regex);
      if (match) {
        return { file: detection.path, line: i + 1, match: match[0] };
      }
    }
    return { file: null, line: null, match: null };
  }

  // Directory mode - search all files
  const files = [];
  aggregateDirectory(detection.path, files);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(regex);
      if (match) {
        return { file, line: i + 1, match: match[0] };
      }
    }
  }

  return { file: null, line: null, match: null };
}

/**
 * Get the appropriate file path for writing content.
 *
 * For single-file specs, returns the file path.
 * For directory specs, returns the appropriate file based on options.
 *
 * @param {string} specName - Name like 'product_specs', 'architecture', 'tasks'
 * @param {object} options - Routing options
 * @param {string} [options.section] - Section name/number to route to
 * @param {string} [options.subsection] - Subsection name for nested routing
 * @param {string} [options.id] - Specific ID to update (e.g., 'DR-001', 'TASK-004')
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{path: string, type: 'file'|'directory', isNew: boolean}}
 */
function getWritePath(specName, options = {}, baseDir = process.cwd()) {
  const detection = detectSpecType(specName, baseDir);
  const canonicalName = normalizeSpecName(specName);
  const specsDir = path.join(baseDir, DEFAULT_SPECS_DIR);

  // If no spec exists yet, return the file path (will be created)
  if (!detection.exists) {
    return {
      path: path.join(specsDir, `${canonicalName}.md`),
      type: 'file',
      isNew: true
    };
  }

  // Single file mode - always return the file
  if (detection.type === 'file') {
    return {
      path: detection.path,
      type: 'file',
      isNew: false
    };
  }

  // Directory mode - route based on options
  const { section, subsection, id } = options;

  // If we have a specific ID, try to find it
  if (id) {
    const found = findFileContaining(specName, id, baseDir);
    if (found.file) {
      return {
        path: found.file,
        type: 'directory',
        isNew: false
      };
    }
  }

  // Route based on section
  if (section) {
    const sectionPath = path.join(detection.path, section);

    // Check if section is a directory
    if (fs.existsSync(sectionPath) && fs.statSync(sectionPath).isDirectory()) {
      if (subsection) {
        const subsectionPath = path.join(sectionPath, `${subsection}.md`);
        return {
          path: subsectionPath,
          type: 'directory',
          isNew: !fs.existsSync(subsectionPath)
        };
      }
      // Return the _index.md for the section
      return {
        path: path.join(sectionPath, '_index.md'),
        type: 'directory',
        isNew: !fs.existsSync(path.join(sectionPath, '_index.md'))
      };
    }

    // Section might be a file
    const sectionFile = path.join(detection.path, `${section}.md`);
    if (fs.existsSync(sectionFile)) {
      return {
        path: sectionFile,
        type: 'directory',
        isNew: false
      };
    }

    // Create new section file
    return {
      path: sectionFile,
      type: 'directory',
      isNew: true
    };
  }

  // Default to _index.md
  return {
    path: path.join(detection.path, '_index.md'),
    type: 'directory',
    isNew: !fs.existsSync(path.join(detection.path, '_index.md'))
  };
}

/**
 * List all files in a spec (for single file, returns array with one element).
 *
 * @param {string} specName - Name like 'product_specs', 'architecture', 'tasks'
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {string[]} Array of file paths
 */
function listSpecFiles(specName, baseDir = process.cwd()) {
  const detection = detectSpecType(specName, baseDir);

  if (!detection.exists) {
    return [];
  }

  if (detection.type === 'file') {
    return [detection.path];
  }

  const files = [];
  aggregateDirectory(detection.path, files);
  return files;
}

/**
 * Check if any spec exists (file or directory) for session-start detection.
 *
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{hasPRD: boolean, hasArchitecture: boolean, hasTasks: boolean}}
 */
function detectSpecs(baseDir = process.cwd()) {
  return {
    hasPRD: detectSpecType('product_specs', baseDir).exists,
    hasArchitecture: detectSpecType('architecture', baseDir).exists,
    hasTasks: detectSpecType('tasks', baseDir).exists
  };
}

module.exports = {
  detectSpecType,
  readSpec,
  aggregateDirectory,
  findFileContaining,
  getWritePath,
  listSpecFiles,
  detectSpecs,
  normalizeSpecName,
  sortEntries,
  DEFAULT_SPECS_DIR
};
