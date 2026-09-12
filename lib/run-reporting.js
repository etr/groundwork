'use strict';

const fs = require('fs');
const path = require('path');

const MAX_MARKER_BYTES = 2_048;
const MAX_SEMANTIC_TEXT = 200;
const MAX_ACTIVITY_TEXT = 512;
const MAX_EVENT_LINE_BYTES = 16 * 1024;
const MAX_TRANSCRIPT_TEXT_BYTES = 256 * 1024;
const MAX_TRANSCRIPT_LINE_BYTES = MAX_TRANSCRIPT_TEXT_BYTES + 16 * 1024;
const STATUS_READ_CHUNK_BYTES = 64 * 1024;
const FORBIDDEN_DISPLAY_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const FORBIDDEN_TRANSCRIPT_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

const CREDENTIAL_KEY = '(?:[a-z0-9]+[-_.])*(?:api[-_.]?key|access[-_.]?key|secret[-_.]?access[-_.]?key|client[-_.]?secret|secret(?:[-_.]?key)?|security[-_.]?token|auth[-_.]?token|authorization|token|password|credential|signature|sig|shared[-_.]?access[-_.]?signature)';

function redactCredentials(value) {
  let text = value;
  text = text.replace(
    /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/gi,
    '[redacted]'
  );
  text = text.replace(/\b((?:proxy[-_])?authorization\s*:\s*)[^\r\n;,]+/gi, '$1[redacted]');
  text = text.replace(
    new RegExp(`(^|[?&\\s;,])(${CREDENTIAL_KEY})(\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s&#;,]+)`, 'gim'),
    '$1$2$3[redacted]'
  );
  text = text.replace(
    new RegExp(`((?:"|')${CREDENTIAL_KEY}(?:"|')\\s*:\\s*)(?:"[^"]*"|'[^']*'|[^,}\\r\\n]+)`, 'gi'),
    '$1"[redacted]"'
  );
  text = text.replace(
    new RegExp(`(--${CREDENTIAL_KEY}(?:=|\\s+))(?:"[^"]*"|'[^']*'|[^\\s,;]+)`, 'gi'),
    '$1[redacted]'
  );
  text = text.replace(
    /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{12,}|gh[pousr]_[A-Za-z0-9_]{16,})\b/g,
    '[redacted]'
  );
  return text;
}

function sanitizeText(value, maximumLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) return null;
  if (FORBIDDEN_DISPLAY_CHARACTERS.test(value)) return null;
  return redactCredentials(value);
}

function sanitizeTranscriptText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const normalized = value.replace(/\r\n?/g, '\n');
  if (FORBIDDEN_TRANSCRIPT_CHARACTERS.test(normalized)) return null;
  const redacted = redactCredentials(normalized);
  const bytes = Buffer.byteLength(redacted, 'utf8');
  if (bytes <= MAX_TRANSCRIPT_TEXT_BYTES) {
    return { text: redacted, truncated: false, original_bytes: bytes };
  }
  const marker = '\n[… transcript truncated; head and tail retained …]\n';
  const budget = Math.floor((MAX_TRANSCRIPT_TEXT_BYTES - Buffer.byteLength(marker)) / 2);
  const encoded = Buffer.from(redacted, 'utf8');
  const head = encoded.subarray(0, budget).toString('utf8').replace(/\uFFFD+$/, '');
  const tail = encoded.subarray(encoded.length - budget).toString('utf8').replace(/^\uFFFD+/, '');
  const text = `${head}${marker}${tail}`;
  return {
    text,
    truncated: true,
    original_bytes: bytes,
    retained_bytes: Buffer.byteLength(text, 'utf8'),
  };
}

function transcriptContent(signal) {
  const content = sanitizeTranscriptText(signal.text);
  if (!content) return null;
  if (content.truncated) return content;
  if (signal.truncated !== true) return content;
  const retainedBytes = Buffer.byteLength(content.text, 'utf8');
  if (!Number.isSafeInteger(signal.original_bytes) || signal.original_bytes <= retainedBytes
      || signal.retained_bytes !== retainedBytes) return null;
  return {
    ...content,
    truncated: true,
    original_bytes: signal.original_bytes,
    retained_bytes: retainedBytes,
  };
}

function validName(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

function validCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100_000;
}

function formatElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return hours ? `${hours}:${clock}` : clock;
}

