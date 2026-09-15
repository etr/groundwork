/**
 * Unified YAML frontmatter parser for the Groundwork plugin.
 *
 * Handles:
 * - Simple key: value pairs
 * - Block scalars (| and >)
 * - YAML lists (- item syntax)
 * - Inline arrays ([item1, item2])
 * - Multi-line values with proper indentation handling
 */

/**
 * Extract YAML frontmatter from content.
 *
 * @param {string} content - File content that may contain frontmatter
 * @returns {object|null} - Parsed frontmatter object, or null if not found
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};

  // Simple YAML parsing for key: value pairs
  // Handle block scalars (|) and YAML lists
  const lines = yaml.split('\n');
  let currentKey = null;
  let inBlockScalar = false;
  let inList = false;
  let blockIndent = 0;
  let blockContentIndent = 0;
  let listItems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (inBlockScalar) {
      // Check if still in block scalar
      const currentIndent = line.match(/^(\s*)/)[1].length;
      if (currentIndent > blockIndent || trimmedLine === '') {
        // Track base indentation of first content line and strip it from all lines
        if (!blockContentIndent && currentIndent > blockIndent && trimmedLine !== '') {
          blockContentIndent = currentIndent;
        }
        const strippedLine = blockContentIndent ? line.substring(Math.min(currentIndent, blockContentIndent)) : line;
        result[currentKey] += (result[currentKey] ? '\n' : '') + strippedLine;
        continue;
      } else {
        inBlockScalar = false;
        blockContentIndent = 0;
      }
    }

    if (inList) {
      // Check if this is a list item
      if (trimmedLine.startsWith('- ')) {
        listItems.push(trimmedLine.slice(2).trim());
        continue;
      } else if (trimmedLine.startsWith('-') && trimmedLine.length === 1) {
        // Empty list item
        continue;
      } else if (trimmedLine === '') {
        // Empty lines are okay, continue
        continue;
      } else if (line.match(/^\s+/) && !line.match(/^\s+-\s/)) {
        // Indented non-list-item line ends list mode
        result[currentKey] = listItems;
        inList = false;
        listItems = [];
      } else {
        // End of list
        result[currentKey] = listItems;
        inList = false;
        listItems = [];
      }
    }

    const keyMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();

      if (value === '|' || value === '>') {
        inBlockScalar = true;
        blockIndent = line.match(/^(\s*)/)[1].length;
        result[currentKey] = '';
      } else if (value === '') {
        // Could be start of a list or block scalar - peek ahead
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        if (nextLine.trim().startsWith('- ')) {
          inList = true;
          listItems = [];
        } else {
          result[currentKey] = value;
        }
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array syntax: ["item1", "item2"]
        try {
          result[currentKey] = JSON.parse(value);
        } catch {
          result[currentKey] = value;
        }
      } else {
        result[currentKey] = value;
      }
    }
  }

  // Handle list that extends to end of frontmatter
  if (inList && currentKey) {
    result[currentKey] = listItems;
  }

  // Normalize 'requires' field to always be an array
  // This ensures consumers receive a consistent type
  if (result.requires !== undefined) {
    if (Array.isArray(result.requires)) {
      // Already an array (YAML list syntax), just trim whitespace
      result.requires = result.requires
        .map(s => String(s).trim())
        .filter(s => s.length > 0);
    } else if (typeof result.requires === 'string') {
      // Comma-separated string, split into array
      result.requires = result.requires
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    } else {
      // Unexpected type, default to empty array
      result.requires = [];
    }
  }

  return result;
}

/**
 * Strip YAML frontmatter from content, returning just the body.
 *
 * @param {string} content - Full content including frontmatter
 * @returns {string} - Content without frontmatter
 */
function stripFrontmatter(content) {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterEnded = false;
  const contentLines = [];

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) {
        frontmatterEnded = true;
        continue;
      }
      inFrontmatter = true;
      continue;
    }

    if (frontmatterEnded || !inFrontmatter) {
      contentLines.push(line);
    }
  }

  return contentLines.join('\n').trim();
}

/**
 * Check if content has valid YAML frontmatter.
 *
 * @param {string} content - Content to check
 * @returns {boolean} - True if frontmatter exists and is valid
 */
function hasFrontmatter(content) {
  return /^---\n[\s\S]*?\n---/.test(content);
}

module.exports = {
  extractFrontmatter,
  stripFrontmatter,
  hasFrontmatter
};
