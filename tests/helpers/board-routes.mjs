// The board's /api route table, read from the dispatcher source, and which test
// files name each route. Shared by packages/board/route-inventory.test.mjs (the
// ratchet) and packages/board/api-sweep.test.mjs (the per-route sweep).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BOARD = path.join(ROOT, 'packages', 'board');
const SOURCES = [path.join(BOARD, 'lib', 'routes.mjs'), path.join(BOARD, 'server.mjs')];
const SELF = path.join(BOARD, 'route-inventory.test.mjs');

/** Every route the dispatcher matches, as `{ path, methods, prefix }`. */
export function routeInventory(sources = SOURCES) {
  const routes = new Map();
  const add = (p, method, prefix) => {
    const r = routes.get(p) || { path: p, methods: new Set(), prefix };
    r.methods.add(method || 'ANY');
    routes.set(p, r);
  };
  for (const file of sources) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const method = line.match(/req\.method\s*===\s*'([A-Z]+)'/)?.[1];
      for (const m of line.matchAll(/pathname\s*===\s*'(\/api\/[^']+)'/g)) add(m[1], method, false);
      for (const m of line.matchAll(/pathname\.startsWith\('(\/api\/[^']+\/)'\)/g)) add(m[1], method, true);
      // Grouped reads: ['/api/docs', '/api/doc', ...].includes(pathname)
      const group = line.match(/\[([^\]]*'\/api\/[^\]]*)\]\.includes\(pathname\)/);
      if (group) for (const m of group[1].matchAll(/'(\/api\/[^']+)'/g)) add(m[1], undefined, false);
    }
  }
  return [...routes.values()]
    .map((r) => ({ ...r, methods: [...r.methods].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function testFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(test|e2e\.test)\.mjs$|\.hurl$/.test(e.name) && full !== SELF) out.push(full);
    }
  };
  walk(path.join(ROOT, 'tests'));
  for (const f of fs.readdirSync(BOARD)) if (f.endsWith('.test.mjs')) out.push(path.join(BOARD, f));
  return out.filter((f) => f !== SELF);
}

/** Route path → test files that name it. */
export function routeCoverage(routes = routeInventory(), files = testFiles()) {
  const text = files.map((f) => [path.relative(ROOT, f), fs.readFileSync(f, 'utf8')]);
  return routes.map((r) => {
    // A path followed by another path character is a different route:
    // `/api/turns/diff` is not a reference to `/api/turns`.
    const re = new RegExp(r.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (r.prefix ? '' : '(?![A-Za-z0-9_/-])'));
    return { ...r, tests: text.filter(([, t]) => re.test(t)).map(([f]) => f) };
  });
}