function parseRunnerMarker(raw) {
  const prefix = 'GROUNDWORK_RUNNER_EVENT ';
  const line = String(raw || '').split(/\r?\n/).find((entry) => entry.trim().startsWith(prefix));
  if (!line) return null;
  const encoded = line.trim().slice(prefix.length);
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > MAX_MARKER_BYTES) return null;
  let marker;
  try {
    marker = JSON.parse(encoded);
  } catch {
    return null;
  }
  if (!marker || marker.v !== 1 || typeof marker.type !== 'string') return null;
  const exactKeys = (keys) => {
    const actual = Object.keys(marker).sort();
    const expected = ['v', 'type', ...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  };

  if (marker.type === 'gate.finished') {
    const outcomes = new Set(['pass', 'task_fail', 'baseline_fail', 'skipped']);
    const keys = marker.summary === undefined ? ['gate', 'outcome'] : ['gate', 'outcome', 'summary'];
    const summary = marker.summary === undefined ? undefined : sanitizeText(marker.summary, MAX_SEMANTIC_TEXT);
    if (!exactKeys(keys) || !validName(marker.gate) || !outcomes.has(marker.outcome)
        || (marker.summary !== undefined && summary === null)) return null;
    return {
      type: marker.type,
      gate: marker.gate,
      outcome: marker.outcome,
      ...(summary === undefined ? {} : { summary }),
    };
  }
  if (marker.type === 'validation.stage') {
    const stages = new Set(['project gates', 'review batch', 'repair', 'closure review', 'persistence']);
    if (!exactKeys(['iteration', 'stage']) || !Number.isInteger(marker.iteration)
        || marker.iteration < 1 || marker.iteration > 1_000 || !stages.has(marker.stage)) return null;
    return { type: marker.type, iteration: marker.iteration, stage: marker.stage };
  }
  if (marker.type === 'repair.finished') {
    if (!exactKeys(['iteration', 'fixed', 'files', 'deferred'])
        || !Number.isInteger(marker.iteration) || marker.iteration < 1 || marker.iteration > 1_000
        || !validCount(marker.fixed) || !validCount(marker.files) || !validCount(marker.deferred)) return null;
    return {
      type: marker.type,
      iteration: marker.iteration,
      fixed: marker.fixed,
      files: marker.files,
      deferred: marker.deferred,
    };
  }
  if (marker.type === 'next') {
    const text = sanitizeText(marker.text, MAX_SEMANTIC_TEXT);
    if (!exactKeys(['text']) || text === null) return null;
    return { type: marker.type, text };
  }
  return null;
}

function parseValidationProgress(raw) {
  const prefix = 'GROUNDWORK_VALIDATION_PROGRESS ';
  const line = String(raw || '').split(/\r?\n/).find((entry) => entry.trim().startsWith(prefix));
  if (!line) return null;
  const encoded = line.trim().slice(prefix.length);
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > 8_192) return null;
  let progress;
  try {
    progress = JSON.parse(encoded);
  } catch {
    return null;
  }
  if (!progress || !Number.isInteger(progress.iteration) || progress.iteration < 1
      || progress.iteration > 1_000 || !Array.isArray(progress.agents)
      || progress.agents.length === 0 || progress.agents.length > 32) return null;
  const exactKeys = Object.keys(progress).sort().join(',') === 'agents,iteration,status';
  if (!exactKeys) return null;
  if (progress.status === 'launched' && progress.agents.every(validName)) {
    return {
      type: 'review.batch',
      iteration: progress.iteration,
      agents: progress.agents.map((name) => ({ name, status: 'running' })),
    };
  }
  const verdicts = new Set(['approve', 'request-changes', 'skipped']);
  if (progress.status === 'completed' && progress.agents.every((agent) => (
    agent && typeof agent === 'object'
      && Object.keys(agent).sort().join(',') === 'name,verdict'
      && validName(agent.name) && verdicts.has(agent.verdict)
  ))) {
    return {
      type: 'review.batch',
      iteration: progress.iteration,
      agents: progress.agents.map((agent) => ({ name: agent.name, status: agent.verdict })),
    };
  }
  return null;
}

