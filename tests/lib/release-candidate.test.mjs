import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluateCandidateManifest as evaluate } from '../../scripts/lib/release-candidate.mjs';

// All identities and digests are synthetic labels, never provenance evidence.
const fixture = () => ({
  buildRecordSha256: ['b'.repeat(64), 'c'.repeat(64)], channel: 'stable',
  fileManifestSha256: '9'.repeat(64), lockfileSha256: '6'.repeat(64),
  package: { name: 'release-fixture', version: '1.2.3' }, policySha256: '4'.repeat(64),
  repository: { id: '123456', url: 'https://github.com/example/release-fixture' },
  reviewEvidenceSha256: ['d'.repeat(64)], sbomSha256: 'a'.repeat(64), schemaVersion: 1,
  source: { commit: '1'.repeat(40), tagTarget: '1'.repeat(40), tree: '2'.repeat(40) },
  tarball: { bytes: 100, sha256: '8'.repeat(64), sri: 'sha512-' + 'A'.repeat(86) + '==' },
  testPolicySha256: '7'.repeat(64), toolchainSha256: '5'.repeat(64),
  workflow: {
    certificateIdentity: 'https://github.com/example/release-fixture/.github/workflows/publish.yml@refs/tags/v1.2.3',
    issuer: 'https://token.actions.githubusercontent.com', path: '.github/workflows/publish.yml',
    ref: 'refs/tags/v1.2.3', sha256: '3'.repeat(64),
  },
});
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
};
const policy = () => {
  const c = fixture();
  return { channel: c.channel, lockfileSha256: c.lockfileSha256, package: c.package,
    policySha256: c.policySha256, repository: c.repository, source: c.source,
    testPolicySha256: c.testPolicySha256, toolchainSha256: c.toolchainSha256, workflow: c.workflow };
};
const wire = () => canonical(fixture());
const expected = () => canonical(policy());
const refuse = (candidate, reason = 'SCHEMA_INVALID', ...policies) =>
  assert.deepEqual(evaluate(candidate, policies.length ? policies[0] : expected()), { status: 'REFUSED', reason });
const mutate = (fn, reason = 'SCHEMA_INVALID') => {
  const c = fixture(); fn(c); refuse(canonical(c), reason);
};
const success = c => {
  const raw = canonical(c);
  assert.deepEqual(evaluate(raw, expected()), {
    status: 'LOCAL_FIXTURE_VALIDATED', evidenceKind: 'SYNTHETIC_ONLY', authority: 'NONE',
    releaseEligibility: 'NOT_CHECKED', candidateId: createHash('sha256').update(raw).digest('hex'),
    canonicalJson: raw,
  });
};

test('F01 accepts exact canonical strings and UTF8 Buffers', () => {
  success(fixture());
  assert.deepEqual(evaluate(Buffer.from(wire()), Buffer.from(expected())), evaluate(wire(), expected()));
});

test('F02 refuses whitespace, alternate key order and BOM without normalization', () => {
  for (const raw of [' ' + wire(), wire() + '\n', JSON.stringify(fixture(), null, 2),
    wire().replace('"bytes":100', '"bytes":1e2'), wire().replace('"bytes":100', '"bytes":100.0'),
    wire().replace('"stable"', '"st\\u0061ble"'),
    JSON.stringify(Object.fromEntries(Object.entries(fixture()).reverse()))]) {
    refuse(raw, 'NONCANONICAL_JSON');
  }
  refuse('\ufeff' + wire(), 'INVALID_JSON');
  refuse(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(wire())]), 'INVALID_JSON');
});

test('F03 rejects duplicate root, nested and escaped keys', () => {
  for (const raw of [wire().replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    wire().replace('"id":"123456"', '"id":"123456","id":"123456"'),
    wire().replace('"schemaVersion":1', '"schemaVersion":1,"\\u0073chemaVersion":1')]) {
    refuse(raw, 'NONCANONICAL_JSON');
  }
});

test('F04 rejects malformed syntax and UTF8, and schema-refuses canonical lone surrogates', () => {
  for (const raw of ['{', wire() + 'x', '', Buffer.from([0xc3, 0x28]),
    Buffer.from([0xed, 0xa0, 0x80]), Buffer.from([0xc0, 0xaf])]) refuse(raw, 'INVALID_JSON');
  for (const value of ['\ud800', '\udfff']) mutate(c => { c.workflow.path = value; });
  mutate(c => { c['\ud800'] = 1; });
});

