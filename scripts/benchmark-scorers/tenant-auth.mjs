/** Trusted builtin-only scorer. Executes verified handler bytes, not worker code. */
import { lstatSync, readdirSync, openSync, fstatSync, readSync, closeSync, constants, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.argv[2], oracle = JSON.parse(process.argv[3]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = name => typeof name === 'string' && name && !name.startsWith('/') && !name.includes('\\')
  && !name.split('/').some(p => !p || p === '.' || p === '..');
if (!root || realpathSync(root) !== root || oracle.version !== 1 || oracle.scenario !== 'tenant-auth'
  || !oracle.baseline || !Array.isArray(oracle.protected) || !Array.isArray(oracle.cases) || oracle.cases.length !== 18
  || Object.keys(oracle.baseline).some(name => !safe(name))
  || oracle.protected.some(name => !safe(name) || !oracle.baseline[name])) throw Error('unsupported tenant oracle');
const counts = { owner: 0, 'cross-tenant': 0, nonowner: 0, anonymous: 0 };
for (const input of oracle.cases) {
  if (!input || !Object.hasOwn(counts,input.kind) || !input.document || !input.request
    || ['id','tenantId','ownerId','content'].some(k => typeof input.document[k] !== 'string' || !input.document[k])
    || typeof input.request.bearer !== 'string' || !input.request.bearer) throw Error('unsupported tenant cases');
  const p = input.principal, d = input.document;
  const auth = p?.authenticated === true && typeof p.userId === 'string' && !!p.userId && typeof p.tenantId === 'string' && !!p.tenantId;
  const valid = input.kind === 'owner' ? auth && p.userId === d.ownerId && p.tenantId === d.tenantId && input.expected === 200
    : input.kind === 'cross-tenant' ? auth && p.userId === d.ownerId && p.tenantId !== d.tenantId && input.expected === 403
      : input.kind === 'nonowner' ? auth && p.userId !== d.ownerId && p.tenantId === d.tenantId && input.expected === 403
        : !auth && input.expected === 401;
  if (!valid) throw Error('tenant oracle category mismatch');
  counts[input.kind]++;
}
if (counts.owner !== 3 || counts['cross-tenant'] !== 3 || counts.nonowner !== 3 || counts.anonymous !== 9) throw Error('tenant oracle coverage incomplete');
const files = new Map(); let entries = 0, total = 0, unsafe = false;
function visit(name = '') {
  const path = join(root, name), stat = lstatSync(path);
  if (++entries > 200 || stat.isSymbolicLink()) { unsafe = true; return; }
  if (stat.isDirectory()) {
    const children = readdirSync(path); if (children.length > 200) { unsafe = true; return; }
    for (const child of children) if (name || child !== '.git') visit(name ? `${name}/${child}` : child);
    return;
  }
  if (!stat.isFile() || stat.size > 65536 || total + stat.size > 1024 * 1024) { unsafe = true; return; }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd), buffer = Buffer.alloc(stat.size + 1); let used = 0, count;
    if (!before.isFile() || before.size !== stat.size) { unsafe = true; return; }
    while (used < buffer.length && (count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) used += count;
    const after = fstatSync(fd);
    if (used !== stat.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) { unsafe = true; return; }
    total += used; files.set(name, buffer.subarray(0, used));
  } finally { closeSync(fd); }
}
visit();
const integrity = !unsafe && Object.keys(oracle.baseline).every(name => files.has(name))
  && [...files.keys()].every(name => Object.hasOwn(oracle.baseline, name))
  && oracle.protected.every(name => sha(files.get(name)) === oracle.baseline[name])
  && oracle.protected.includes('src/service.mjs');
let policy = null, valid = false;
try {
  policy = JSON.parse(files.get('src/auth/policy.json').toString('utf8'));
  valid = policy && Object.keys(policy).sort().join() === ['auditFields','enforceOwner','enforceTenant','requireAuthenticated'].sort().join()
    && ['enforceOwner','enforceTenant','requireAuthenticated'].every(k => typeof policy[k] === 'boolean')
    && Array.isArray(policy.auditFields) && policy.auditFields.length <= 8 && policy.auditFields.every(k => typeof k === 'string');
} catch { valid = false; }
const passed = [integrity && valid, integrity && valid, integrity && valid, integrity && valid];
if (integrity && valid) {
  // Import exactly hashed protected bytes, preventing pathname replacement.
  // The pinned oracle and fixed handler are trusted operator inputs, not a VM sandbox.
  const { getDocument } = await import(`data:text/javascript;base64,${files.get('src/service.mjs').toString('base64')}`);
  for (const input of oracle.cases) {
    const audit = [], result = getDocument({ ...structuredClone(input), policy: structuredClone(policy), audit });
    const allowed = input.kind === 'owner';
    const responseOK = result?.status === input.expected && (allowed
      ? JSON.stringify(result.data) === JSON.stringify({ id: input.document.id, content: input.document.content })
      : !Object.hasOwn(result, 'data'));
    if (input.kind === 'cross-tenant' || input.kind === 'nonowner') passed[0] &&= responseOK;
    if (allowed) passed[1] &&= responseOK;
    if (input.kind === 'anonymous') passed[2] &&= responseOK;
    const event = audit[0], keys = ['action','outcome','userId','tenantId','documentId'];
    passed[3] &&= audit.length === 1 && !!event && event.action === 'document.read' && event.outcome === (allowed ? 'allow' : 'deny')
      && event.userId === (input.principal?.userId ?? null) && event.tenantId === (input.principal?.tenantId ?? null)
      && event.documentId === input.document.id && Object.keys(event).length === keys.length
      && keys.every(k => Object.hasOwn(event,k)) && !JSON.stringify(audit).includes(input.request.bearer);
  }
}
process.stdout.write(JSON.stringify({ version: 1, pid: process.pid, scenario: oracle.scenario,
  criteria: oracle.criteria.map((text, i) => ({ text, state: passed[i] ? 'passed' : 'failed', evidence: passed[i]
    ? 'Pinned handler behavior satisfies hidden identity cases with protected inventory unchanged'
    : 'Authorization, audit, policy shape or protected inventory failed; private case values withheld' })) }));
