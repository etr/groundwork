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
const crypto = require('crypto');

/**
 * Atomically write string data to a file.
 *
 * The temporary name carries cryptographic uniqueness beyond pid and time:
 * a crashed writer's leftover temporary can never collide with a later
 * writer, even after pid recycling within the same millisecond.
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
  const temporary = temporaryName(directory, file);
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, data, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

function temporaryName(directory, file) {
  return path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );
}

/**
 * Publish string data under a name no other invocation may occupy.
 *
 * Unlike writeFileSyncAtomic (a replacement for known single-owner
 * destinations), publication is exclusive: if the destination already
 * exists — because a concurrent invocation claimed the same name — this
 * throws EEXIST instead of overwriting it. The content is still written
 * atomically (readers observe all or nothing), via a uniquely named
 * temporary that is hard-linked into place.
 *
 * @param {string} file - Destination path
 * @param {string} data - Content to write
 * @param {object} [options] - Passed through to writeFileSyncAtomic
 * @returns {string} The published path
 */
function publishFileSyncExclusive(file, data, options = {}) {
  const directory = path.dirname(file);
  if (options.mkdir) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = temporaryName(directory, file);
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, data, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    // link(2) fails with EEXIST when the name is already taken — the
    // no-clobber gate — and succeeds atomically with full content otherwise.
    fs.linkSync(temporary, file);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return file;
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

module.exports = { writeFileSyncAtomic, writeJsonSyncAtomic, publishFileSyncExclusive };
