// The board stopped answering for about four minutes — even /api/heartbeat —
// while three `bd list` children hung. Every bd call had a 20 s timeout, but a
// synchronous spawn's timeout sends SIGTERM and then WAITS for the child to exit;
// a bd that does not exit on SIGTERM (it holds a dolt lock) holds the whole
// event loop for as long as it likes. Measured: 1 s timeout, 6.9 s return.
// SIGKILL cannot be ignored, so the timeout is a timeout again.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bd-sigterm-')));
after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
const stubborn = path.join(dir, 'bd');
fs.writeFileSync(stubborn, "#!/usr/bin/env bash\ntrap '' TERM\nsleep 8\necho '[]'\n", { mode: 0o755 });

test('a bd that ignores SIGTERM is still stopped at the timeout', async () => {
  process.env.GREAT_CTO_BD_BIN = stubborn; // read once, when lib/beads.mjs loads
  const { bd } = await import(`./lib/beads.mjs?sigterm=${Date.now()}`);
  const t0 = Date.now();
  const r = bd(['list', '--json'], { timeout: 800 });
  const took = Date.now() - t0;
  assert.ok(took < 3000, `returned after ${took} ms — the timeout did not hold`);
  assert.equal(r.signal, 'SIGKILL');
});

// The same synchronous shape lives in scripts/lib. A scan holds it there.
// A real call: the program, then an argument list or a variable — not prose in a comment.
const BD_SYNC = /(?:spawnSync|execFileSync)\(\s*(?:'bd'|"bd"|BD_BIN)\s*,\s*[\[A-Za-z][\s\S]{0,400}?\)/g;
function unkillable(file) {
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(BD_SYNC)].filter((m) => !/killSignal:\s*'SIGKILL'/.test(m[0])).length;
}
const FILES = ['packages/board/lib/beads.mjs', 'scripts/lib/gate-check.mjs', 'scripts/lib/gate-state.mjs', 'scripts/lib/trace.mjs'];

test('every synchronous bd call kills with SIGKILL', () => {
  for (const f of FILES) assert.equal(unkillable(path.join(REPO, f)), 0, f);
});

test('the scan catches a synchronous bd call without SIGKILL', () => {
  const bad = path.join(dir, 'bad.mjs');
  fs.writeFileSync(bad, "const out = execFileSync('bd', ['list', '--json'], { encoding: 'utf8', timeout: 20000 });\n");
  assert.equal(unkillable(bad), 1);
});
