#!/usr/bin/env node
// Bring up the databases a benchmark product's test suite expects, so a re-score
// measures the PRODUCT and not the absence of infrastructure.
//
// Why this exists: re-scoring the 2026-07 batch through the executing oracle
// produced ats 97/269 and portal 56/196, against 269/269 and 196/196 at
// collection time. Nothing regressed — the suites were talking to a Postgres
// that had no such role. Recording "the host was bare" as "the product is bad"
// is the same defect as the filename oracle, inverted.
//
// Products declare what they need in different places (a compose file, .env.test,
// .env.local, or only an .env.example), so discovery reads all of them and the
// caller gets one answer.
//
// Usage:
//   node scripts/bench-env.mjs <dir>...        provision what those products need
//   node scripts/bench-env.mjs <dir>... --print   show requirements, change nothing
//   node scripts/bench-env.mjs --down          stop clusters this script started
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

// Where throwaway clusters live. Kept out of the product dirs so a re-score never
// dirties the tree it is measuring.
export const CLUSTER_ROOT = path.join(os.homedir(), '.great_cto', 'bench-pg');

const ENV_CANDIDATES = ['.env.test', '.env.local', '.env', '.env.test.example', '.env.local.example', '.env.example'];
const DSN_RE = /postgres(?:ql)?:\/\/([^:/\s"'`]+):([^@\s"'`]*)@([^:/\s"'`]+):(\d+)\/([^\s"'`?]+)/;

/** Parse the first Postgres DSN out of a blob, ignoring commented lines. */
export function parseDsn(text = '') {
  const live = String(text).split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  const m = live.match(DSN_RE);
  if (!m) return null;
  return { user: m[1], password: m[2] || '', host: m[3], port: Number(m[4]), database: m[5] };
}

/**
 * What one product needs. Env files win over compose because they are what the
 * suite actually reads; compose is the fallback for products that only declare
 * services. Returns null when the product needs no server (pglite, unit-only).
 */
export function discoverRequirement(dir, readFile = (p) => fs.readFileSync(p, 'utf8'), exists = fs.existsSync) {
  for (const f of ENV_CANDIDATES) {
    const p = path.join(dir, f);
    if (!exists(p)) continue;
    const dsn = parseDsn(readFile(p));
    if (dsn) return { ...dsn, source: f, slug: path.basename(dir) };
  }
  for (const f of ['docker-compose.test.yml', 'docker-compose.yml']) {
    const p = path.join(dir, f);
    if (!exists(p)) continue;
    const t = readFile(p);
    const port = (t.match(/"(\d{4,5}):5432"/) || [])[1];
    const user = (t.match(/POSTGRES_USER:\s*(\S+)/) || [])[1];
    const database = (t.match(/POSTGRES_DB:\s*(\S+)/) || [])[1];
    const password = (t.match(/POSTGRES_PASSWORD:\s*(\S+)/) || [])[1] || '';
    if (port && user && database) {
      return { user, password, host: 'localhost', port: Number(port), database, source: f, slug: path.basename(dir) };
    }
  }
  return null;
}

/** Group requirements by port — one cluster serves every role/db on that port. */
export function groupByPort(reqs = []) {
  const byPort = new Map();
  for (const r of reqs.filter(Boolean)) {
    if (!byPort.has(r.port)) byPort.set(r.port, []);
    byPort.get(r.port).push(r);
  }
  return byPort;
}

/**
 * A declared port may already be occupied by a cluster we cannot administer —
 * a system Homebrew Postgres on 5432 with neither a `postgres` role nor a
 * reachable OS-user superuser is the common case. Fighting for that port means
 * either failing or corrupting somebody else's data, so instead we relocate:
 * keep the role and database the suite asks for, move it onto a port we own,
 * and hand the suite a DATABASE_URL pointing there.
 *
 * Pure: takes the set of ports we could not claim, returns the relocated plan.
 */
