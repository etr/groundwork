#!/usr/bin/env node
/**
 * WCAG 2.x contrast ratio checker.
 *
 * Usage:
 *   node lib/contrast-check.js "#FFFFFF" "#777777"
 *   node lib/contrast-check.js FFFFFF 777777
 *
 * Prints the contrast ratio and PASS/FAIL verdicts for normal text (4.5:1)
 * and large text (3:1). Exit code 0 only when both verdicts pass, so scripts
 * can chain on it; exit code 2 on bad input.
 *
 * Exists so reviewers verify contrast instead of eyeballing it: greys that
 * "look fine" routinely compute below AA (#777777 on white is 4.48:1).
 */

'use strict';

const NAMED_COLORS = {
  black: [0, 0, 0],
  white: [255, 255, 255],
};

/**
 * Parse a hex color (3- or 6-digit, '#' optional) or the names black/white.
 * @param {string} value
 * @returns {number[]} [r, g, b] channels in 0-255
 */
function parseColor(value) {
  const raw = String(value).trim();
  const hex = raw.replace(/^#/, '');
  const expanded = hex.length === 3 ? [...hex].map((ch) => ch + ch).join('') : hex;
  if (/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return [0, 2, 4].map((i) => parseInt(expanded.slice(i, i + 2), 16));
  }
  const named = NAMED_COLORS[raw.toLowerCase()];
  if (named) return named;
  throw new Error(`expected a hex color like #FFFFFF (or black/white), got ${JSON.stringify(value)}`);
}

/** Linearize one sRGB channel per WCAG 2.x. */
function linearize(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of an [r, g, b] color. */
function luminance(rgb) {
  const [r, g, b] = rgb.map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colors; order-independent. */
function contrastRatio(a, b) {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded ratio plus AA verdicts for normal (4.5:1) and large (3:1) text. */
function verdicts(ratio) {
  return {
    ratio: Math.round(ratio * 100) / 100,
    normalText: ratio >= 4.5,
    largeText: ratio >= 3,
  };
}

module.exports = { parseColor, linearize, luminance, contrastRatio, verdicts };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('usage: node lib/contrast-check.js <color1> <color2>');
    process.exit(2);
  }
  let result;
  try {
    result = verdicts(contrastRatio(parseColor(args[0]), parseColor(args[1])));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(2);
  }
  console.log(`ratio: ${result.ratio.toFixed(2)}:1`);
  console.log(`normal text (4.5:1): ${result.normalText ? 'PASS' : 'FAIL'}`);
  console.log(`large text  (3.0:1): ${result.largeText ? 'PASS' : 'FAIL'}`);
  process.exit(result.normalText && result.largeText ? 0 : 1);
}
