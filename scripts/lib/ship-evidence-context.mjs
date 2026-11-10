import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { devNull } from 'node:os';
import { stableDigest } from './ship-evidence-identity.mjs';
import { requiredReviewers, REVIEWERS_BY_ARCHETYPE, PACK_REVIEWERS, COMPLIANCE_REVIEWERS } from './required-reviewers.mjs';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const sha = s => createHash('sha256').update(s).digest('hex');
const id = s => typeof s === 'string' && Buffer.byteLength(s) > 0 && Buffer.byteLength(s) <= 256 && !/[\x00-\x1f\x7f-\x9f]/u.test(s);
const digest = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const exact = (x, keys) => x && Object.getPrototypeOf(x) === Object.prototype && Object.keys(x).sort().join('|') === [...keys].sort().join('|');
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)); };
function git(root, args) {
  const config = ['-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${devNull}`];
  const options = {cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 16777216, stdio: ['ignore', 'pipe', 'ignore'], env: {...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0'}};
  if (args[0] === 'status') {
    let definitions;
    try {
      definitions = execFileSync('git', [...config, 'config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|required)$'], {...options, timeout: 5000, maxBuffer: 65536});
    } catch (error) {
      if (error.status !== 1 || error.signal || error.error) fail('SHIP_EVIDENCE_UNKNOWN');
      definitions = '';
    }
    const names = new Set();
    for (const key of definitions.split('\0').filter(Boolean)) {
      const match = key.match(/^filter\.([^\x00-\x1f\x7f=]+)\.(?:clean|process|required)$/);
      if (!match) fail('SHIP_EVIDENCE_UNKNOWN');
      names.add(match[1]);
      if (names.size > 128) fail('SHIP_EVIDENCE_UNKNOWN');
    }
    // Status may execute repository-configured clean/process filters while comparing files.
    for (const name of names) config.push('-c', `filter.${name}.clean=`, '-c', `filter.${name}.process=`, '-c', `filter.${name}.required=false`);
  }
  return execFileSync('git', [...config, ...args], options);
}
function canonicalRoot(root) {
  const canonical = realpathSync(root);
  if (!lstatSync(canonical).isDirectory()) fail('SHIP_PATH_UNSAFE');
  return canonical;
}
function privatePath(path, kind) {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail('SHIP_PATH_UNSAFE');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (kind === 'dir' ? !stat.isDirectory() : !stat.isFile()) || stat.uid !== process.getuid() || (stat.mode & 0o777) !== (kind === 'dir' ? 0o700 : 0o600)) fail('SHIP_PATH_UNSAFE');
  if (kind === 'file' && stat.size > 262144) fail('SHIP_POLICY_INVALID');
  return path;
}
function registrationValid(r) {
  return exact(r, ['version', 'repositoryId', 'projectId', 'gitCommonDirDigest', 'journalOriginId', 'journalRootDigest']) && r.version === 'ship-registration/v1' && [r.repositoryId, r.projectId, r.journalOriginId].every(id) && digest(r.gitCommonDirDigest) && digest(r.journalRootDigest);
}
function bindRegistration(root, registration, actualCommon = null) {
  if (!registrationValid(registration)) fail('SHIP_REGISTRATION_MISMATCH');
  const common = actualCommon || realpathSync(resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim()));
  if (sha(common) !== registration.gitCommonDirDigest) fail('SHIP_REGISTRATION_MISMATCH');
  return common;
}
function sourceTuple(root) {
  const lines = git(root, ['rev-parse', '--git-common-dir', 'HEAD', 'HEAD^{tree}']).trim().split('\n');
  if (lines.length !== 3) fail('SHIP_EVIDENCE_UNKNOWN');
  const [commonPath, head, tree] = lines;
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head) || tree.length !== head.length || !/^[a-f0-9]+$/.test(tree)) fail('SHIP_EVIDENCE_UNKNOWN');
  return {common: realpathSync(resolve(root, commonPath)), head, tree};
}
function mergedRequirements(root, policy) {
  let text;
  try { text = readFileSync(join(root, '.great_cto/PROJECT.md'), 'utf8'); } catch { fail('SHIP_REQUIREMENTS_UNKNOWN'); }
  if (Buffer.byteLength(text) > 262144) fail('SHIP_REQUIREMENTS_UNKNOWN');
  const field = name => {
    const rows = text.split('\n').filter(line => line.startsWith(`${name}:`));
    if (rows.length > 1) fail('SHIP_REQUIREMENTS_UNKNOWN');
    return rows.length ? rows[0].slice(name.length + 1).trim() : null;
  };
  const archetypes = ['primary', 'archetype'].map(field).filter(Boolean);
  if (!archetypes.some(a => Object.hasOwn(REVIEWERS_BY_ARCHETYPE, a))) fail('SHIP_REQUIREMENTS_UNKNOWN');
  if (new Set(archetypes.filter(a => Object.hasOwn(REVIEWERS_BY_ARCHETYPE, a))).size > 1) fail('SHIP_REQUIREMENTS_UNKNOWN');
  const parseList = name => {
    const value = field(name);
    if (value === null) return [];
    if (!/^\[[^\[\]\n]*\]$/.test(value)) fail('SHIP_REQUIREMENTS_UNKNOWN');
    return value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  };
  for (const pack of parseList('packs')) if (!Object.hasOwn(PACK_REVIEWERS, pack)) fail('SHIP_REQUIREMENTS_UNKNOWN');
  for (const token of parseList('compliance')) if (!COMPLIANCE_REVIEWERS.some(r => r.token.test(token))) fail('SHIP_REQUIREMENTS_UNKNOWN');
  const merged = new Map(['qa-engineer', 'security-officer', ...requiredReviewers(text).map(r => r.agent)].map(role => [role, {role, requiredChecks: ['independent-verifier'], independentOf: []}]));
  for (const row of policy.requiredReviewers) {
    const prior = merged.get(row.role);
    merged.set(row.role, {role: row.role, requiredChecks: [...new Set([...(prior?.requiredChecks || ['independent-verifier']), ...row.requiredChecks])].sort(), independentOf: []});
  }
  if (merged.size > 128) fail('SHIP_REQUIREMENTS_UNKNOWN');
  return [...merged.values()].sort((a, b) => a.role.localeCompare(b.role));
}
export function readShipPolicy({root, path}) {
  try {
    root = canonicalRoot(root);
    const store = dirname(path), common = realpathSync(resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim()));
    privatePath(store, 'dir'); privatePath(path, 'file');
    if (path !== join(store, 'policy.json') || inside(root, store) || inside(common, store)) fail('SHIP_PATH_UNSAFE');
    const registrationPath = privatePath(join(store, 'registration.json'), 'file');
    const policy = JSON.parse(readFileSync(path, 'utf8')), registration = JSON.parse(readFileSync(registrationPath, 'utf8'));
    stableDigest(policy); stableDigest(registration);
    if (!exact(policy, ['version', 'registration', 'requiredReviewers', 'assignmentLifetimeMs', 'journalRoot']) || policy.version !== 'ship-controller-policy/v1' || policy.registration !== 'registration.json' || !Number.isSafeInteger(policy.assignmentLifetimeMs) || policy.assignmentLifetimeMs <= 0 || !Array.isArray(policy.requiredReviewers) || policy.requiredReviewers.length > 128 || new Set(policy.requiredReviewers.map(r => r.role)).size !== policy.requiredReviewers.length) fail('SHIP_POLICY_INVALID');
    for (const row of policy.requiredReviewers) if (!exact(row, ['role', 'requiredChecks']) || !/^[a-z][a-z0-9-]{0,63}$/.test(row.role) || !Array.isArray(row.requiredChecks) || !row.requiredChecks.length || row.requiredChecks.length > 256 || new Set(row.requiredChecks).size !== row.requiredChecks.length || row.requiredChecks.some(c => !['independent-verifier', 'configured-checks'].includes(c))) fail('SHIP_POLICY_INVALID');
    bindRegistration(root, registration, common);
    privatePath(policy.journalRoot, 'dir');
    if (inside(store, policy.journalRoot) || sha(policy.journalRoot) !== registration.journalRootDigest) fail('SHIP_REGISTRATION_MISMATCH');
    const requirements = mergedRequirements(root, policy);
    return {version: 'ship-policy-descriptor/v1', root, store, policyPath: path, registrationPath, registration, policy, registrationDigest: stableDigest(registration), policyDigest: stableDigest(policy), requirements, requirementsDigest: stableDigest(requirements)};
  } catch (error) {
    if (error.code?.startsWith('SHIP_')) throw error;
    fail('SHIP_POLICY_INVALID');
  }
}
export function captureShipContext({root, registration, taskId, runId, gateId, policy, requirements}) {
  try {
    root = canonicalRoot(root);
    const {common, head, tree} = sourceTuple(root); bindRegistration(root, registration, common);
    if (!id(taskId) || !id(runId) || gateId !== 'gate:ship' || !Array.isArray(requirements) || sha(realpathSync(policy.journalRoot)) !== registration.journalRootDigest) fail('SHIP_REGISTRATION_MISMATCH');
    const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']);
    if (status.length) fail('SHIP_CONTEXT_DRIFT');
    const expected = {version: 'ship-context/v1', repositoryId: registration.repositoryId, projectId: registration.projectId, source: {head, tree, clean: true, dirtyDigest: null, exclusionsDigest: stableDigest([])}, taskId, runId, gateId, policyDigest: stableDigest(policy), requirementsDigest: stableDigest(requirements), evidenceClass: 'SOURCE_REVIEW', requiredReviewers: structuredClone(requirements)};
    return {state: 'COMPLETE', expected, contextDigest: stableDigest(expected), diagnostics: []};
  } catch { return {state: 'UNKNOWN', expected: null, contextDigest: null, diagnostics: [{code: 'CONTEXT_UNAVAILABLE', subject: 'source'}]}; }
}
export function recheckShipContext({root, registration, expected}) {
  try {
    root = canonicalRoot(root);
    const {common, head, tree} = sourceTuple(root); bindRegistration(root, registration, common);
    if (!expected || expected.repositoryId !== registration.repositoryId || expected.projectId !== registration.projectId || expected.version !== 'ship-context/v1' || expected.source.exclusionsDigest !== stableDigest([])) fail('SHIP_REGISTRATION_MISMATCH');
    const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']);
    const current = {...expected, source: {...expected.source, head, tree, clean: !status, dirtyDigest: status ? sha(status) : null}};
    const contextDigest = stableDigest(current);
    return {state: !status && contextDigest === stableDigest(expected) ? 'MATCH' : 'DRIFT', contextDigest, diagnostics: []};
  } catch { return {state: 'UNKNOWN', contextDigest: null, diagnostics: [{code: 'CONTEXT_UNAVAILABLE', subject: 'source'}]}; }
}