export function relocate(reqs = [], unusablePorts = new Set(), base = 5500) {
  const remap = new Map();
  let next = base;
  return reqs.filter(Boolean).map((r) => {
    if (!unusablePorts.has(r.port)) return { ...r, effectivePort: r.port, relocated: false };
    if (!remap.has(r.port)) remap.set(r.port, next++);
    return { ...r, effectivePort: remap.get(r.port), relocated: true };
  });
}

/** The DATABASE_URL a suite should run with, given its (possibly relocated) port. */
export function dsnFor(req) {
  const pw = req.password ? `:${req.password}` : ':';
  return `postgres://${req.user}${pw}@localhost:${req.effectivePort ?? req.port}/${req.database}`;
}

/**
 * An empty database is not a usable one. A reachable server with no schema fails
 * every integration test with 42P01 (relation does not exist), which reads
 * exactly like a broken product — leadcrm went 62/132 to 63/132 once connected,
 * because connecting was never the missing part.
 *
 * Pick the product's own migration script rather than guessing at a tool: the
 * repo declares how its schema is built, and running anything else risks writing
 * a schema the suite does not expect.
 */
export function migrationScript(pkgScripts = {}) {
  for (const name of ['db:migrate', 'db:push', 'migrate', 'db:setup', 'prisma:migrate']) {
    if (pkgScripts[name]) return name;
  }
  // Prisma projects often have no npm alias but always have the CLI.
  if (Object.values(pkgScripts).some((v) => /prisma/.test(String(v)))) return 'prisma:deploy';
  return null;
}

// ── provisioning (side effects) ─────────────────────────────────────────────

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const listening = (port) => sh('pg_isready', ['-h', 'localhost', '-p', String(port)]).status === 0;

function ensureCluster(port) {
  if (listening(port)) return { port, started: false, note: 'already listening' };
  const dir = path.join(CLUSTER_ROOT, `pg-${port}`);
  // A leftover empty directory is not a cluster — check for the control file,
  // not just the path, or initdb gets skipped and pg_ctl fails confusingly.
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const r = sh('initdb', ['-D', dir, '-U', 'postgres', '-A', 'trust']);
    if (r.status !== 0) return { port, started: false, error: (r.stderr || '').trim().split('\n').pop() };
  }
  const r = sh('pg_ctl', ['-D', dir, '-o', `-p ${port} -k /tmp`, '-l', path.join(CLUSTER_ROOT, `pg-${port}.log`), 'start']);
  for (let i = 0; i < 20 && !listening(port); i++) sh('sleep', ['0.5']);
  if (!listening(port)) return { port, started: false, error: (r.stderr || r.stdout || 'did not come up').trim() };
  return { port, started: true };
}