function transcriptSignalsFromEvent(harness, event, agent = 'phase-agent') {
  if (!event || typeof event !== 'object' || !validName(agent)) return [];
  let message = null;
  if (harness === 'codex' && event.type === 'item.completed' && event.item) {
    if (event.item.type === 'agent_message') message = event.item.text;
    if (event.item.type === 'command_execution') {
      const text = event.item.aggregated_output || event.item.output || event.item.stderr;
      if (typeof text !== 'string' || text.length === 0) return [];
      const failed = event.item.status === 'failed'
        || (Number.isInteger(event.item.exit_code) && event.item.exit_code !== 0);
      return [{ type: 'tool.output', tool: 'command', status: failed ? 'failed' : 'completed', text }];
    }
  }
  if (harness === 'claude') {
    const content = event.message && Array.isArray(event.message.content) ? event.message.content : [];
    if (event.type === 'assistant') {
      message = content.filter((block) => block && block.type === 'text')
        .map((block) => block.text).join('\n');
    }
    if (event.type === 'user') {
      const result = content.find((block) => block && block.type === 'tool_result');
      if (result) {
        const text = typeof result.content === 'string'
          ? result.content
          : Array.isArray(result.content)
            ? result.content.filter((block) => block && typeof block.text === 'string')
              .map((block) => block.text).join('\n')
            : '';
        if (text) {
          return [{
            type: 'tool.output',
            tool: 'command',
            status: result.is_error ? 'failed' : 'completed',
            text,
          }];
        }
      }
    }
  }
  if (harness === 'zcode') {
    if (event.type === 'message.upserted'
        && event.payload && typeof event.payload === 'object'
        && event.payload.role !== 'user') {
      const payload = event.payload;
      if (typeof payload.text === 'string') message = payload.text;
      else if (typeof payload.content === 'string') message = payload.content;
      else if (Array.isArray(payload.content)) {
        message = payload.content
          .map((block) => (block && typeof block.text === 'string' ? block.text : ''))
          .join('\n');
      } else if (Array.isArray(payload.parts)) {
        message = payload.parts
          .map((block) => (block && typeof block.text === 'string' ? block.text : ''))
          .join('\n');
      }
    }
    if (event.type === 'tool.updated' && event.payload
        && (event.payload.kind === 'result' || event.payload.kind === 'error')) {
      const output = event.payload.output;
      const text = typeof output === 'string' ? output : '';
      if (!text) return [];
      return [{
        type: 'tool.output',
        tool: 'command',
        status: event.payload.kind === 'error' ? 'failed' : 'completed',
        text,
      }];
    }
  }
  if (typeof message !== 'string' || message.length === 0) return [];
  const signals = [];
  const progress = parseValidationProgress(message);
  if (progress) signals.push(progress);
  const semantic = parseRunnerMarker(message);
  if (semantic) signals.push(semantic);
  const visible = message.split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('GROUNDWORK_VALIDATION_PROGRESS ')
      && !line.trim().startsWith('GROUNDWORK_RUNNER_EVENT '))
    .join('\n').trim();
  if (visible) signals.push({ type: 'agent.output', agent, text: visible });
  return signals;
}

function normalizeSignal(signal) {
  if (!signal || typeof signal !== 'object' || typeof signal.type !== 'string') return null;
  if (signal.type === 'run.started') return { type: signal.type };
  if (signal.type === 'run.finished') {
    return new Set(['pass', 'failed', 'skipped']).has(signal.outcome)
      ? { type: signal.type, outcome: signal.outcome }
      : null;
  }
  if (signal.type === 'phase.started') {
    return validName(signal.phase) ? { type: signal.type, phase: signal.phase } : null;
  }
  if (signal.type === 'phase.finished') {
    if (!validName(signal.phase) || !new Set(['pass', 'failed']).has(signal.outcome)
        || !Number.isInteger(signal.elapsed_ms) || signal.elapsed_ms < 0
        || signal.elapsed_ms > 366 * 24 * 60 * 60 * 1_000) return null;
    return {
      type: signal.type,
      phase: signal.phase,
      outcome: signal.outcome,
      elapsed_ms: signal.elapsed_ms,
    };
  }
  if (signal.type === 'activity') {
    const summary = sanitizeText(signal.summary, MAX_ACTIVITY_TEXT);
    return summary === null ? null : { type: signal.type, summary };
  }
  if (signal.type === 'gate.finished') {
    const outcomes = new Set(['pass', 'task_fail', 'baseline_fail', 'skipped']);
    const summary = signal.summary === undefined
      ? undefined
      : sanitizeText(signal.summary, MAX_SEMANTIC_TEXT);
    if (!validName(signal.gate) || !outcomes.has(signal.outcome)
        || (signal.summary !== undefined && summary === null)) return null;
    return {
      type: signal.type,
      gate: signal.gate,
      outcome: signal.outcome,
      ...(summary === undefined ? {} : { summary }),
    };
  }
  if (signal.type === 'validation.stage') {
    const stages = new Set(['project gates', 'review batch', 'repair', 'closure review', 'persistence']);
    if (!Number.isInteger(signal.iteration) || signal.iteration < 1 || signal.iteration > 1_000
        || !stages.has(signal.stage)) return null;
    return { type: signal.type, iteration: signal.iteration, stage: signal.stage };
  }
  if (signal.type === 'repair.finished') {
    if (!Number.isInteger(signal.iteration) || signal.iteration < 1 || signal.iteration > 1_000
        || !validCount(signal.fixed) || !validCount(signal.files) || !validCount(signal.deferred)) return null;
    return {
      type: signal.type,
      iteration: signal.iteration,
      fixed: signal.fixed,
      files: signal.files,
      deferred: signal.deferred,
    };
  }
  if (signal.type === 'next') {
    const text = sanitizeText(signal.text, MAX_SEMANTIC_TEXT);
    return text === null ? null : { type: signal.type, text };
  }
  return null;
}