test('F05 refuses unknown and prototype keys at every object level', () => {
  for (const path of [null, 'repository', 'source', 'package', 'workflow', 'tarball']) {
    for (const key of ['unexpected', '__proto__', 'constructor', 'prototype']) {
      mutate(c => { Object.defineProperty(path ? c[path] : c, key, { value: true, enumerable: true }); });
    }
  }
});

test('F06 requires exactly the versioned schema at root and nested levels', () => {
  for (const version of ['1', 0, 2, null]) mutate(c => { c.schemaVersion = version; });
  for (const key of Object.keys(fixture())) mutate(c => { delete c[key]; });
  for (const path of ['repository', 'source', 'package', 'workflow', 'tarball']) {
    for (const key of Object.keys(fixture()[path])) mutate(c => { delete c[path][key]; });
    for (const value of [null, [], true, 'record']) mutate(c => { c[path] = value; });
  }
  for (const raw of ['null', '[]', '1', 'true', '"text"']) refuse(raw);
});

test('F07 bounds raw bytes, nesting and UTF8 string bytes at N and N+1', () => {
  // At-limit invalid shapes reach the schema; only N+1 receives LIMIT_EXCEEDED.
  refuse(' '.repeat(65532) + 'null', 'NONCANONICAL_JSON');
  refuse(' '.repeat(65533) + 'null', 'LIMIT_EXCEEDED');
  refuse('x'.repeat(65536), 'INVALID_JSON');
  refuse('x'.repeat(65537), 'LIMIT_EXCEEDED');
  refuse('['.repeat(16) + '0' + ']'.repeat(16));
  refuse('['.repeat(17) + '0' + ']'.repeat(17), 'LIMIT_EXCEEDED');
  refuse(JSON.stringify('é'.repeat(1024)));
  refuse(JSON.stringify('é'.repeat(1024) + 'x'), 'LIMIT_EXCEEDED');
  refuse(canonical({ ['x'.repeat(2049)]: 0 }), 'LIMIT_EXCEEDED');
  refuse(canonical({ value: 'brackets [ { ] } and quote " with escape \\' }));
});

test('F08 enforces safe integers and canonical positive repository IDs', () => {
  for (const bytes of [0, -1, 0.5, 1073741825, 9007199254740992, '100', null]) {
    mutate(c => { c.tarball.bytes = bytes; });
  }
  for (const bytes of [1, 1073741824]) { const c = fixture(); c.tarball.bytes = bytes; success(c); }
  for (const id of ['0', '01', '-1', '1e2', '1.0', '1'.repeat(21), 123456]) {
    mutate(c => { c.repository.id = id; });
  }
  mutate(c => { c.source.tagTarget = 'f'.repeat(40); });
});

test('F09 checks every digest and canonical sha512 SRI without authenticating them', () => {
  for (const key of ['fileManifestSha256', 'lockfileSha256', 'policySha256', 'sbomSha256',
    'testPolicySha256', 'toolchainSha256']) {
    for (const value of ['A'.repeat(64), 'f'.repeat(63), 'g'.repeat(64), null]) mutate(c => { c[key] = value; });
  }
  for (const [path, key] of [['tarball', 'sha256'], ['workflow', 'sha256'],
    ['source', 'commit'], ['source', 'tree'], ['source', 'tagTarget']]) {
    mutate(c => { c[path][key] = 'short'; });
  }
  for (const sri of ['sha256-' + 'A'.repeat(86) + '==', 'sha512-' + 'A'.repeat(86),
    'sha512-' + 'A'.repeat(85) + 'B==', 'sha512-' + 'A'.repeat(86) + '==\n',
    'sha512-' + Buffer.alloc(63).toString('base64')]) mutate(c => { c.tarball.sri = sri; });
});

