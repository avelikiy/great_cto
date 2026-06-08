// scripts/lib/roles.mjs — who operates what (RBAC for the autopilot console).
//
// The Operate console is the OPERATIONAL staff's surface — the licensed humans who sign the risky
// call (a coder, a BSA officer, a customs broker, a CPA, a QPPV …). Each such role may only see and
// sign the cases for its own vertical(s). The CTO/admin doesn't sign cases — they Build (CLI) and
// oversee; only `admin` may switch to the Build board. `compliance-lead` sees every queue but can't
// Build.
//
// This is a view + API-enforcement layer keyed off a `role` param. Real authentication (who proves
// they hold the role) is a separate track; this enforces the authorization mapping once identity is
// established.

export const ROLES = Object.freeze({
  admin:              { label: 'Admin / CTO',                 verticals: '*',                 canBuild: true,  canStart: true },
  'compliance-lead':  { label: 'Compliance lead',             verticals: '*',                 canBuild: false, canStart: true },
  coder:              { label: 'Certified coder (CPC/CCS)',   verticals: ['rcm'],             canBuild: false, canStart: false },
  'bsa-officer':      { label: 'BSA / AML Officer',           verticals: ['aml'],             canBuild: false, canStart: false },
  'soc-analyst':      { label: 'SOC analyst',                 verticals: ['soc'],             canBuild: false, canStart: false },
  underwriter:        { label: 'Adjuster / underwriter',      verticals: ['insurance', 'mortgage'], canBuild: false, canStart: false },
  'title-officer':    { label: 'Title / escrow officer',      verticals: ['title'],           canBuild: false, canStart: false },
  'cred-committee':   { label: 'Credentialing committee',     verticals: ['credentialing'],   canBuild: false, canStart: false },
  'collections-mgr':  { label: 'Collections manager',         verticals: ['collections'],     canBuild: false, canStart: false },
  broker:             { label: 'Freight broker',              verticals: ['freight'],         canBuild: false, canStart: false },
  pi:                 { label: 'PI / medical monitor',        verticals: ['cro'],             canBuild: false, canStart: false },
  'medical-director': { label: 'Plan medical director',       verticals: ['prior-auth'],      canBuild: false, canStart: false },
  attorney:           { label: 'Licensed attorney',           verticals: ['legaltech'],       canBuild: false, canStart: false },
  controller:         { label: 'Controller',                  verticals: ['accounting'],      canBuild: false, canStart: false },
  'tax-preparer':     { label: 'Tax preparer (PTIN)',         verticals: ['tax'],             canBuild: false, canStart: false },
  'finance-approver': { label: 'Finance approver',            verticals: ['procurement'],     canBuild: false, canStart: false },
  'change-mgr':       { label: 'Change manager',              verticals: ['msp'],             canBuild: false, canStart: false },
  'customs-broker':   { label: 'Customs broker',              verticals: ['customs'],         canBuild: false, canStart: false },
  cpa:                { label: 'CPA / engagement partner',    verticals: ['audit'],           canBuild: false, canStart: false },
  qppv:               { label: 'QPPV / drug-safety physician',verticals: ['pharma'],          canBuild: false, canStart: false },
  'immigration-attorney': { label: 'Immigration attorney (of record)', verticals: ['immigration'], canBuild: false, canStart: false },
  appraiser:          { label: 'State-certified appraiser',   verticals: ['appraisal'],       canBuild: false, canStart: false },
  'payroll-manager':  { label: 'Payroll manager (CPP)',       verticals: ['payroll'],         canBuild: false, canStart: false },
});

const DEFAULT_ROLE = 'admin';

export function getRole(role) { return ROLES[role] || ROLES[DEFAULT_ROLE]; }

/** Can `role` operate (see + sign) cases for `vertical`? */
export function roleAllows(role, vertical) {
  const r = getRole(role);
  return r.verticals === '*' || r.verticals.includes(vertical);
}

/** The verticals a role may operate ('*' → all). */
export function roleVerticals(role) {
  const r = getRole(role);
  return r.verticals === '*' ? '*' : [...r.verticals];
}
