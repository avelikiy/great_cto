// scripts/lib/connectors.mjs — connector catalog + stub executor (autopilot pivot).
//
// A vertical autopilot's flow runs against external systems (EHR, clearinghouse, banks, ERP…).
// We ship CONNECTOR INTERFACES + STUB adapters now: every connector returns realistic mock data
// so a flow runs end-to-end in demo/sandbox mode. A real adapter is a drop-in replacement later
// (flip `status: 'stub'` → 'live' and provide a real `call`). No external deps, no network.

/**
 * Catalog: every connector a vertical flow can reference. `status: 'stub'` today.
 * `capabilities` = the operations a flow step may invoke. `realProviders` = the live adapters
 * we'd build later (informational).
 */
export const CONNECTORS = Object.freeze({
  // ── rcm ──
  'ehr-fhir':        { label: 'EHR (FHIR)',            verticals: ['rcm'],         capabilities: ['fetch-note', 'fetch-patient'], realProviders: ['Epic', 'Cerner', 'athenahealth'], status: 'stub' },
  'ocr':             { label: 'Document OCR',          verticals: ['rcm', 'tax', 'accounting'], capabilities: ['extract-text'], realProviders: ['AWS Textract', 'Google DocAI'], status: 'stub' },
  'code-sets':       { label: 'ICD-10 / CPT / HCPCS',  verticals: ['rcm'],         capabilities: ['lookup-code', 'validate-code'], realProviders: ['CMS', 'AMA CPT'], status: 'stub' },
  'ncci-mue':        { label: 'NCCI / MUE edits',      verticals: ['rcm'],         capabilities: ['check-ptp', 'check-mue'], realProviders: ['CMS quarterly tables'], status: 'stub' },
  'clearinghouse':   { label: 'Claims clearinghouse',  verticals: ['rcm'],         capabilities: ['submit-837', 'fetch-835'], realProviders: ['Change Healthcare', 'Availity'], status: 'stub' },
  'payer-rules':     { label: 'Payer rules / LCD-NCD', verticals: ['rcm'],         capabilities: ['check-necessity'], realProviders: ['CMS coverage DB'], status: 'stub' },

  // ── legaltech ──
  'doc-store':       { label: 'Document store',        verticals: ['legaltech', 'accounting'], capabilities: ['get-doc', 'put-doc'], realProviders: ['S3', 'Google Drive', 'SharePoint'], status: 'stub' },
  'e-signature':     { label: 'E-signature',           verticals: ['legaltech'],   capabilities: ['send-for-signature', 'check-excluded'], realProviders: ['DocuSign', 'Dropbox Sign'], status: 'stub' },
  'clause-library':  { label: 'Clause / template library', verticals: ['legaltech'], capabilities: ['get-clause'], realProviders: ['internal KB'], status: 'stub' },
  'jurisdiction-db': { label: 'Jurisdiction / law DB', verticals: ['legaltech', 'tax'], capabilities: ['check-jurisdiction'], realProviders: ['legal data vendor'], status: 'stub' },
  'conflict-db':     { label: 'Conflict-check DB',     verticals: ['legaltech'],   capabilities: ['run-conflict-check'], realProviders: ['matter DB'], status: 'stub' },
  'matter-mgmt':     { label: 'Matter management',     verticals: ['legaltech'],   capabilities: ['get-matter', 'apply-hold'], realProviders: ['Clio', 'iManage'], status: 'stub' },

  // ── procurement ──
  'erp':             { label: 'ERP',                   verticals: ['procurement', 'accounting'], capabilities: ['get-po', 'get-receipt'], realProviders: ['SAP', 'NetSuite', 'Coupa'], status: 'stub' },
  'sanctions-screen':{ label: 'Sanctions / PEP screening', verticals: ['procurement'], capabilities: ['screen-party', 'resolve-ubo'], realProviders: ['Dow Jones', 'Refinitiv', 'OFAC API'], status: 'stub' },
  'kyb':             { label: 'KYB / vendor verification', verticals: ['procurement'], capabilities: ['verify-vendor'], realProviders: ['Middesk', 'Persona'], status: 'stub' },
  'e-invoicing':     { label: 'E-invoicing / AP',      verticals: ['procurement'], capabilities: ['get-invoice', 'three-way-match'], realProviders: ['Tipalti', 'Bill.com'], status: 'stub' },
  'payment-rails':   { label: 'Payment rails',         verticals: ['procurement', 'accounting'], capabilities: ['release-payment', 'verify-bank'], realProviders: ['ACH', 'Stripe', 'bank API'], status: 'stub' },
  'vendor-master':   { label: 'Vendor master',         verticals: ['procurement'], capabilities: ['get-vendor', 'change-control'], realProviders: ['ERP vendor module'], status: 'stub' },

  // ── accounting ──
  'gl-erp':          { label: 'General ledger / ERP',  verticals: ['accounting'],  capabilities: ['post-entry', 'lock-period'], realProviders: ['QuickBooks', 'NetSuite', 'Xero'], status: 'stub' },
  'bank-feed':       { label: 'Bank feed',             verticals: ['accounting', 'tax'], capabilities: ['fetch-transactions'], realProviders: ['Plaid', 'MX'], status: 'stub' },
  'revenue-system':  { label: 'Revenue / billing',     verticals: ['accounting'],  capabilities: ['fetch-contracts'], realProviders: ['Stripe', 'Zuora'], status: 'stub' },
  'close-tool':      { label: 'Close / reconciliation',verticals: ['accounting'],  capabilities: ['reconcile'], realProviders: ['FloQast', 'Numeric'], status: 'stub' },

  // ── msp ──
  'rmm':             { label: 'RMM',                   verticals: ['msp'],         capabilities: ['stage-change', 'rollback'], realProviders: ['NinjaOne', 'ConnectWise', 'Datto'], status: 'stub' },
  'idp':             { label: 'Identity provider',     verticals: ['msp'],         capabilities: ['grant-jit', 'deprovision'], realProviders: ['Okta', 'Entra ID', 'AD'], status: 'stub' },
  'patch-source':    { label: 'Patch source',          verticals: ['msp'],         capabilities: ['fetch-patches'], realProviders: ['vendor feeds', 'WSUS'], status: 'stub' },
  'monitoring':      { label: 'Monitoring',            verticals: ['msp'],         capabilities: ['health-check'], realProviders: ['Datadog', 'PRTG'], status: 'stub' },
  'psa-ticketing':   { label: 'PSA / ticketing',       verticals: ['msp'],         capabilities: ['open-ticket'], realProviders: ['ConnectWise', 'Autotask'], status: 'stub' },
  'backup-dr':       { label: 'Backup / DR',           verticals: ['msp'],         capabilities: ['verify-restore-point'], realProviders: ['Veeam', 'Datto'], status: 'stub' },

  // ── tax ──
  'tax-engine':      { label: 'Tax engine',            verticals: ['tax'],         capabilities: ['compute-return', 'classify-position'], realProviders: ['CCH', 'Lacerte'], status: 'stub' },
  'irs-efile':       { label: 'IRS e-file (MeF)',      verticals: ['tax'],         capabilities: ['transmit-return'], realProviders: ['IRS MeF'], status: 'stub' },
  'doc-intake':      { label: 'Doc intake (W-2/1099)', verticals: ['tax'],         capabilities: ['extract-forms'], realProviders: ['OCR + parsers'], status: 'stub' },
  'brokerage-feed':  { label: 'Bank / brokerage feed', verticals: ['tax'],         capabilities: ['fetch-1099'], realProviders: ['Plaid', 'broker APIs'], status: 'stub' },
});