/** Internal refusal check; this does not issue review or controller authority. */
export function assertCommittedShipArtifacts({root, allowed, rule, proposal}) {
  try {
    root = canonicalRoot(root);
    if (!Array.isArray(allowed) || !Array.isArray(proposal?.files) || proposal.files.length) fail('UNSUPPORTED_REVIEW_OUTPUT');
    const prefix = git(root, ['rev-parse', '--show-prefix']).trim();
    const names = new Set();
    const inspect = name => {
      if (typeof name !== 'string' || !name || isAbsolute(name) || /[\\\x00-\x1f\x7f]/.test(name) || !allowed.some(p => name === p || name.startsWith(`${p}/`))) fail('UNSUPPORTED_REVIEW_OUTPUT');
      const parts = name.split('/');
      if (parts.some(p => !p || p === '.' || p === '..' || /^(?:\.git|\.codex|\.claude|\.agents|\.beads|\.great_cto|node_modules)$/i.test(p) || /^(?:AGENTS\.md|CLAUDE\.md|SKILL\.md|\.env(?:\..*)?)$/i.test(p))) fail('UNSUPPORTED_REVIEW_OUTPUT');
      let path = root;
      for (const part of parts) { path = join(path, part); if (lstatSync(path).isSymbolicLink()) fail('UNSUPPORTED_REVIEW_OUTPUT'); }
      return {path, stat: lstatSync(path)};
    };
    const committedFile = name => {
      if (names.has(name)) return;
      if (names.size >= 200) fail('UNSUPPORTED_REVIEW_OUTPUT');
      const {path, stat} = inspect(name);
      if (!stat.isFile() || stat.size === 0) fail('UNSUPPORTED_REVIEW_OUTPUT');
      const entry = git(root, ['--literal-pathspecs', 'ls-tree', '-z', '--full-name', 'HEAD', '--', name]);
      const match = entry.match(/^(100644|100755) blob ((?:[a-f0-9]{40}|[a-f0-9]{64}))\t([^\0]+)\0$/);
      if (!match || match[3] !== prefix + name) fail('UNSUPPORTED_REVIEW_OUTPUT');
      const data = readFileSync(path);
      const actual = createHash(match[2].length === 64 ? 'sha256' : 'sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
      if (actual !== match[2] || !data.toString('utf8').trim()) fail('UNSUPPORTED_REVIEW_OUTPUT');
      names.add(name);
    };
    const produces = rule?.produces == null ? [] : Array.isArray(rule.produces) ? rule.produces : [rule.produces];
    for (const key of produces) {
      if (key === 'receipt') continue;
      const name = proposal.meta?.[key];
      if (typeof name !== 'string' || name.endsWith('/')) fail('UNSUPPORTED_REVIEW_OUTPUT');
      committedFile(name);
    }
  } catch { fail('UNSUPPORTED_REVIEW_OUTPUT'); }
}
