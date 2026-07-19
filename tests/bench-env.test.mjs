// Discovery of what a benchmark product's suite needs before it can be scored.
//
// Re-scoring the 2026-07 batch produced ats 97/269 and portal 56/196 against
// 269/269 and 196/196 at collection time. Nothing had regressed — the suites
// were talking to a Postgres with no such role. Recording "the host was bare" as
// "the product is bad" is the filename oracle's defect, inverted.
//
// Only the pure half is tested here: no cluster is started, nothing is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDsn, discoverRequirement, groupByPort } from '../scripts/bench-env.mjs';

/** Build a fake product dir from a { filename: contents } map. */
function fakeProduct(files) {
  const exists = (p) => Object.keys(files).some((f) => p.endsWith(f));
  const read = (p) => {
    const hit = Object.keys(files).find((f) => p.endsWith(f));
    if (!hit) throw new Error(`ENOENT ${p}`);
    return files[hit];
  };
  return { exists, read };
}

test('parseDsn pulls user, password, port and database', () => {
  const d = parseDsn('DATABASE_URL=postgresql://portal:portal@localhost:5439/portal_test');
  assert.deepEqual(d, { user: 'portal', password: 'portal', host: 'localhost', port: 5439, database: 'portal_test' });
});

test('parseDsn ignores commented-out lines', () => {
  const text = [
    '# DATABASE_URL=postgres://wrong:wrong@localhost:9999/wrong',
    'DATABASE_URL=postgres://right:pw@localhost:5432/right_db',
  ].join('\n');
  assert.equal(parseDsn(text).database, 'right_db');
});

test('parseDsn survives a query string and an empty password', () => {
  const d = parseDsn('postgres://u:@localhost:5432/db?sslmode=require');
  assert.equal(d.database, 'db', 'query string is not swallowed into the db name');
  assert.equal(d.password, '');
});

test('parseDsn returns null when there is no DSN', () => {
  assert.equal(parseDsn('AUTH_SECRET=nope\n'), null);
  assert.equal(parseDsn(''), null);
});

test('env files win over compose — they are what the suite actually reads', () => {
  const p = fakeProduct({
    '.env.test': 'DATABASE_URL=postgres://portal:portal@localhost:5439/portal_test',
    'docker-compose.test.yml': 'POSTGRES_USER: other\nPOSTGRES_DB: other_db\nports:\n  - "5999:5432"',
  });
  const r = discoverRequirement('/x/portal', p.read, p.exists);
  assert.equal(r.database, 'portal_test');
  assert.equal(r.port, 5439);
  assert.equal(r.source, '.env.test');
});

test('compose is the fallback when no env file declares a DSN', () => {
  const p = fakeProduct({
    'docker-compose.test.yml': 'POSTGRES_USER: postgres\nPOSTGRES_PASSWORD: postgres\nPOSTGRES_DB: a2_booking_test\nports:\n  - "5434:5432"',
  });
  const r = discoverRequirement('/x/classes', p.read, p.exists);
  assert.equal(r.user, 'postgres');
  assert.equal(r.database, 'a2_booking_test');
  assert.equal(r.port, 5434);
  assert.match(r.source, /compose/);
});

test('an .example file is used when nothing better exists', () => {
  const p = fakeProduct({ '.env.local.example': 'DATABASE_URL=postgres://postgres:postgres@localhost:5432/leadcrm' });
  const r = discoverRequirement('/x/leadcrm', p.read, p.exists);
  assert.equal(r.database, 'leadcrm');
  assert.equal(r.source, '.env.local.example');
});

test('a product needing no server reports null, not a guess', () => {
  const p = fakeProduct({ 'package.json': '{"name":"coaching"}', '.env': 'AUTH_SECRET=x' });
  assert.equal(discoverRequirement('/x/coaching', p.read, p.exists), null,
    'pglite / unit-only products must not have a database invented for them');
});

test('requirements are grouped per port — one cluster serves many roles', () => {
  const reqs = [
    { slug: 'ats', user: 'ats_app', database: 'ats', port: 5432 },
    { slug: 'leadcrm', user: 'postgres', database: 'leadcrm', port: 5432 },
    { slug: 'portal', user: 'portal', database: 'portal_test', port: 5439 },
    null,
  ];
  const g = groupByPort(reqs);
  assert.equal(g.size, 2, 'two distinct ports');
  assert.equal(g.get(5432).length, 2, 'both 5432 products share one cluster');
  assert.equal(g.get(5439).length, 1);
});

test('grouping drops products that need nothing', () => {
  assert.equal(groupByPort([null, null]).size, 0);
  assert.equal(groupByPort([]).size, 0);
});

// ── relocation (a declared port we cannot administer) ───────────────────────

test('relocation keeps role and database, moves only the port', async () => {
  const { relocate, dsnFor } = await import('../scripts/bench-env.mjs');
  const reqs = [
    { slug: 'ats', user: 'ats_app', password: 'pw', database: 'ats', port: 5432 },
    { slug: 'portal', user: 'portal', password: 'portal', database: 'portal_test', port: 5439 },
  ];
  const out = relocate(reqs, new Set([5432]), 5500);
  const ats = out.find(r => r.slug === 'ats');
  assert.equal(ats.relocated, true);
  assert.equal(ats.effectivePort, 5500, 'moved onto a port we own');
  assert.equal(ats.user, 'ats_app', 'role unchanged — the suite still asks for it');
  assert.equal(ats.database, 'ats', 'database unchanged');
  assert.match(dsnFor(ats), /ats_app:pw@localhost:5500\/ats/);

  const portal = out.find(r => r.slug === 'portal');
  assert.equal(portal.relocated, false, 'a usable port is left alone');
  assert.equal(portal.effectivePort, 5439);
});

test('products sharing an unusable port land on the SAME relocated cluster', async () => {
  const { relocate } = await import('../scripts/bench-env.mjs');
  const out = relocate([
    { slug: 'ats', user: 'a', database: 'ats', port: 5432 },
    { slug: 'leadcrm', user: 'postgres', database: 'leadcrm', port: 5432 },
    { slug: 'dispatch', user: 'd', database: 'dispatch', port: 5434 },
  ], new Set([5432, 5434]), 5500);
  const ports = Object.fromEntries(out.map(r => [r.slug, r.effectivePort]));
  assert.equal(ports.ats, ports.leadcrm, 'one relocated cluster serves both');
  assert.notEqual(ports.dispatch, ports.ats, 'a different declared port gets a different cluster');
});

test('dsnFor handles an empty password without producing a broken URL', async () => {
  const { dsnFor } = await import('../scripts/bench-env.mjs');
  assert.match(dsnFor({ user: 'u', password: '', database: 'db', port: 5500 }),
    /^postgres:\/\/u:@localhost:5500\/db$/);
});

test('migrationScript prefers the product\'s own declared script', async () => {
  const { migrationScript } = await import('../scripts/bench-env.mjs');
  assert.equal(migrationScript({ 'db:migrate': 'tsx db/migrate.ts', 'db:push': 'x' }), 'db:migrate');
  assert.equal(migrationScript({ 'db:push': 'drizzle-kit push' }), 'db:push');
  assert.equal(migrationScript({ build: 'tsc' }), null, 'no guessing when nothing is declared');
});

test('a prisma project with no npm alias still gets a migration path', async () => {
  const { migrationScript } = await import('../scripts/bench-env.mjs');
  assert.equal(migrationScript({ postinstall: 'prisma generate' }), 'prisma:deploy');
});