/** Look up a connector spec by id. */
export function getConnector(id) {
  return CONNECTORS[id] || null;
}

/** All connector ids a flow references (deduped, in first-seen order), with their specs. */
export function flowConnectors(flow) {
  const ids = [];
  for (const s of flow.steps || []) for (const t of s.tools || []) if (!ids.includes(t)) ids.push(t);
  return ids.map((id) => ({ id, spec: getConnector(id) }));
}

/** Unknown connector ids referenced by a flow (catalog gaps) — used by validation. */
export function unknownConnectors(flow) {
  return flowConnectors(flow).filter((c) => !c.spec).map((c) => c.id);
}

/**
 * Stub executor — deterministic mock response for a connector op, so a flow runs in demo mode.
 * Real adapters replace this per connector later.
 */
export function stubCall(connectorId, op, payload = {}) {
  const spec = getConnector(connectorId);
  if (!spec) return { ok: false, error: `unknown connector: ${connectorId}` };
  if (!spec.capabilities.includes(op)) return { ok: false, error: `connector ${connectorId} has no op '${op}'` };
  return {
    ok: true,
    connector: connectorId,
    op,
    mode: spec.status, // 'stub'
    // A realistic, op-shaped placeholder. Deterministic (no randomness) for reproducible demos.
    data: { _stub: true, connector: connectorId, op, echo: payload },
    note: `STUB — ${spec.label}.${op}; wire ${spec.realProviders[0] || 'a real provider'} to go live`,
  };
}