test('F10 binds every independent expected identity tuple field', () => {
  const changes = [c => { c.channel = 'beta'; }, c => { c.repository.id = '654321'; },
    c => { c.source.commit = c.source.tagTarget = 'e'.repeat(40); },
    c => { c.source.tree = 'e'.repeat(40); }, c => { c.package.name = 'other-fixture'; },
    c => { c.package.version = '1.2.4'; c.workflow.ref = 'refs/tags/v1.2.4';
      c.workflow.certificateIdentity = c.repository.url + '/' + c.workflow.path + '@' + c.workflow.ref; },
    c => { c.repository.url = 'https://github.com/other/release-fixture';
      c.workflow.certificateIdentity = c.repository.url + '/' + c.workflow.path + '@' + c.workflow.ref; },
    c => { c.workflow.path = '.github/workflows/other.yaml';
      c.workflow.certificateIdentity = c.repository.url + '/' + c.workflow.path + '@' + c.workflow.ref; },
    c => { c.workflow.issuer = 'https://issuer.example'; },
    ...['lockfileSha256', 'policySha256', 'testPolicySha256', 'toolchainSha256']
      .map(key => c => { c[key] = 'e'.repeat(64); }),
    c => { c.workflow.sha256 = 'e'.repeat(64); }];
  for (const change of changes) mutate(change, 'IDENTITY_MISMATCH');
});

test('F11 requires a separate canonical policy and never invokes caller accessors', () => {
  let calls = 0;
  const hostile = { get toJSON() { calls++; throw Error('must not execute'); },
    toString() { calls++; throw Error('must not coerce'); } };
  const proxy = new Proxy({}, { getPrototypeOf() { calls++; return null; },
    get() { calls++; throw Error('must not access'); } });
  refuse(hostile, 'INVALID_JSON');
  refuse(proxy, 'INVALID_JSON');
  refuse(Object.create(Buffer.prototype), 'INVALID_JSON');
  const proxiedPrototype = new Proxy(Buffer.prototype, { getPrototypeOf() { calls++; return null; } });
  const bufferWithProxy = Object.setPrototypeOf(Buffer.from(wire()), proxiedPrototype);
  refuse(bufferWithProxy, 'INVALID_JSON');
  const buffer = Buffer.from(wire());
  for (const key of ['buffer', 'byteOffset', 'byteLength', 'toString']) {
    Object.defineProperty(buffer, key, { get() { calls++; throw Error('must not access'); } });
  }
  assert.equal(evaluate(buffer, expected()).status, 'LOCAL_FIXTURE_VALIDATED');
  for (const bad of [undefined, null, {}, hostile, proxy, Object.create(Buffer.prototype), wire(), '{', expected() + '\n',
    Buffer.from([0xc3, 0x28]), '\ufeff' + expected(), ' '.repeat(65537)]) {
    refuse(wire(), 'POLICY_INVALID', bad);
  }
  assert.equal(calls, 0);
  for (const key of Object.keys(policy())) {
    const p = policy(); delete p[key]; refuse(wire(), 'POLICY_INVALID', canonical(p));
  }
  for (const change of [p => { p.unknown = true; }, p => { p.workflow.ref = 'refs/heads/main'; },
    p => { p.workflow.certificateIdentity = 'https://github.com/.*'; },
    p => { p.repository.id = '01'; }, p => { p.workflow.path = '\ud800'; }]) {
    const p = policy(); change(p); refuse(wire(), 'POLICY_INVALID', canonical(p));
  }
});

test('F12 rejects unsafe, percent-encoded, non-NFC and non-workflow paths', () => {
  for (const path of ['/publish.yml', '../publish.yml', './publish.yml',
    '.github//workflows/publish.yml', '.github/workflows/../publish.yml',
    '.github\\workflows\\publish.yml', '.github/workflows/%70ublish.yml',
    '.github/workflows/publish\u0000.yml', '.github/workflows/e\u0301.yml',
    '~/.github/workflows/publish.yml', 'C:/publish.yml', '.github/workflows/sub/publish.yml',
    '.github/workflows/publish.txt', '.github/workflows/publish.yml/']) mutate(c => { c.workflow.path = path; });
});

test('F13 validates package, immutable ref, channel and literal public HTTPS identity syntax', () => {
  for (const version of ['^1.2.3', '1.2.3+build', '01.2.3', '1.2', '1.2.3-01', 'latest', '1.2.3-', '1.2.3\n']) {
    mutate(c => { c.package.version = version; });
  }
  for (const name of ['Uppercase', '../private', '.hidden', '_hidden', '@scope/', '@scope/Upper',
    'name space', 'n'.repeat(215), 'release-fixture\n']) mutate(c => { c.package.name = name; });
  mutate(c => { c.channel = 'dev'; });
  for (const url of ['http://github.com/example/release-fixture',
    'https://user:pass@github.com/example/release-fixture',
    'https://github.com/example/release-fixture?', 'https://github.com/example/release-fixture#x',
    'https://github.com/example/release-fixture/', 'https://github.com/../release-fixture',
    'https://github.com/example/.', 'https://github.com/example/%72elease-fixture']) {
    mutate(c => { c.repository.url = url; });
  }
  for (const issuer of ['http://issuer.example', 'https://a:b@issuer.example',
    'https://issuer.example?x=1', 'https://issuer.example#x', 'https://*.example']) {
    mutate(c => { c.workflow.issuer = issuer; });
  }
  mutate(c => { c.workflow.ref = 'refs/heads/main'; });
  mutate(c => { c.workflow.certificateIdentity = 'https://github.com/.*'; });
  mutate(c => { c.workflow.path += '\n'; c.workflow.certificateIdentity = c.repository.url + '/' + c.workflow.path + '@' + c.workflow.ref; });
  mutate(c => { c.repository.url += '\n'; c.workflow.certificateIdentity = c.repository.url + '/' + c.workflow.path + '@' + c.workflow.ref; });
});

