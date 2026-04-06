#!/usr/bin/env node
'use strict';

// Transforms Agent() calls in skill markdown for non-Claude targets.
// Reads stdin, writes stdout. Usage: transform-agents.js --target <pi|codex|opencode|kiro>

const targetIdx = process.argv.indexOf('--target');
if (targetIdx === -1 || targetIdx + 1 >= process.argv.length) {
  process.stderr.write('Usage: transform-agents.js --target <pi|codex|opencode|kiro>\n');
  process.exit(1);
}
const target = process.argv[targetIdx + 1];

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => process.stdout.write(transform(input, target)));

// ---------------------------------------------------------------------------
// Main transform
// ---------------------------------------------------------------------------

function transform(text, tgt) {
  const lines = text.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    // 1. Strip <EXTREMELY-IMPORTANT> blocks entirely
    if (lines[i].includes('<EXTREMELY-IMPORTANT>')) {
      while (i < lines.length && !lines[i].includes('</EXTREMELY-IMPORTANT>')) i++;
      if (i < lines.length) i++; // skip closing tag
      continue;
    }

    // 2. Four-space-indented Agent() block (markdown code-block via indent)
    if (/^    Agent\(/.test(lines[i])) {
      const block = collectIndentedAgent(lines, i);
      i = block.nextIndex;
      const calls = parseAgentCalls(block.lines);
      if (calls.length > 0) {
        output.push(...formatCalls(calls, tgt));
        continue;
      }
      block.lines.forEach(l => output.push(l));
      continue;
    }

    // 3. Fenced code block
    if (/^\s*```/.test(lines[i])) {
      const fence = collectFence(lines, i);
      i = fence.nextIndex;

      if (fence.bodyLines.some(l => /^\s*Agent\(/.test(l))) {
        const calls = parseAgentCalls(fence.bodyLines);
        if (calls.length > 0) {
          output.push(...formatCalls(calls, tgt));
          continue;
        }
      }
      // No Agent() — pass through unchanged
      output.push(fence.openLine);
      fence.bodyLines.forEach(l => output.push(l));
      output.push(fence.closeLine);
      continue;
    }

    // 4. Regular line
    output.push(lines[i]);
    i++;
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

function collectFence(lines, start) {
  const openLine = lines[start];
  let i = start + 1;
  const bodyLines = [];
  while (i < lines.length && !/^\s*```/.test(lines[i])) {
    bodyLines.push(lines[i]);
    i++;
  }
  const closeLine = i < lines.length ? lines[i] : '';
  return { openLine, bodyLines, closeLine, nextIndex: i + 1 };
}

function collectIndentedAgent(lines, start) {
  // Single-line Agent(...) on one line
  if (/^    Agent\(.*\)\s*$/.test(lines[start])) {
    return { lines: [lines[start]], nextIndex: start + 1 };
  }
  // Multi-line: collect until "    )" (4-space close paren on its own line)
  const collected = [];
  let i = start;
  while (i < lines.length) {
    collected.push(lines[i]);
    if (collected.length > 1 && /^    \)\s*$/.test(lines[i])) {
      i++;
      break;
    }
    i++;
  }
  return { lines: collected, nextIndex: i };
}

// ---------------------------------------------------------------------------
// Parser — extracts Agent() call parameters
// ---------------------------------------------------------------------------

function parseAgentCalls(lines) {
  const calls = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trimStart();
    if (!trimmed.startsWith('Agent(')) { i++; continue; }

    // Single-line
    if (/^Agent\(.*\)\s*$/.test(trimmed)) {
      const call = parseAgentText(trimmed);
      if (call) calls.push(call);
      i++;
      continue;
    }

    // Multi-line: collect until closing ) on its own line
    const callLines = [];
    while (i < lines.length) {
      callLines.push(lines[i]);
      if (callLines.length > 1 && /^\s*\)\s*$/.test(lines[i])) { i++; break; }
      i++;
    }
    const call = parseAgentText(callLines.join('\n'));
    if (call) calls.push(call);
  }

  return calls;
}

function parseAgentText(text) {
  const openIdx = text.indexOf('Agent(');
  if (openIdx === -1) return null;
  const innerStart = openIdx + 'Agent('.length;
  const innerEnd = text.lastIndexOf(')');
  if (innerEnd <= innerStart) return null;
  const inner = text.substring(innerStart, innerEnd);

  // Scan key="value" pairs
  const params = {};
  let i = 0;
  while (i < inner.length) {
    // Skip whitespace and commas
    while (i < inner.length && /[\s,]/.test(inner[i])) i++;
    if (i >= inner.length) break;

    // Read key (up to =)
    const keyStart = i;
    while (i < inner.length && inner[i] !== '=') i++;
    if (i >= inner.length) break;
    const key = inner.substring(keyStart, i).trim();
    i++; // skip =

    // Find opening quote
    while (i < inner.length && inner[i] !== '"') i++;
    if (i >= inner.length) break;
    i++; // skip opening "

    // Read value until unescaped closing "
    const valueStart = i;
    while (i < inner.length) {
      if (inner[i] === '\\' && i + 1 < inner.length) { i += 2; continue; }
      if (inner[i] === '"') break;
      i++;
    }
    params[key] = inner.substring(valueStart, i);
    if (i < inner.length) i++; // skip closing "
  }

  return {
    subagentType: params.subagent_type || null,
    description: params.description || null,
    prompt: params.prompt || null,
  };
}

