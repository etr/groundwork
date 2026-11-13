'use strict';

/**
 * Credential redaction shared by every component that renders reviewer or
 * agent prose into durable, committed artifacts (run journals, transcripts,
 * unworked-finding ledgers). Reviewers routinely quote the exact
 * secret-bearing code they flag, so any text destined for a committed file
 * passes through redactCredentials first.
 */

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

module.exports = { redactCredentials };