function provision(req) {
  const psql = (sql, db = 'postgres') =>
    sh('psql', ['-h', 'localhost', '-p', String(req.port), '-U', 'postgres', '-d', db, '-tAc', sql]);
  // Roles and databases are created separately: CREATE DATABASE cannot run in a
  // transaction block, and psql wraps multiple statements in one.
  if (req.user !== 'postgres') {
    const has = psql(`SELECT 1 FROM pg_roles WHERE rolname='${req.user}'`).stdout.trim();
    if (has !== '1') psql(`CREATE ROLE "${req.user}" LOGIN SUPERUSER PASSWORD '${req.password}'`);
  }
  const hasDb = psql(`SELECT 1 FROM pg_database WHERE datname='${req.database}'`).stdout.trim();
  if (hasDb !== '1') psql(`CREATE DATABASE "${req.database}" OWNER "${req.user}"`);
  const ok = psql('SELECT 1', req.database).status === 0;
  return { ...req, ready: ok };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const dirs = argv.filter((a) => !a.startsWith('--'));

  if (argv.includes('--down')) {
    if (!fs.existsSync(CLUSTER_ROOT)) { console.log('[bench-env] nothing to stop'); process.exit(0); }
    for (const d of fs.readdirSync(CLUSTER_ROOT).filter((f) => f.startsWith('pg-') && !f.endsWith('.log'))) {
      const r = sh('pg_ctl', ['-D', path.join(CLUSTER_ROOT, d), 'stop']);
      console.log(`[bench-env] ${d}: ${r.status === 0 ? 'stopped' : 'already down'}`);
    }
    process.exit(0);
  }

  if (!dirs.length) {
    console.error('usage: bench-env.mjs <product-dir>... [--print] [--down]');
    process.exit(2);
  }

  const reqs = dirs.map((d) => discoverRequirement(path.resolve(d)));
  dirs.forEach((d, i) => {
    const r = reqs[i];
    console.log(r
      ? `  ${path.basename(d).padEnd(12)} needs ${r.user}@:${r.port}/${r.database}  (from ${r.source})`
      : `  ${path.basename(d).padEnd(12)} needs no database server`);
  });
  if (argv.includes('--print')) process.exit(0);

  console.log('');
  // A port that is already listening but refuses our superuser is somebody
  // else's cluster. Detect that first so we relocate instead of failing.
  const unusable = new Set();
  for (const port of groupByPort(reqs).keys()) {
    if (!listening(port)) continue;
    const probe = sh('psql', ['-h', 'localhost', '-p', String(port), '-U', 'postgres', '-tAc', 'SELECT 1']);
    if (probe.status !== 0) {
      unusable.add(port);
      console.log(`  :${port} occupied by a cluster we cannot administer — relocating`);
    }
  }

  const planned = relocate(reqs, unusable);
  let failed = 0;
  const envLines = [];
  for (const [port, group] of groupByPort(planned.map((r) => ({ ...r, port: r.effectivePort })))) {
    const c = ensureCluster(port);
    if (c.error) { console.error(`  :${port} FAILED — ${c.error}`); failed += group.length; continue; }
    console.log(`  :${port} ${c.started ? 'started' : c.note || 'ready'}`);
    for (const req of group) {
      const done = provision(req);
      console.log(`    ${done.ready ? '✓' : '✗'} ${req.user}/${req.database}${req.relocated ? ' (relocated)' : ''}`);
      if (!done.ready) failed++;
      else envLines.push(`${req.slug}\t${dsnFor(req)}`);
    }
  }

  // Migrate each provisioned database with the product's OWN script — a reachable
  // but empty database fails every integration test with 42P01, which is
  // indistinguishable from a broken product.
  if (!argv.includes('--no-migrate')) {
    console.log('');
    for (const req of planned) {
      const dir = dirs.map((d) => path.resolve(d)).find((d) => path.basename(d) === req.slug);
      if (!dir) continue;
      let scripts = {};
      try { scripts = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts || {}; } catch { /* none */ }
      const script = migrationScript(scripts);
      if (!script) { console.log(`  ${req.slug.padEnd(12)} no migration script declared — skipping`); continue; }
      const env = { ...process.env, DATABASE_URL: dsnFor(req) };
      const r = script === 'prisma:deploy'
        ? sh('npx', ['prisma', 'migrate', 'deploy'], { cwd: dir, env, timeout: 180000 })
        : sh('npm', ['run', script, '--silent'], { cwd: dir, env, timeout: 180000 });
      console.log(`  ${req.slug.padEnd(12)} ${script}: ${r.status === 0 ? '✓ migrated' : '✗ ' + (r.stderr || r.stdout || '').trim().split('\n').pop()?.slice(0, 90)}`);
      if (r.status !== 0) failed++;
    }
  }

  if (envLines.length) {
    console.log('\n# DATABASE_URL per product — export before running its suite:');
    for (const l of envLines) console.log(`  ${l}`);
    const out = path.join(CLUSTER_ROOT, 'dsn.tsv');
    try { fs.writeFileSync(out, envLines.join('\n') + '\n'); console.log(`\n  written to ${out}`); } catch { /* best-effort */ }
  }
  process.exit(failed ? 1 : 0);
}
