#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const TIERS = ['light', 'balanced', 'deep'];
const EFFORTS = ['low', 'medium', 'high', 'max'];
const BUILTIN_CODEX_POLICY = require('./codex-model-policy.json');
const TIER_ALIASES = {
  light: ['Luna', 'luna'],
  balanced: ['Terra', 'terra'],
  deep: ['Sol', 'sol'],
};
const TIER_TOKENS = {};
for (const tier of TIERS) {
  TIER_TOKENS[tier] = [BUILTIN_CODEX_POLICY.translation[tier], ...TIER_ALIASES[tier]];
}
const INJECTED_MODEL_POLICY_SKILLS = new Set([
  'ship',
  'staged-rollout',
  'validate',
  'work-on',
  'just-do-it-swarming',
]);
const TOP_LEVEL_KEYS = ['effort', 'translation', 'skills', 'agents'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseInstallExceptions(sourceDir) {
  const exceptions = {};
  const config = path.join(sourceDir, 'install-config.txt');
  if (!fs.existsSync(config)) return exceptions;

  for (const rawLine of fs.readFileSync(config, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const skill = line.slice(0, separator).trim();
    const installed = line.slice(separator + 1).trim().split(/\s+/)[0];
    exceptions[skill] = installed;
  }
  return exceptions;
}

function sourceSkills(sourceDir) {
  return new Set(fs.readdirSync(path.join(sourceDir, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(sourceDir, 'skills', name, 'SKILL.md'))));
}

function sourceAgents(sourceDir) {
  return new Set(fs.readdirSync(path.join(sourceDir, 'agents'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(sourceDir, 'agents', name, 'AGENT.md'))));
}

function hasInstallerControlledModel(sourceDir, skill) {
  if (INJECTED_MODEL_POLICY_SKILLS.has(skill)) return true;
  const content = fs.readFileSync(path.join(sourceDir, 'skills', skill, 'SKILL.md'), 'utf8');
  return /(?:\bsonnet\b|\bopus\b|\bhaiku\b|model\s*:\s*["'])/i.test(content);
}

function validateModelId(value, context) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new Error(`Invalid model ID for ${context}: ${JSON.stringify(value)}`);
  }
}

function validateMapping(value, context) {
  if (!isPlainObject(value)) throw new Error(`${context} must be an object`);
  for (const [key, model] of Object.entries(value)) validateModelId(model, `${context} ${key}`);
}

function loadOverride(file) {
  if (file === undefined) return {};
  if (typeof file !== 'string' || file.length === 0) {
    throw new Error('A model override file path is required');
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read model override JSON ${file}: ${error.message}`);
  }
  if (!isPlainObject(parsed)) throw new Error('Model override file must contain one JSON object');

  for (const key of Object.keys(parsed)) {
    if (!TOP_LEVEL_KEYS.includes(key)) throw new Error(`Unknown model override key: ${key}`);
  }

  if (parsed.effort !== undefined && !EFFORTS.includes(parsed.effort)) {
    throw new Error(`Invalid model override effort: ${parsed.effort}`);
  }
  if (parsed.translation !== undefined) {
    if (!isPlainObject(parsed.translation)) throw new Error('translation must be an object');
    for (const tier of Object.keys(parsed.translation)) {
      if (!TIERS.includes(tier)) throw new Error(`Unknown model translation tier: ${tier}`);
    }
    validateMapping(parsed.translation, 'translation');
  }
  if (parsed.skills !== undefined) validateMapping(parsed.skills, 'skills');
  if (parsed.agents !== undefined) validateMapping(parsed.agents, 'agents');
  return parsed;
}

function validateOverride(file, sourceDir, options = {}) {
  const override = loadOverride(file);
  const skills = sourceSkills(sourceDir);
  const agents = sourceAgents(sourceDir);
  const exceptions = parseInstallExceptions(sourceDir);

  for (const skill of Object.keys(override.skills || {})) {
    if (skill.startsWith('groundwork-')) {
      throw new Error(`Use canonical skill ID ${skill.replace(/^groundwork-/, '')}, not ${skill}`);
    }
    if (!skills.has(skill)) throw new Error(`Unknown skill model override: ${skill}`);
    if (exceptions[skill] === 'drop') {
      throw new Error(`Skill model override targets dropped skill: ${skill}`);
    }
    if (!hasInstallerControlledModel(sourceDir, skill)) {
      throw new Error(
        `Skill model override for ${skill} has no effect: that skill has no installer-controlled model directive`
      );
    }
  }

  for (const agent of Object.keys(override.agents || {})) {
    if (!agents.has(agent)) throw new Error(`Unknown agent model override: ${agent}`);
    if (options.skillsOnly) {
      throw new Error('Cannot install agent model overrides with --skills-only');
    }
  }

  return override;
}

function tierForSourceModel(model) {
  const tier = BUILTIN_CODEX_POLICY.sourceModels[model];
  if (tier !== undefined) return tier;
  throw new Error(`No builtin Codex model mapping for Claude model '${model}'`);
}

function tierForBuiltinModel(model) {
  for (const [tier, builtinModel] of Object.entries(BUILTIN_CODEX_POLICY.translation)) {
    if (model === builtinModel) return tier;
  }
  throw new Error(`Cannot resolve built-in Codex model: ${model}`);
}

function effectiveTranslation(override) {
  return { ...BUILTIN_CODEX_POLICY.translation, ...override.translation };
}

function modelForTier(override, tier) {
  const model = effectiveTranslation(override)[tier];
  if (!model) throw new Error(`Builtin Codex policy has no ${tier} model`);
  return model;
}

function resolveModel(override, kind, name, input) {
  if (kind === 'agent' && override.agents && override.agents[name]) {
    return override.agents[name];
  }
  if (!input) return '';
  return modelForTier(override, tierForBuiltinModel(input));
}

function resolveEffort(override, input) {
  return override.effort || input || '';
}

function resolveAgent(override, name, sourceModel, sourceEffort) {
  if (sourceEffort !== '' && !EFFORTS.includes(sourceEffort)) {
    throw new Error(`No builtin Codex reasoning-effort mapping for Claude effort '${sourceEffort}'`);
  }

  const sourceTier = tierForSourceModel(sourceModel);
  const agentPolicy = BUILTIN_CODEX_POLICY.agents[name];
  const tier = agentPolicy ? agentPolicy.tier : sourceTier;
  const exactModel = override.agents && override.agents[name];
  const model = exactModel || (tier === 'inherit' ? '' : modelForTier(override, tier));
  const effort = resolveEffort(
    override,
    agentPolicy ? agentPolicy.effort : sourceEffort
  );
  return { model, effort };
}

function replacementsFor(override, kind, name) {
  const exactMap = kind === 'skill' ? override.skills : override.agents;
  const exact = exactMap && exactMap[name];
  const replacements = {};
  for (const tier of TIERS) {
    replacements[tier] = exact || modelForTier(override, tier);
  }
  return replacements;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTierTokens(text, replacements, effort) {
  let result = text;

  for (const [tier, tokens] of Object.entries(TIER_TOKENS)) {
    const tokenPattern = tokens.map(escapeRegExp).join('|');
    const combined = new RegExp(`\\b(?:${tokenPattern})\\/(?:${EFFORTS.join('|')})\\b`, 'g');
    result = result.replace(combined, (match) => `${replacements[tier]}/${effort || match.split('/')[1]}`);

    const token = new RegExp(`\\b(?:${tokenPattern})\\b`, 'g');
    result = result.replace(token, () => replacements[tier]);
  }

  return result;
}

function replacePolicyEfforts(text, effort) {
  if (!effort) return text;
  return text
    .replace(/at `(low|medium|high|max)` effort/g, `at \`${effort}\` effort`)
    .replace(/at (low|medium|high|max) effort/g, `at ${effort} effort`)
    .replace(/reasoning_effort: "(low|medium|high|max)"/g, `reasoning_effort: "${effort}"`)
    .replace(/model_reasoning_effort: "(low|medium|high|max)"/g, `model_reasoning_effort: "${effort}"`);
}

function applyToText(override, kind, name, text) {
  const exactMap = kind === 'skill' ? override.skills : override.agents;
  const hasUserModelPolicy = Boolean(
    override.effort ||
    (override.translation && Object.keys(override.translation).length > 0) ||
    (exactMap && exactMap[name])
  );
  if (!hasUserModelPolicy) return text;

  const result = replaceTierTokens(text, replacementsFor(override, kind, name), override.effort);
  return replacePolicyEfforts(result, override.effort);
}

function affects(override, sourceDir, kind, name) {
  if (kind === 'agent') {
    return Boolean(
      (override.agents && override.agents[name]) ||
      (override.translation && Object.keys(override.translation).length > 0) ||
      override.effort
    );
  }
  if (override.skills && override.skills[name]) return true;
  if (!override.effort && !override.translation) return false;
  return hasInstallerControlledModel(sourceDir, name);
}

function printOverride(override) {
  console.log('Codex model override:');
  console.log(`  effort: ${override.effort || 'default'}`);
  for (const tier of TIERS) {
    console.log(`  ${tier}: ${effectiveTranslation(override)[tier]}`);
  }
  for (const [kind, label] of [['skills', 'skill'], ['agents', 'agent']]) {
    for (const [name, model] of Object.entries(override[kind] || {})) {
      console.log(`  exact ${label} ${name}: ${model}`);
    }
  }
}

function parseArgs(argv) {
  const args = { skillsOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--skills-only') {
      args.skillsOnly = true;
      continue;
    }
    const value = argv[i + 1];
    if (!flag.startsWith('--') || value === undefined) {
      throw new Error('Usage: model-override.js COMMAND [--file FILE] [--source DIR] [--kind KIND] [--name NAME] [--input VALUE] [--skills-only]');
    }
    const key = flag.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    args[key] = value;
    i++;
  }
  return args;
}

function main(argv) {
  const command = argv[0];
  const args = parseArgs(argv.slice(1));
  if (command === 'validate') {
    if (!args.source) throw new Error('Model override validation requires --source');
    printOverride(validateOverride(args.file, args.source, args));
    return;
  }

  if (command === 'resolve-builtin-agent' || command === 'resolve-agent') {
    if (!args.name) throw new Error(`${command} requires --name`);
    const override = loadOverride(args.file);
    const resolved = resolveAgent(
      override,
      args.name,
      args.sourceModel === undefined ? '' : args.sourceModel,
      args.sourceEffort === undefined ? '' : args.sourceEffort
    );
    if (args.format === 'shell') {
      console.log(`${resolved.model}\t${resolved.effort}`);
    } else {
      console.log(JSON.stringify(resolved));
    }
    return;
  }

  const override = loadOverride(args.file);
  if (command === 'transform') {
    if (args.kind !== 'skill' && args.kind !== 'agent') throw new Error('transform requires --kind skill or agent');
    if (!args.name) throw new Error('transform requires --name');
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (input += chunk));
    process.stdin.on('end', () => {
      process.stdout.write(applyToText(override, args.kind, args.name, input));
    });
    return;
  }
  if (command === 'resolve-model') {
    if (args.kind !== 'agent') throw new Error('resolve-model currently requires --kind agent');
    if (!args.name) throw new Error('resolve-model requires --name');
    console.log(resolveModel(override, args.kind, args.name, args.input || ''));
    return;
  }
  if (command === 'resolve-effort') {
    console.log(resolveEffort(override, args.input || ''));
    return;
  }
  if (command === 'affects') {
    if ((args.kind !== 'skill' && args.kind !== 'agent') || !args.name || !args.source) {
      throw new Error('affects requires --source, --kind, and --name');
    }
    console.log(affects(override, args.source, args.kind, args.name) ? 'yes' : 'no');
    return;
  }
  throw new Error(`Unknown model override command: ${command || '(missing)'}`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  BUILTIN_CODEX_POLICY,
  applyToText,
  affects,
  loadOverride,
  resolveAgent,
  resolveEffort,
  resolveModel,
  validateOverride,
};