test('F14 enforces sorted distinct build and review digest counts', () => {
  for (const list of [[], ['b'.repeat(64)], ['b'.repeat(64), 'b'.repeat(64)],
    ['c'.repeat(64), 'b'.repeat(64)], ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]]) {
    mutate(c => { c.buildRecordSha256 = list; });
  }
  for (const list of [[], ['d'.repeat(64), 'd'.repeat(64)], ['e'.repeat(64), 'd'.repeat(64)],
    Array.from({ length: 17 }, (_, i) => i.toString(16).padStart(64, '0'))]) {
    mutate(c => { c.reviewEvidenceSha256 = list; });
  }
  const c = fixture(); c.reviewEvidenceSha256 = Array.from({ length: 16 }, (_, i) => i.toString(16).padStart(64, '0'));
  success(c);
});

test('F15 changing an artifact hash changes identity but grants no verification', () => {
  const c = fixture(); c.tarball.sha256 = 'e'.repeat(64); success(c);
  assert.notEqual(evaluate(canonical(c), expected()).candidateId, evaluate(wire(), expected()).candidateId);
});

test('F16 frozen canonical candidate ID is deterministic and independent of Buffer mutation', () => {
  const digest = '789f49b50db3f1905ec3a75ac10863925402e1160b74d91507ea7863d7ee5c05';
  const raw = Buffer.from(wire());
  const first = evaluate(raw, expected()); raw.fill(0);
  assert.equal(first.candidateId, digest);
  assert.equal(first.canonicalJson, wire());
  for (let i = 0; i < 3; i++) assert.deepEqual(evaluate(wire(), expected()), first);
});

test('F17 refusals expose only fixed enums, with no private or secret canary', () => {
  const canary = 'PRIVATE_CANARY_DO_NOT_ECHO';
  const c = fixture(); c.private = canary;
  const result = evaluate(canonical(c), expected());
  assert.deepEqual(result, { status: 'REFUSED', reason: 'SCHEMA_INVALID' });
  assert.equal(JSON.stringify(result).includes(canary), false);
  const ok = evaluate(wire(), expected());
  assert.equal(ok.authority, 'NONE'); assert.equal(ok.releaseEligibility, 'NOT_CHECKED');
  assert.equal(ok.evidenceKind, 'SYNTHETIC_ONLY');
  assert.equal(JSON.stringify(ok).includes('PREPUBLICATION_ELIGIBLE'), false);
});

test('F18 import and evaluation work in an IO-free realm with only SHA256 capability', () => {
  const source = readFileSync(new URL('../../scripts/lib/release-candidate.mjs', import.meta.url), 'utf8');
  const harness = `
    import vm from 'node:vm';
    import { createHash } from 'node:crypto';
    import { types } from 'node:util';
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const context = vm.createContext({ Buffer, TextDecoder, URL });
    const module = new vm.SourceTextModule(input.source, { context });
    await module.link(specifier => {
      const exports = specifier === 'node:crypto' ? { createHash }
        : specifier === 'node:util' ? { types, TextDecoder } : null;
      if (!exports) throw Error('Forbidden capability');
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    await module.evaluate();
    const result = module.namespace.evaluateCandidateManifest(input.wire, input.policy);
    if (result.status !== 'LOCAL_FIXTURE_VALIDATED') throw Error('sandbox validation failed');
    if (module.namespace.evaluateCandidateManifest('{', input.policy).reason !== 'INVALID_JSON')
      throw Error('sandbox refusal failed');
  `;
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', harness],
    { input: JSON.stringify({ source, wire: wire(), policy: expected() }), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
});