function renderEvent(event) {
  if (event.type === 'run.started') {
    return `[${event.ts}] ${event.task_id} · run · STARTED`;
  }
  if (event.type === 'phase.started') {
    return `[${event.ts}] ${event.task_id} · ${event.phase} · STARTED`;
  }
  if (event.type === 'phase.finished') {
    return `[${event.ts}] ${event.task_id} · ${event.phase} · ${event.outcome.toUpperCase()}`
      + ` · ${formatElapsed(event.elapsed_ms)}`;
  }
  if (event.type === 'activity') {
    return `[${event.ts}] ${event.task_id} · activity · ${event.summary}`;
  }
  if (event.type === 'gate.finished') {
    const labels = {
      pass: 'PASS',
      task_fail: 'TASK FAIL',
      baseline_fail: 'BASELINE FAIL',
      skipped: 'SKIPPED',
    };
    const label = labels[event.outcome];
    if (!label) return null;
    const detail = event.summary ? ` · ${event.summary}` : '';
    return `[${event.ts}] ${event.task_id} · ${event.gate} · ${label}${detail}`;
  }
  if (event.type === 'repair.finished') {
    return `[${event.ts}] ${event.task_id} · repair iteration ${event.iteration} · COMPLETE`
      + ` · fixed ${event.fixed} · files ${event.files} · deferred ${event.deferred}`;
  }
  if (event.type === 'validation.stage') {
    return `[${event.ts}] ${event.task_id} · validate · iteration ${event.iteration} · ${event.stage}`;
  }
  if (event.type === 'next') {
    return `[${event.ts}] ${event.task_id} · Next: ${event.text}`;
  }
  if (event.type === 'run.finished') {
    return `[${event.ts}] ${event.task_id} · run · ${event.outcome.toUpperCase().replace('_', ' ')}`;
  }
  return null;
}