// ---------------------------------------------------------------------------
// Agent info helpers
// ---------------------------------------------------------------------------

function extractAgentInfo(subagentType) {
  if (!subagentType) return { isGroundwork: false, agentName: null };
  if (subagentType.startsWith('groundwork:')) {
    const parts = subagentType.split(':');
    return { isGroundwork: true, agentName: parts[1] };
  }
  return { isGroundwork: false, agentName: subagentType };
}

function installedRef(agentName, tgt) {
  switch (tgt) {
    case 'opencode':
    case 'kiro':
      return agentName;
    default: // codex, pi
      return `review-${agentName}`;
  }
}

function refLabel(tgt) {
  switch (tgt) {
    case 'opencode':
    case 'kiro':
      return 'agent';
    default:
      return 'skill';
  }
}

// Strip common leading whitespace from multi-line prompt content
// (indented blocks have artifact leading spaces from markdown indent)
function trimPrompt(prompt) {
  if (!prompt) return '';
  const lines = prompt.split('\n');
  if (lines.length <= 1) return prompt;
  let minIndent = Infinity;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const indent = lines[i].match(/^(\s*)/)[1].length;
    if (indent < minIndent) minIndent = indent;
  }
  if (minIndent === Infinity || minIndent === 0) return prompt;
  return lines
    .map((l, idx) => (idx === 0 ? l : l.substring(Math.min(minIndent, l.length))))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Formatters — produce target-specific output
// ---------------------------------------------------------------------------

function formatCalls(calls, tgt) {
  if (calls.length === 0) return [];

  // Multiple single-line agents with placeholder prompts (parallel reviewers)
  if (calls.length > 1 && calls.every(c => !c.prompt || c.prompt === '...')) {
    return formatMultipleAgents(calls, tgt);
  }

  const result = [];
  for (const call of calls) {
    result.push(...formatSingleAgent(call, tgt));
  }
  return result;
}

function formatSingleAgent(call, tgt) {
  const { isGroundwork, agentName } = extractAgentInfo(call.subagentType);
  const desc = call.description || agentName || 'Agent task';
  const prompt = trimPrompt(call.prompt || '');

  // Pi + groundwork agent → groundwork_agent() tool call in a code fence
  if (tgt === 'pi' && isGroundwork) {
    const lines = ['```'];
    if (prompt && prompt !== '...') {
      lines.push('groundwork_agent(');
      lines.push(`  agent="${agentName}",`);
      const indented = prompt.replace(/\n/g, '\n  ');
      lines.push(`  task="${indented}"`);
      lines.push(')');
    } else {
      lines.push(`groundwork_agent(agent="${agentName}", task="...")`);
    }
    lines.push('```');
    lines.push('');
    return lines;
  }

  // All other cases → blockquoted prose preserving prompt content
  const lines = [`> **${desc}:**`];
  lines.push('>');
  if (prompt && prompt !== '...') {
    for (const pLine of prompt.split('\n')) {
      lines.push(pLine ? `> ${pLine}` : '>');
    }
  }
  lines.push('');
  return lines;
}

function formatMultipleAgents(calls, tgt) {
  // Pi + all groundwork → multiple groundwork_agent() calls in one fence
  if (tgt === 'pi' && calls.every(c => extractAgentInfo(c.subagentType).isGroundwork)) {
    const lines = ['```'];
    for (const call of calls) {
      const { agentName } = extractAgentInfo(call.subagentType);
      const prompt = call.prompt || '...';
      lines.push(`groundwork_agent(agent="${agentName}", task="${prompt}")`);
    }
    lines.push('```');
    lines.push('');
    return lines;
  }

  // Other targets → bulleted list
  const lines = ['> Perform these reviews in sequence:'];
  for (const call of calls) {
    const { isGroundwork, agentName } = extractAgentInfo(call.subagentType);
    const desc = call.description || agentName || 'Review';
    if (isGroundwork && agentName) {
      const ref = installedRef(agentName, tgt);
      const label = refLabel(tgt);
      lines.push(`> - **${desc}** (${label}: \`${ref}\`)`);
    } else {
      lines.push(`> - **${desc}**`);
    }
  }
  lines.push('');
  return lines;
}
