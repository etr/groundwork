/**
 * Atomic file writes shared by every Groundwork component whose output is
 * read concurrently (hooks, statusline, runner, validation helpers).
 *
 * Writes go to a uniquely-named temporary file in the destination directory
 * (same filesystem, so the rename cannot tear), created with O_EXCL and
 * owner-only permissions, fsynced, then renamed over the destination. A
 * concurrent reader therefore observes either the previous complete file or
 * the new complete file — never a partial write.
 */

const fs = require('fs');
const path = require('path');

/**
 * Atomically write string data to a file.
 *
 * @param {string} file - Destination path
 * @param {string} data - Content to write
 * @param {object} [options]
 * @param {boolean} [options.mkdir=false] - Create the destination directory
 *   (and parents) first, mirroring the validation session's layout behavior.
 */
function writeFileSyncAtomic(file, data, options = {}) {
  const directory = path.dirname(file);
  if (options.mkdir) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`
  );
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, data, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

/**
 * Atomically write a JSON value, newline-terminated like the validation
 * session and unworked-findings helpers always have.
 *
 * @param {string} file - Destination path
 * @param {*} value - JSON-serializable value
 * @param {object} [options] - Passed through to writeFileSyncAtomic
 */
function writeJsonSyncAtomic(file, value, options = {}) {
  writeFileSyncAtomic(file, `${JSON.stringify(value)}\n`, options);
}

module.exports = { writeFileSyncAtomic, writeJsonSyncAtomic };
