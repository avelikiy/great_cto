// The board's HTTP contract (packages/board/openapi.json): a board on a throwaway
// project, a bounded request helper, and a small JSON-Schema subset — enough to
// say "this response still has the shape the contract records" without a new
// dependency. Used by scripts/board-openapi.mjs (writes the contract) and
// packages/board/openapi-contract.test.mjs (checks the live board against it).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { startServerOnFreePort } from './board-start.mjs';
import { reap } from './reap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SERVER = join(ROOT, 'packages', 'board', 'server.mjs');
export const CONTRACT = join(ROOT, 'packages', 'board', 'openapi.json');

/** A git project with one gate in tasks.md, and an empty HOME next to it. */
export function sweepProject(track) {
  const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); track?.(d); return d; };
  const home = tmp('gcto-contract-home-');
  const dir = tmp('gcto-contract-proj-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(dir, 'app.js'), 'export const x = 1;\n');
  git('add', '.'); git('commit', '-q', '-m', 'init');
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  writeFileSync(join(dir, '.great_cto', 'tasks.md'),
    '# Tasks\n\n| ID | Title | Status | Labels |\n|---|---|---|---|\n| g-plan | gate:plan — decomposition | open | gate |\n');
  return { home, dir };
}

/** Start a board on a fresh sweep project. `close()` stops it and removes both directories. */
export async function startContractBoard() {
  const dirs = [];
  const p = sweepProject((d) => dirs.push(d));
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd: p.dir, readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
    env: { HOME: p.home, USERPROFILE: p.home, GREAT_CTO_NO_UPDATE_CHECK: '1', GREAT_CTO_NO_BOARD: '1' },
  });
  return {
    port, proc,
    close: async () => { await reap(proc); for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); },
  };
}

/**
 * One request with a deadline. The event stream never ends, so a response whose
 * headers arrived is enough. `json` is the parsed body, or undefined.
 */
export async function call(port, path, init = {}, ms = 20000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, signal: ac.signal });
    const status = r.status;
    const type = r.headers.get('content-type') || '';
    const body = type.includes('event-stream') ? '' : await r.text();
    let json;
    if (type.includes('json')) { try { json = JSON.parse(body); } catch { /* recorded as not JSON */ } }
    return { status, type, body, json };
  } catch (e) {
    return { status: 0, type: '', body: String(e && e.name === 'AbortError' ? `no answer in ${ms} ms` : e) };
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

/**
 * The shape of one observed value, `depth` levels deep: type, the keys an
 * object had, the shape of an array's first item. Deeper than that is left open.
 */
export function inferSchema(value, depth = 2) {
  const t = typeOf(value);
  if (t === 'integer') return { type: 'number' };
  if (t === 'null') return {};
  if (t === 'array') return depth > 0 && value.length ? { type: 'array', items: value.map((v) => inferSchema(v, depth - 1)).reduce(merge) } : { type: 'array' };
  if (t !== 'object') return { type: t };
  if (depth <= 0) return { type: 'object' };
  const keys = Object.keys(value).sort();
  return {
    type: 'object',
    required: keys,
    properties: Object.fromEntries(keys.map((k) => [k, inferSchema(value[k], depth - 1)])),
  };
}

/** One schema both observations fit: a key is required only if both had it. */
function merge(a, b) {
  if (!a.type || a.type !== b.type) return {};
  if (a.type === 'array') return a.items && b.items ? { type: 'array', items: merge(a.items, b.items) } : { type: 'array' };
  if (a.type !== 'object' || !a.properties || !b.properties) return { type: a.type };
  const keys = [...new Set([...Object.keys(a.properties), ...Object.keys(b.properties)])].sort();
  return {
    type: 'object',
    required: a.required.filter((k) => b.required.includes(k)),
    properties: Object.fromEntries(keys.map((k) => [k, a.properties[k] && b.properties[k] ? merge(a.properties[k], b.properties[k]) : (a.properties[k] || b.properties[k])])),
  };
}

/** Every way `value` breaks `schema`, as `path: problem` lines. Empty = conforms. */
export function validate(schema, value, path = '$') {
  if (!schema || !schema.type) return [];
  const t = typeOf(value);
  const ok = schema.type === 'number' ? (t === 'number' || t === 'integer') : t === schema.type;
  if (!ok) return [`${path}: expected ${schema.type}, got ${t}`];
  const out = [];
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) out.push(`${path}.${k}: missing`);
    for (const [k, s] of Object.entries(schema.properties || {})) {
      if (k in value && value[k] !== null) out.push(...validate(s, value[k], `${path}.${k}`));
    }
  }
  if (t === 'array' && schema.items) value.forEach((v, i) => out.push(...validate(schema.items, v, `${path}[${i}]`)));
  return out;
}

/** The contract's name for a route; a prefix route takes any tail. */
export const contractPath = (r) => (r.prefix ? `${r.path}{rest}` : r.path);
/** The URL a probe requests: a prefix route gets a tail that names nothing. */
export const probePath = (r) => (r.prefix ? `${r.path}x` : r.path);