function createRunReporter(input) {
  if (fs.existsSync(input.runDir)) {
    const runDirStat = fs.lstatSync(input.runDir);
    if (runDirStat.isSymbolicLink() || !runDirStat.isDirectory()) {
      throw new Error(`Runner reporting path is not a real directory: ${input.runDir}`);
    }
  } else {
    fs.mkdirSync(input.runDir, { recursive: true });
  }
  const eventPath = path.join(input.runDir, 'events.jsonl');
  const logPath = path.join(input.runDir, 'runner.log');
  for (const filePath of [eventPath, logPath]) {
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Runner output is a symlink or not a regular file: ${filePath}`);
    }
  }
  const appendFlags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY
    | (fs.constants.O_NOFOLLOW || 0);
  let eventFd;
  let logFd;
  try {
    eventFd = fs.openSync(eventPath, appendFlags, 0o600);
    logFd = fs.openSync(logPath, appendFlags, 0o600);
  } catch (error) {
    if (eventFd !== undefined) fs.closeSync(eventFd);
    throw error;
  }
  function writeAll(fd, value) {
    const bytes = Buffer.from(value, 'utf8');
    let offset = 0;
    while (offset < bytes.length) {
      offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
    }
  }
  const now = input.now || Date.now;
  const output = input.output || process.stdout;
  let sequence = 0;
  let closed = false;

  function emitBatch(signals, options = {}) {
    if (closed) throw new Error('Runner reporter is closed');
    if (!Array.isArray(signals) || signals.length === 0 || signals.length > 1_000) {
      throw new Error('Runner event batch must contain 1 to 1000 signals');
    }
    const events = [];
    const journal = [];
    const human = [];
    const displayed = [];
    for (const signal of signals) {
      const normalized = normalizeSignal(signal);
      if (!normalized) throw new Error(`Invalid runner event: ${signal && signal.type}`);
      const event = {
        ...normalized,
        v: 1,
        seq: ++sequence,
        ts: new Date(now()).toISOString(),
        run_id: input.runId,
        project: input.project,
        task_id: input.taskId,
      };
      events.push(event);
      journal.push(`${JSON.stringify(event)}\n`);
      const line = renderEvent(event);
      if (!line) continue;
      const record = `${line}\n`;
      if (event.type !== 'activity') human.push(record);
      if (options.display !== false && (event.type !== 'activity' || input.verbose)) displayed.push(record);
    }
    writeAll(eventFd, journal.join(''));
    if (human.length) writeAll(logFd, human.join(''));
    if (displayed.length) output.write(displayed.join(''));
    return events;
  }

  function closeDescriptors() {
    if (closed) return;
    closed = true;
    let firstError = null;
    for (const fd of [eventFd, logFd]) {
      try {
        fs.fsyncSync(fd);
      } catch (error) {
        firstError ||= error;
      }
      try {
        fs.closeSync(fd);
      } catch (error) {
        firstError ||= error;
      }
    }
    if (firstError) throw firstError;
  }

  const reporter = {
    emit(signal, options = {}) {
      return emitBatch([signal], options)[0];
    },
    emitBatch,
    transcriptContext(phase) {
      return {
        runDir: input.runDir,
        project: input.project,
        taskId: input.taskId,
        runId: input.runId,
        phase,
      };
    },
    close(outcome) {
      if (closed) return null;
      let event;
      try {
        event = reporter.emit({ type: 'run.finished', outcome });
      } finally {
        closeDescriptors();
      }
      return event;
    },
  };
  return reporter;
}

function normalizeTranscriptSignal(signal) {
  if (!signal || typeof signal !== 'object') return null;
  if (signal.type === 'activity') {
    const summary = sanitizeText(signal.summary, MAX_ACTIVITY_TEXT);
    return summary === null ? null : { type: signal.type, summary };
  }
  if (signal.type === 'agent.output') {
    const content = transcriptContent(signal);
    if (!validName(signal.agent) || !content) return null;
    return {
      type: signal.type,
      agent: signal.agent,
      text: content.text,
      ...(content.truncated ? {
        truncated: true,
        original_bytes: content.original_bytes,
        retained_bytes: content.retained_bytes,
      } : {}),
    };
  }
  if (signal.type === 'tool.output') {
    const content = transcriptContent(signal);
    if (!validName(signal.tool) || !new Set(['completed', 'failed']).has(signal.status) || !content) {
      return null;
    }
    return {
      type: signal.type,
      tool: signal.tool,
      status: signal.status,
      text: content.text,
      ...(content.truncated ? {
        truncated: true,
        original_bytes: content.original_bytes,
        retained_bytes: content.retained_bytes,
      } : {}),
    };
  }
  if (signal.type === 'review.batch') {
    const statuses = new Set(['running', 'approve', 'request-changes', 'skipped']);
    if (!Number.isInteger(signal.iteration) || signal.iteration < 1 || signal.iteration > 1_000
        || !Array.isArray(signal.agents) || signal.agents.length === 0 || signal.agents.length > 32
        || !signal.agents.every((agent) => agent && validName(agent.name)
          && statuses.has(agent.status))) return null;
    return {
      type: signal.type,
      iteration: signal.iteration,
      agents: signal.agents.map((agent) => ({ name: agent.name, status: agent.status })),
    };
  }
  if (new Set(['gate.finished', 'validation.stage', 'repair.finished', 'next']).has(signal.type)) {
    return normalizeSignal(signal);
  }
  return null;
}

function createTranscriptWriter(input) {
  if (fs.existsSync(input.runDir)) {
    const stat = fs.lstatSync(input.runDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Runner reporting path is not a real directory: ${input.runDir}`);
    }
  } else {
    fs.mkdirSync(input.runDir, { recursive: true });
  }
  const transcriptPath = path.join(input.runDir, 'transcript.jsonl');
  if (fs.existsSync(transcriptPath)) {
    const stat = fs.lstatSync(transcriptPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Runner transcript is a symlink or not a regular file: ${transcriptPath}`);
    }
  }
  const flags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY
    | (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(transcriptPath, flags, 0o600);
  const now = input.now || Date.now;
  let closed = false;

  function emit(signal) {
    if (closed) throw new Error('Runner transcript is closed');
    const normalized = normalizeTranscriptSignal(signal);
    if (!normalized) throw new Error(`Invalid runner transcript event: ${signal && signal.type}`);
    const record = {
      ...normalized,
      v: 1,
      ts: new Date(now()).toISOString(),
      run_id: input.runId,
      project: input.project,
      task_id: input.taskId,
      phase: input.phase,
    };
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    let offset = 0;
    while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
    return record;
  }

  return {
    emit,
    close() {
      if (closed) return;
      closed = true;
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}

const EVENT_PAYLOAD_KEYS = {
  'run.started': [],
  'run.finished': ['outcome'],
  'phase.started': ['phase'],
  'phase.finished': ['phase', 'outcome', 'elapsed_ms'],
  activity: ['summary'],
  'gate.finished': ['gate', 'outcome'],
  'validation.stage': ['iteration', 'stage'],
  'repair.finished': ['iteration', 'fixed', 'files', 'deferred'],
  next: ['text'],
};

function normalizeJournalEvent(event) {
  if (!event || typeof event !== 'object' || !Object.hasOwn(EVENT_PAYLOAD_KEYS, event.type)) return null;
  const payloadKeys = [...EVENT_PAYLOAD_KEYS[event.type]];
  if (event.type === 'gate.finished' && event.summary !== undefined) payloadKeys.push('summary');
  const expected = ['v', 'seq', 'ts', 'run_id', 'project', 'task_id', 'type', ...payloadKeys].sort();
  const actual = Object.keys(event).sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return null;
  if (event.v !== 1 || !Number.isSafeInteger(event.seq) || event.seq < 1
      || typeof event.ts !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(event.ts)
      || typeof event.run_id !== 'string' || event.run_id.length === 0 || event.run_id.length > 128
      || FORBIDDEN_DISPLAY_CHARACTERS.test(event.run_id)
      || typeof event.project !== 'string' || event.project.length === 0 || event.project.length > 256
      || FORBIDDEN_DISPLAY_CHARACTERS.test(event.project)
      || typeof event.task_id !== 'string' || !/^TASK-\d{3}$/.test(event.task_id)) return null;
  const normalized = normalizeSignal(event);
  return normalized ? {
    ...normalized,
    v: event.v,
    seq: event.seq,
    ts: event.ts,
    run_id: event.run_id,
    project: event.project,
    task_id: event.task_id,
  } : null;
}

function scanReverseLines(fd, size, visit, maximumLineBytes = MAX_EVENT_LINE_BYTES) {
  let position = size;
  let carry = Buffer.alloc(0);
  let carryOversized = false;
  while (position > 0) {
    const start = Math.max(0, position - STATUS_READ_CHUNK_BYTES);
    const chunk = Buffer.allocUnsafe(position - start);
    const bytesRead = fs.readSync(fd, chunk, 0, chunk.length, start);
    if (bytesRead !== chunk.length) throw new Error('Runner event journal changed while status was reading it');
    const data = Buffer.concat([chunk, carry]);
    let end = data.length;
    let foundNewline = false;
    let suffixOversized = carryOversized;
    for (let index = data.length - 1; index >= 0; index--) {
      if (data[index] !== 0x0a) continue;
      foundNewline = true;
      const line = data.subarray(index + 1, end);
      if (line.length && !suffixOversized && line.length <= maximumLineBytes
          && visit(line.toString('utf8')) === false) return;
      suffixOversized = false;
      end = index;
    }
    const prefix = data.subarray(0, end);
    if (prefix.length > maximumLineBytes) {
      carry = prefix.subarray(prefix.length - maximumLineBytes);
      carryOversized = true;
    } else {
      carry = Buffer.from(prefix);
      carryOversized = !foundNewline && carryOversized;
    }
    position = start;
  }
  if (carry.length && !carryOversized) visit(carry.toString('utf8'));
}

function formatValidationStage(stage) {
  const labels = {
    'initial-audit-pending': 'initial review pending',
    'review-batch-complete': 'review batch complete',
    'fixer-prepared': 'repair prepared',
    'fixer-inflight': 'repair running',
    'fixer-result-ready': 'repair accepted · post-repair gates pending',
    'gates-complete': 'post-repair gates complete · closure review pending',
    validated: 'validation complete',
  };
  return labels[stage] || stage;
}

function normalizeValidationSnapshot(value) {
  if (!value || !Number.isInteger(value.iteration) || value.iteration < 1 || value.iteration > 1_000
      || typeof value.stage !== 'string' || value.stage.length === 0 || value.stage.length > 64
      || FORBIDDEN_DISPLAY_CHARACTERS.test(value.stage)) return null;
  const statuses = new Set(['pending', 'running', 'approve', 'request-changes', 'skipped']);
  const reviewers = Array.isArray(value.reviewers) ? value.reviewers.map((reviewer) => {
    if (!reviewer || !validName(reviewer.name) || !statuses.has(reviewer.status)) return null;
    return { name: reviewer.name, status: reviewer.status, carried: reviewer.carried === true };
  }) : [];
  if (reviewers.some((reviewer) => reviewer === null)) return null;
  return { iteration: value.iteration, stage: value.stage, reviewers };
}

function showTaskStatus(input) {
  const eventPath = path.join(input.runDir, 'events.jsonl');
  const eventStat = fs.lstatSync(eventPath);
  if (eventStat.isSymbolicLink() || !eventStat.isFile()) {
    throw new Error(`Runner event journal is a symlink or not a regular file: ${eventPath}`);
  }
  const fd = fs.openSync(eventPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let candidate = null;
  let rejectedRunId = null;
  let coherent = null;

  function beginCandidate(event) {
    return {
      runId: event.run_id,
      project: event.project,
      taskId: event.task_id,
      expectedSeq: event.seq,
      eventCount: 0,
      latest: event,
      phase: null,
      validation: null,
      gate: null,
      terminal: null,
    };
  }

  function consumeCandidate(event) {
    if (event.run_id !== candidate.runId || event.project !== candidate.project
        || event.task_id !== candidate.taskId || event.seq !== candidate.expectedSeq) return false;
    if (event.type === 'run.finished' && candidate.eventCount !== 0) return false;
    if (event.type === 'run.started') {
      if (event.seq !== 1) return false;
    } else if (event.seq === 1) {
      return false;
    }
    if (!candidate.phase && event.type === 'phase.started') candidate.phase = event;
    if (!candidate.validation && event.type === 'validation.stage') candidate.validation = event;
    if (!candidate.gate && event.type === 'gate.finished') candidate.gate = event;
    if (!candidate.terminal && event.type === 'run.finished') candidate.terminal = event;
    candidate.expectedSeq--;
    candidate.eventCount++;
    if (event.type === 'run.started') coherent = candidate;
    return true;
  }

  try {
    scanReverseLines(fd, eventStat.size, (line) => {
      let parsed;
      try {
        parsed = JSON.parse(line.replace(/\r$/, ''));
      } catch {
        return true;
      }
      const event = normalizeJournalEvent(parsed);
      if (!event) return true;
      if (rejectedRunId !== null) {
        if (event.run_id === rejectedRunId) return true;
        rejectedRunId = null;
      }
      if (!candidate || event.run_id !== candidate.runId) candidate = beginCandidate(event);
      if (!consumeCandidate(event)) {
        rejectedRunId = candidate.runId;
        candidate = null;
      }
      return coherent === null;
    });
  } finally {
    fs.closeSync(fd);
  }
  if (!coherent) throw new Error('Runner event journal contains no coherent run');
  const { latest, phase, validation, gate, terminal } = coherent;
  const durableValidation = normalizeValidationSnapshot(input.validation);
  const liveReview = latestTranscriptReviewBatch(input.runDir, latest.run_id);
  let effectiveValidation = durableValidation;
  if (liveReview && (!durableValidation || liveReview.iteration >= durableValidation.iteration)) {
    const liveNames = new Set(liveReview.agents.map((reviewer) => reviewer.name));
    const carried = durableValidation
      ? durableValidation.reviewers.filter((reviewer) => reviewer.carried && !liveNames.has(reviewer.name))
      : [];
    effectiveValidation = {
      iteration: liveReview.iteration,
      stage: durableValidation ? durableValidation.stage : 'review batch',
      reviewers: [...carried, ...liveReview.agents.map((reviewer) => ({ ...reviewer, carried: false }))],
    };
  }
  const labels = { pass: 'PASS', task_fail: 'TASK FAIL', baseline_fail: 'BASELINE FAIL', skipped: 'SKIPPED' };
  const phaseName = phase ? phase.phase : 'not started';
  const validationDetail = effectiveValidation
    ? ` · round ${effectiveValidation.iteration}`
    : validation
      ? ` · iteration ${validation.iteration} · ${validation.stage}`
    : '';
  let report = `${latest.task_id} · ${phaseName}${validationDetail}\n`;
  if (effectiveValidation) {
    report += `Stage: ${formatValidationStage(effectiveValidation.stage)}\n`;
    if (effectiveValidation.reviewers.length) {
      const width = Math.max(...effectiveValidation.reviewers.map((reviewer) => reviewer.name.length));
      const statuses = {
        pending: 'PENDING',
        running: 'RUNNING',
        approve: 'APPROVED',
        'request-changes': 'REQUEST CHANGES',
        skipped: 'SKIPPED',
      };
      report += 'Reviewers:\n';
      for (const reviewer of effectiveValidation.reviewers) {
        report += `  ${reviewer.name.padEnd(width)}  ${statuses[reviewer.status]}`
          + `${reviewer.carried ? ' · carried' : ''}\n`;
      }
    }
  }
  if (gate) {
    const detail = gate.summary ? ` · ${gate.summary}` : '';
    report += `Last gate: ${gate.gate} · ${labels[gate.outcome] || gate.outcome}${detail}\n`;
  }
  const state = terminal ? terminal.outcome.toUpperCase().replace('_', ' ') : 'IN PROGRESS';
  report += `State: ${state}\n`;
  (input.output || process.stdout).write(report);
}

function normalizeTranscriptRecord(record) {
  if (!record || record.v !== 1 || typeof record.ts !== 'string'
      || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.ts)
      || typeof record.run_id !== 'string' || record.run_id.length === 0 || record.run_id.length > 128
      || FORBIDDEN_DISPLAY_CHARACTERS.test(record.run_id)
      || typeof record.project !== 'string' || record.project.length === 0 || record.project.length > 256
      || FORBIDDEN_DISPLAY_CHARACTERS.test(record.project)
      || typeof record.task_id !== 'string' || !/^TASK-\d{3}$/.test(record.task_id)
      || !validName(record.phase)) return null;
  const signal = normalizeTranscriptSignal(record);
  return signal ? {
    ...signal,
    v: 1,
    ts: record.ts,
    run_id: record.run_id,
    project: record.project,
    task_id: record.task_id,
    phase: record.phase,
  } : null;
}

function latestTranscriptReviewBatch(runDir, runId) {
  const transcriptPath = path.join(runDir, 'transcript.jsonl');
  if (!fs.existsSync(transcriptPath)) return null;
  const stat = fs.lstatSync(transcriptPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Runner transcript is a symlink or not a regular file: ${transcriptPath}`);
  }
  const fd = fs.openSync(transcriptPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let batch = null;
  try {
    scanReverseLines(fd, stat.size, (line) => {
      let parsed;
      try {
        parsed = JSON.parse(line.replace(/\r$/, ''));
      } catch {
        return true;
      }
      const record = normalizeTranscriptRecord(parsed);
      if (!record || record.run_id !== runId) return true;
      if (record.type !== 'review.batch') return true;
      batch = record;
      return false;
    }, MAX_TRANSCRIPT_LINE_BYTES);
  } finally {
    fs.closeSync(fd);
  }
  return batch;
}

