import { createHash } from 'node:crypto';
import { scenarios } from './adaptive-benchmark-protocol.mjs';

// Fixed handler, not arbitrary candidate code. Workers repair policy data only.
export const tenantAuthService = `export function getDocument({principal, document, request, policy, audit}) {
  const flags = ['requireAuthenticated','enforceTenant','enforceOwner'];
  if (!policy || flags.some(k => typeof policy[k] !== 'boolean') || !Array.isArray(policy.auditFields)
    || policy.auditFields.length > 8 || policy.auditFields.some(k => typeof k !== 'string')) return {status:503};
  let status = 200;
  const authenticated = principal?.authenticated === true && typeof principal.userId === 'string' && principal.userId.length > 0
    && typeof principal.tenantId === 'string' && principal.tenantId.length > 0;
  if (policy.requireAuthenticated && !authenticated) status = 401;
  else if (policy.enforceTenant && (!authenticated || principal.tenantId !== document.tenantId)) status = 403;
  else if (policy.enforceOwner && (!authenticated || principal.userId !== document.ownerId)) status = 403;
  const fields = {action:'document.read',outcome:status===200?'allow':'deny',userId:principal?.userId??null,
    tenantId:principal?.tenantId??null,documentId:document.id,bearer:request?.bearer??null};
  audit.push(Object.fromEntries(policy.auditFields.map(k => [k,fields[k]??null])));
  return status===200 ? {status,data:{id:document.id,content:document.content}} : {status};
}\n`;

export function tenantAuthBenchmarkFixture() {
  const sha = value => createHash('sha256').update(value).digest('hex');
  const files = {
    '.gitignore': '.great_cto/\n', '.great_cto/PROJECT.md': 'archetype: enterprise-saas\n',
    'package.json': '{"name":"tenant-auth-benchmark","private":true,"type":"module"}\n',
    'README.md': '# Tenant document authorization\n\nRepair src/auth/policy.json. Authenticated owners in the resource tenant may read. Other tenants, nonowners and anonymous requests must not receive content. Audit action/outcome and identifiers without request credentials. Principals and stored document metadata come from trusted adapters; request tenant IDs are untrusted. The fixed handler and project declaration are out of scope.\n',
    'src/service.mjs': tenantAuthService,
    'src/auth/policy.json': JSON.stringify({ requireAuthenticated: false, enforceTenant: false, enforceOwner: false,
      auditFields: ['action', 'outcome', 'userId', 'tenantId', 'documentId', 'bearer'] }) + '\n',
  };
  const scenario = scenarios.find(s => s.id === 'tenant-auth');
  const cases = [];
  for (const [i, tenant] of ['alpha', 'tenant:unicode-λ', 'case-Sensitive'].entries()) {
    const user = `owner-${i}`, document = { id: `doc-${i}`, tenantId: tenant, ownerId: user, content: `private-content-${i}` };
    const request = { bearer: sha(`synthetic audit marker ${i}`), tenantId: tenant };
    cases.push({ kind: 'owner', principal: { authenticated: true, userId: user, tenantId: tenant }, document, request, expected: 200 });
    cases.push({ kind: 'cross-tenant', principal: { authenticated: true, userId: user, tenantId: `other-${tenant}` }, document, request, expected: 403 });
    cases.push({ kind: 'nonowner', principal: { authenticated: true, userId: 'other-owner', tenantId: tenant }, document, request, expected: 403 });
    for (const principal of [null, { authenticated: false, userId: user, tenantId: tenant }, { authenticated: true, userId: '', tenantId: tenant }]) {
      cases.push({ kind: 'anonymous', principal, document, request, expected: 401 });
    }
  }
  return { files, oracle: { version: 1, scenario: scenario.id, criteria: scenario.checks,
    baseline: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, sha(text)])),
    protected: Object.keys(files).filter(name => name !== 'src/auth/policy.json'), cases,
    grammar: 'bounded declarative authorization policy; handler bytes protected and verified before execution',
  } };
}
