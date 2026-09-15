#!/usr/bin/env node
// SessionStart / Stop hook: put the project this session runs in on the board.
//
// `/start` writes .great_cto/PROJECT.md; the Stop at the end of that turn registers it,
// so a project appears in the board's switcher without anyone running
// `great-cto register`. SessionStart catches projects initialised before this hook
// existed. Registration rules live in scripts/lib/project-registry.mjs.
//
// Prints nothing (SessionStart output lands in the model's context) and always exits 0.
import { registerProject } from '../lib/project-registry.mjs';

let raw = '';
try {
  for await (const chunk of process.stdin) raw += chunk;
} catch { /* no stdin */ }

let payload = {};
try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch { payload = {}; }

const cwd = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const r = registerProject(cwd);
if (r.state === 'refused' || r.state === 'failed') {
  process.stderr.write(`great_cto: project not registered on the board — ${r.reason || r.error}\n`);
}
process.exit(0);
