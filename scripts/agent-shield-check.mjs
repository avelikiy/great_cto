#!/usr/bin/env node
// The gate's entry into agent-shield: scan this repository's own agent
// configuration and fail on anything blocking.
//
// Exit codes, three of them, because "could not scan" is not "scanned clean":
//   0  ok            nothing blocking (advisory findings are printed, not fatal)
//   1  blocked       a blocking finding
//   2  unscannable   a section could not be read — investigate, do not shrug
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shieldReport, formatShield } from './lib/agent-shield.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = shieldReport({
  manifestPath: path.join(ROOT, '.claude-plugin/plugin.json'),
  agentsDir: path.join(ROOT, 'agents'),
});
console.log(formatShield(r));
process.exit(r.state === 'blocked' ? 1 : r.state === 'unscannable' ? 2 : 0);
