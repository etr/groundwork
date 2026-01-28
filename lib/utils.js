/**
 * Utility functions for hooks and scripts
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Get a temporary directory path for Claude-related files.
 * Creates the directory if it doesn't exist.
 *
 * @returns {string} Path to temp directory
 */
function getTempDir() {
  const tempDir = path.join(os.tmpdir(), 'claude-groundwork');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Read a file synchronously, returning null if file doesn't exist.
 *
 * @param {string} filePath - Path to the file
 * @returns {string|null} File contents or null if not found
 */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write content to a file synchronously.
 * Creates parent directories if they don't exist.
 *
 * @param {string} filePath - Path to the file
 * @param {string} content - Content to write
 */
function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Log a message to stderr (for hook output).
 *
 * @param {string} message - Message to log
 */
function log(message) {
  console.error(message);
}

module.exports = {
  getTempDir,
  readFile,
  writeFile,
  log
};
