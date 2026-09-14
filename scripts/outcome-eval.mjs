#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendOutcome, evaluateReleaseRegression, outcomeEvaluation } from './lib/outcome-eval.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'status';
const value = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1];
};
const cwd = resolve(value('--cwd') || process.cwd());

function output(result, code = 0) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = code;
}

if (command === 'status') {
  const result = outcomeEvaluation(cwd);
  output(result, args.includes('--strict') && result.state !== 'measured' ? 1 : 0);
} else if (command === 'record') {
  const source = value('--json');
  if (!source) throw new Error('record requires --json with one outcome object');
  const result = appendOutcome(cwd, JSON.parse(source));
  output(result, ['appended', 'duplicate'].includes(result.state) ? 0 : 1);
} else if (command === 'gate') {
  const baselinePath = value('--baseline');
  const candidatePath = value('--candidate');
  if (!baselinePath || !candidatePath) throw new Error('gate requires --baseline and --candidate JSON files');
  const rows = (file) => {
    const parsed = JSON.parse(readFileSync(resolve(file), 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.outcomes)) return parsed.outcomes;
    throw new Error(`${file} must contain an outcome array or { outcomes: [] }`);
  };
  const result = evaluateReleaseRegression(rows(baselinePath), rows(candidatePath));
  output(result, result.passed ? 0 : 1);
} else {
  throw new Error(`unknown command: ${command}`);
}