function renderTranscriptRecord(record) {
  const prefix = `[${record.ts}] ${record.task_id} · ${record.phase}`;
  if (record.type === 'activity') return `${prefix} · activity · ${record.summary}\n`;
  if (record.type === 'agent.output') {
    const body = record.text.split('\n').map((line) => `  ${line}`).join('\n');
    const truncation = record.truncated ? ` · truncated from ${record.original_bytes} bytes` : '';
    return `${prefix} · ${record.agent} · agent output${truncation}\n${body}\n`;
  }
  if (record.type === 'tool.output') {
    const body = record.text.split('\n').map((line) => `  ${line}`).join('\n');
    const truncation = record.truncated ? ` · truncated from ${record.original_bytes} bytes` : '';
    return `${prefix} · ${record.tool} · ${record.status.toUpperCase()}${truncation}\n${body}\n`;
  }
  if (record.type === 'review.batch') {
    const agents = record.agents.map((agent) => `${agent.name}: ${agent.status}`).join(', ');
    return `${prefix} · reviewers round ${record.iteration} · ${agents}\n`;
  }
  const semantic = renderEvent(record);
  if (semantic) return `${semantic}\n`;
  return '';
}

function showTaskLogs(input) {
  const transcriptPath = path.join(input.runDir, 'transcript.jsonl');
  const stat = fs.lstatSync(transcriptPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Runner transcript is a symlink or not a regular file: ${transcriptPath}`);
  }
  const tail = input.tail === undefined ? 50 : Number(input.tail);
  if (!Number.isSafeInteger(tail) || tail < 1 || tail > 10_000) {
    throw new Error('logs --tail must be an integer from 1 to 10000');
  }
  const fd = fs.openSync(transcriptPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  const records = [];
  let latestRunId = null;
  try {
    scanReverseLines(fd, stat.size, (line) => {
      let parsed;
      try {
        parsed = JSON.parse(line.replace(/\r$/, ''));
      } catch {
        return true;
      }
      const record = normalizeTranscriptRecord(parsed);
      if (!record) return true;
      if (latestRunId === null) latestRunId = record.run_id;
      if (record.run_id !== latestRunId) return false;
      if (record.type === 'tool.output' && record.status === 'completed'
          && input.includeToolOutput !== true) return true;
      records.push(record);
      return records.length < tail;
    }, MAX_TRANSCRIPT_LINE_BYTES);
  } finally {
    fs.closeSync(fd);
  }
  if (!records.length) throw new Error('Runner transcript contains no valid records');
  const outputTarget = input.output || process.stdout;
  const output = records.reverse().map(renderTranscriptRecord).join('');
  outputTarget.write(output);
  if (input.follow !== true) return;

  let position = stat.size;
  let pending = '';
  const wait = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const followFd = fs.openSync(transcriptPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    for (;;) {
      const currentSize = fs.fstatSync(followFd).size;
      if (currentSize < position) throw new Error('Runner transcript shrank while logs was following it');
      if (currentSize > position) {
        const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, currentSize - position));
        while (position < currentSize) {
          const length = Math.min(chunk.length, currentSize - position);
          const bytesRead = fs.readSync(followFd, chunk, 0, length, position);
          if (!bytesRead) break;
          position += bytesRead;
          pending += chunk.subarray(0, bytesRead).toString('utf8');
          let newline;
          while ((newline = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, newline).replace(/\r$/, '');
            pending = pending.slice(newline + 1);
            if (Buffer.byteLength(line, 'utf8') > MAX_TRANSCRIPT_LINE_BYTES) continue;
            let parsed;
            try {
              parsed = JSON.parse(line);
            } catch {
              continue;
            }
            const record = normalizeTranscriptRecord(parsed);
            if (!record || record.run_id !== latestRunId) continue;
            if (record.type === 'tool.output' && record.status === 'completed'
                && input.includeToolOutput !== true) continue;
            outputTarget.write(renderTranscriptRecord(record));
          }
          if (Buffer.byteLength(pending, 'utf8') > MAX_TRANSCRIPT_LINE_BYTES) pending = '';
        }
      }
      if (runHasTerminalEvent(input.runDir, latestRunId)) return;
      Atomics.wait(wait, 0, 0, input.pollMs || 100);
    }
  } finally {
    fs.closeSync(followFd);
  }
}

function runHasTerminalEvent(runDir, runId) {
  const eventPath = path.join(runDir, 'events.jsonl');
  if (!fs.existsSync(eventPath)) return false;
  const stat = fs.lstatSync(eventPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Runner event journal is a symlink or not a regular file: ${eventPath}`);
  }
  const fd = fs.openSync(eventPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let terminal = false;
  try {
    scanReverseLines(fd, stat.size, (line) => {
      let parsed;
      try {
        parsed = JSON.parse(line.replace(/\r$/, ''));
      } catch {
        return true;
      }
      const event = normalizeJournalEvent(parsed);
      if (!event || event.run_id !== runId) return true;
      terminal = event.type === 'run.finished';
      return false;
    });
  } finally {
    fs.closeSync(fd);
  }
  return terminal;
}

module.exports = {
  createRunReporter,
  createTranscriptWriter,
  parseRunnerMarker,
  parseValidationProgress,
  transcriptSignalsFromEvent,
  renderEvent,
  showTaskLogs,
  showTaskStatus,
};
