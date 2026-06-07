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
  'ehr-fhir':        { label: 'EHR (FHIR)',            verticals: ['rcm'],         capabilities: ['fetch-note', 'fetch-patient'], realProviders: ['Epic', 'Cerner', 'athenahealth'], status: 'live-ready' },
  'ocr':             { label: 'Document OCR',          verticals: ['rcm', 'tax', 'accounting'], capabilities: ['extract-text'], realProviders: ['AWS Textract', 'Google DocAI'], status: 'stub' },
  'code-sets':       { label: 'ICD-10 / CPT / HCPCS',  verticals: ['rcm'],         capabilities: ['lookup-code', 'validate-code'], realProviders: ['NLM Clinical Tables', 'CMS', 'AMA CPT'], status: 'live-ready' },
  'ncci-mue':        { label: 'NCCI / MUE edits',      verticals: ['rcm'],         capabilities: ['check-ptp', 'check-mue'], realProviders: ['CMS quarterly tables'], status: 'live-ready' },
  'clearinghouse':   { label: 'Claims clearinghouse',  verticals: ['rcm'],         capabilities: ['submit-837', 'fetch-835'], realProviders: ['Change Healthcare', 'Availity'], status: 'live-ready' },
  'payer-rules':     { label: 'Payer rules / LCD-NCD', verticals: ['rcm'],         capabilities: ['check-necessity'], realProviders: ['CMS coverage DB'], status: 'stub' },

  // ── legaltech ──
  'doc-store':       { label: 'Document store',        verticals: ['legaltech', 'accounting'], capabilities: ['get-doc', 'put-doc'], realProviders: ['S3', 'Google Drive', 'SharePoint'], status: 'stub' },
  'e-signature':     { label: 'E-signature',           verticals: ['legaltech'],   capabilities: ['send-for-signature', 'check-excluded'], realProviders: ['DocuSign', 'Dropbox Sign'], status: 'live-ready' },
  'clause-library':  { label: 'Clause / template library', verticals: ['legaltech'], capabilities: ['get-clause'], realProviders: ['internal KB'], status: 'stub' },
  'jurisdiction-db': { label: 'Jurisdiction / law DB', verticals: ['legaltech', 'tax'], capabilities: ['check-jurisdiction'], realProviders: ['legal data vendor'], status: 'stub' },
  'conflict-db':     { label: 'Conflict-check DB',     verticals: ['legaltech'],   capabilities: ['run-conflict-check'], realProviders: ['matter DB'], status: 'stub' },
  'matter-mgmt':     { label: 'Matter management',     verticals: ['legaltech'],   capabilities: ['get-matter', 'apply-hold'], realProviders: ['Clio', 'iManage'], status: 'stub' },

  // ── procurement ──
  'erp':             { label: 'ERP',                   verticals: ['procurement', 'accounting'], capabilities: ['get-po', 'get-receipt'], realProviders: ['SAP', 'NetSuite', 'Coupa'], status: 'stub' },
  'sanctions-screen':{ label: 'Sanctions / PEP screening', verticals: ['procurement'], capabilities: ['screen-party', 'resolve-ubo'], realProviders: ['Dow Jones', 'Refinitiv', 'OFAC API'], status: 'live-ready' },
  'kyb':             { label: 'KYB / vendor verification', verticals: ['procurement'], capabilities: ['verify-vendor'], realProviders: ['Middesk', 'Persona'], status: 'stub' },
  'e-invoicing':     { label: 'E-invoicing / AP',      verticals: ['procurement'], capabilities: ['get-invoice', 'three-way-match'], realProviders: ['Tipalti', 'Bill.com'], status: 'stub' },
  'payment-rails':   { label: 'Payment rails',         verticals: ['procurement', 'accounting'], capabilities: ['release-payment', 'verify-bank'], realProviders: ['ACH', 'Stripe', 'bank API'], status: 'stub' },
  'vendor-master':   { label: 'Vendor master',         verticals: ['procurement'], capabilities: ['get-vendor', 'change-control'], realProviders: ['ERP vendor module'], status: 'stub' },

  // ── accounting ──
  'gl-erp':          { label: 'General ledger / ERP',  verticals: ['accounting'],  capabilities: ['post-entry', 'lock-period'], realProviders: ['QuickBooks', 'NetSuite', 'Xero'], status: 'stub' },
  'bank-feed':       { label: 'Bank feed',             verticals: ['accounting', 'tax'], capabilities: ['fetch-transactions'], realProviders: ['Plaid', 'MX'], status: 'live-ready' },
  'revenue-system':  { label: 'Revenue / billing',     verticals: ['accounting'],  capabilities: ['fetch-contracts'], realProviders: ['Stripe', 'Zuora'], status: 'stub' },
  'close-tool':      { label: 'Close / reconciliation',verticals: ['accounting'],  capabilities: ['reconcile'], realProviders: ['FloQast', 'Numeric'], status: 'stub' },

  // ── msp ──
  'rmm':             { label: 'RMM',                   verticals: ['msp'],         capabilities: ['stage-change', 'rollback'], realProviders: ['NinjaOne', 'ConnectWise', 'Datto'], status: 'live-ready' },
  'idp':             { label: 'Identity provider',     verticals: ['msp'],         capabilities: ['grant-jit', 'deprovision'], realProviders: ['Okta', 'Entra ID', 'AD'], status: 'stub' },
  'patch-source':    { label: 'Patch source',          verticals: ['msp'],         capabilities: ['fetch-patches'], realProviders: ['vendor feeds', 'WSUS'], status: 'stub' },
  'monitoring':      { label: 'Monitoring',            verticals: ['msp'],         capabilities: ['health-check'], realProviders: ['Datadog', 'PRTG'], status: 'stub' },
  'psa-ticketing':   { label: 'PSA / ticketing',       verticals: ['msp'],         capabilities: ['open-ticket'], realProviders: ['ConnectWise', 'Autotask'], status: 'stub' },
  'backup-dr':       { label: 'Backup / DR',           verticals: ['msp'],         capabilities: ['verify-restore-point'], realProviders: ['Veeam', 'Datto'], status: 'stub' },

  // ── tax ──
  'tax-engine':      { label: 'Tax engine',            verticals: ['tax'],         capabilities: ['compute-return', 'classify-position'], realProviders: ['CCH', 'Lacerte'], status: 'live-ready' },
  'irs-efile':       { label: 'IRS e-file (MeF)',      verticals: ['tax'],         capabilities: ['transmit-return'], realProviders: ['IRS MeF'], status: 'stub' },
  'doc-intake':      { label: 'Doc intake (W-2/1099)', verticals: ['tax'],         capabilities: ['extract-forms'], realProviders: ['OCR + parsers'], status: 'stub' },
  'brokerage-feed':  { label: 'Bank / brokerage feed', verticals: ['tax'],         capabilities: ['fetch-1099'], realProviders: ['Plaid', 'broker APIs'], status: 'stub' },

  // ── prior-auth ──
  'um-criteria':     { label: 'Medical-necessity criteria', verticals: ['prior-auth'], capabilities: ['check-criteria'], realProviders: ['MCG', 'InterQual', 'CMS NCD/LCD'], status: 'live-ready' },
  'auth-portal':     { label: 'Prior-auth portal (X12 278)', verticals: ['prior-auth'], capabilities: ['submit-278', 'check-status'], realProviders: ['Availity', 'payer portals'], status: 'stub' },

  // ── aml ──
  'id-verify':       { label: 'Identity verification (IDV)', verticals: ['aml'],     capabilities: ['verify-identity'], realProviders: ['Persona', 'Onfido', 'Socure'], status: 'stub' },
  'txn-monitor':     { label: 'Transaction monitoring',  verticals: ['aml'],         capabilities: ['screen-transactions'], realProviders: ['NICE Actimize', 'Hummingbird'], status: 'stub' },
  'adverse-media':   { label: 'Adverse-media / PEP',     verticals: ['aml'],         capabilities: ['search-media'], realProviders: ['Dow Jones', 'RDC', 'ComplyAdvantage'], status: 'stub' },
  'sar-filing':      { label: 'SAR / BSA e-file',        verticals: ['aml'],         capabilities: ['file-sar'], realProviders: ['FinCEN BSA E-File'], status: 'live-ready' },

  // ── soc ──
  'siem':            { label: 'SIEM / telemetry',        verticals: ['soc'],         capabilities: ['fetch-alerts', 'query-logs'], realProviders: ['Splunk', 'Microsoft Sentinel', 'Chronicle'], status: 'stub' },
  'edr':             { label: 'Endpoint detection (EDR)', verticals: ['soc'],        capabilities: ['fetch-detections', 'isolate-host'], realProviders: ['CrowdStrike', 'SentinelOne'], status: 'stub' },
  'threat-intel':    { label: 'Threat intelligence',     verticals: ['soc'],         capabilities: ['enrich-ioc'], realProviders: ['VirusTotal', 'GreyNoise', 'Recorded Future'], status: 'live-ready' },
  'soar':            { label: 'Response orchestration (SOAR)', verticals: ['soc'],   capabilities: ['run-playbook', 'contain'], realProviders: ['Tines', 'Torq', 'Cortex XSOAR'], status: 'stub' },

  // ── insurance ──
  'claims-fnol':     { label: 'Claims / FNOL intake',    verticals: ['insurance'],   capabilities: ['get-claim', 'get-policy'], realProviders: ['Guidewire', 'Duck Creek'], status: 'stub' },
  'fraud-score':     { label: 'Claims fraud scoring',    verticals: ['insurance'],   capabilities: ['score-fraud'], realProviders: ['Shift Technology', 'FRISS'], status: 'live-ready' },
  'policy-admin':    { label: 'Policy admin / rating',   verticals: ['insurance'],   capabilities: ['rate-policy', 'bind-policy'], realProviders: ['Guidewire', 'Socotra'], status: 'stub' },

  // ── mortgage ──
  'los':             { label: 'Loan origination system', verticals: ['mortgage'],    capabilities: ['get-application', 'update-loan'], realProviders: ['ICE Encompass', 'Blend'], status: 'stub' },
  'credit-bureau':   { label: 'Credit bureau',           verticals: ['mortgage', 'collections'], capabilities: ['pull-credit'], realProviders: ['Experian', 'Equifax', 'TransUnion'], status: 'stub' },
  'aus':             { label: 'Automated underwriting (DU/LPA)', verticals: ['mortgage'], capabilities: ['run-aus'], realProviders: ['Fannie Mae DU', 'Freddie Mac LPA'], status: 'live-ready' },
  'income-verify':   { label: 'Income / asset verification', verticals: ['mortgage'], capabilities: ['verify-voe', 'verify-voa'], realProviders: ['Truework', 'The Work Number', 'Plaid'], status: 'stub' },

  // ── title ──
  'title-search':    { label: 'Title search (public records)', verticals: ['title'], capabilities: ['search-title', 'pull-chain'], realProviders: ['DataTrace', 'county records'], status: 'stub' },
  'recording':       { label: 'County recording / e-record', verticals: ['title'],   capabilities: ['record-instrument'], realProviders: ['Simplifile', 'CSC'], status: 'stub' },
  'escrow-ledger':   { label: 'Escrow / settlement ledger', verticals: ['title'],    capabilities: ['open-escrow', 'disburse'], realProviders: ['Qualia', 'RamQuest'], status: 'stub' },

  // ── credentialing ──
  'primary-source':  { label: 'Primary-source verification', verticals: ['credentialing'], capabilities: ['verify-license', 'query-npdb'], realProviders: ['NPDB', 'DEA', 'state boards', 'ABMS'], status: 'live-ready' },
  'caqh':            { label: 'CAQH ProView',            verticals: ['credentialing'], capabilities: ['fetch-profile'], realProviders: ['CAQH'], status: 'stub' },
  'payer-enroll':    { label: 'Payer enrollment',        verticals: ['credentialing'], capabilities: ['submit-enrollment', 'check-status'], realProviders: ['Medallion', 'CAQH EnrollHub'], status: 'stub' },

  // ── collections ──
  'account-ledger':  { label: 'Receivables ledger',      verticals: ['collections'], capabilities: ['get-accounts', 'post-payment'], realProviders: ['ERP AR', 'collection CRM'], status: 'stub' },
  'comms-outreach':  { label: 'Compliant outreach (dialer/SMS)', verticals: ['collections'], capabilities: ['send-outreach'], realProviders: ['Twilio', 'Skit.ai'], status: 'live-ready' },

  // ── freight ──
  'tms':             { label: 'Transportation mgmt (TMS)', verticals: ['freight'],   capabilities: ['get-load', 'book-load'], realProviders: ['McLeod', 'MercuryGate'], status: 'stub' },
  'load-board':      { label: 'Load board / matching',   verticals: ['freight'],     capabilities: ['search-capacity'], realProviders: ['DAT', 'Truckstop'], status: 'stub' },
  'carrier-vet':     { label: 'Carrier vetting (FMCSA)', verticals: ['freight'],     capabilities: ['vet-carrier'], realProviders: ['FMCSA SAFER', 'RMIS', 'Highway'], status: 'live-ready' },
  'eld-tracking':    { label: 'ELD / shipment tracking', verticals: ['freight'],     capabilities: ['track-shipment'], realProviders: ['Project44', 'FourKites'], status: 'stub' },

  // ── cro ──
  'edc':             { label: 'Electronic data capture', verticals: ['cro'],         capabilities: ['fetch-crf', 'flag-deviation'], realProviders: ['Medidata Rave', 'Veeva'], status: 'stub' },
  'ctms':            { label: 'Clinical trial mgmt',     verticals: ['cro'],         capabilities: ['get-protocol', 'log-monitoring'], realProviders: ['Veeva CTMS', 'Oracle'], status: 'stub' },
  'eligibility-match':{ label: 'Trial eligibility matching', verticals: ['cro'],     capabilities: ['match-patient'], realProviders: ['Triomics', 'Deep 6 AI'], status: 'stub' },
  'reg-docs':        { label: 'Regulatory docs / eTMF',  verticals: ['cro'],         capabilities: ['assemble-tmf'], realProviders: ['Veeva Vault', 'Florence'], status: 'stub' },

  // ── customs ──
  'hs-classify':     { label: 'HS / HTSUS classification', verticals: ['customs'],    capabilities: ['classify-hs'], realProviders: ['CROSS rulings', 'Avalara', 'Descartes'], status: 'live-ready' },
  'denied-party':    { label: 'Denied-party / Entity List', verticals: ['customs'],   capabilities: ['screen-party'], realProviders: ['BIS Entity List', 'OFAC', 'CSL'], status: 'stub' },
  'customs-entry':   { label: 'CBP entry (ACE / ABI)',   verticals: ['customs'],      capabilities: ['file-entry', 'check-status'], realProviders: ['CBP ACE', 'ABI'], status: 'live-ready' },
  'duty-calc':       { label: 'Duty / valuation',        verticals: ['customs'],      capabilities: ['compute-duty'], realProviders: ['HTSUS', 'CBP'], status: 'stub' },

  // ── audit ──
  'control-evidence':{ label: 'Control evidence pull',   verticals: ['audit'],        capabilities: ['pull-evidence'], realProviders: ['Okta', 'Jira', 'ServiceNow', 'GitHub'], status: 'stub' },
  'itgc-test':       { label: 'ITGC control test',       verticals: ['audit'],        capabilities: ['run-test'], realProviders: ['AuditBoard', 'Workiva'], status: 'live-ready' },
  'workpaper':       { label: 'Audit workpaper / opinion', verticals: ['audit'],      capabilities: ['assemble-workpaper'], realProviders: ['Workiva', 'CaseWare'], status: 'stub' },

  // ── pharma ──
  'icsr-intake':     { label: 'ICSR / case intake',      verticals: ['pharma'],       capabilities: ['intake-case'], realProviders: ['Argus', 'ArisGlobal', 'Veeva Safety'], status: 'stub' },
  'meddra-code':     { label: 'MedDRA coding',           verticals: ['pharma'],       capabilities: ['code-term'], realProviders: ['MedDRA', 'ArisGlobal'], status: 'live-ready' },
  'causality':       { label: 'Causality assessment',    verticals: ['pharma'],       capabilities: ['assess-causality'], realProviders: ['WHO-UMC', 'Naranjo'], status: 'stub' },
  'safety-report':   { label: 'Safety report (E2B / FAERS)', verticals: ['pharma'],   capabilities: ['submit-e2b'], realProviders: ['FDA FAERS', 'EudraVigilance'], status: 'live-ready' },
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
    mode: 'stub',
    // A realistic, op-shaped placeholder. Deterministic (no randomness) for reproducible demos.
    data: { _stub: true, connector: connectorId, op, echo: payload },
    note: `STUB — ${spec.label}.${op}; wire ${spec.realProviders[0] || 'a real provider'} to go live`,
  };
}

// ── live adapters ────────────────────────────────────────────────────────────
// Lazily-imported real adapters (the stub→live path). Importing connectors.mjs stays
// side-effect-free + network-free; the adapter module loads only when a live call is made.
const LIVE_ADAPTERS = {
  'ehr-fhir': () => import('./connectors/fhir.mjs'),
  'code-sets': () => import('./connectors/codesets.mjs'),
  'clearinghouse': () => import('./connectors/clearinghouse.mjs'),
  'ncci-mue': () => import('./connectors/ncci.mjs'),
  'e-signature': () => import('./connectors/e-signature.mjs'),
  'bank-feed': () => import('./connectors/bank-feed.mjs'),
  'sanctions-screen': () => import('./connectors/sanctions.mjs'),
  'rmm': () => import('./connectors/rmm.mjs'),
  'tax-engine': () => import('./connectors/tax-engine.mjs'),
  'threat-intel': () => import('./connectors/threat-intel.mjs'),
  'fraud-score': () => import('./connectors/fraud-score.mjs'),
  'aus': () => import('./connectors/aus.mjs'),
  'primary-source': () => import('./connectors/primary-source.mjs'),
  'comms-outreach': () => import('./connectors/comms-outreach.mjs'),
  'carrier-vet': () => import('./connectors/carrier-vet.mjs'),
  'um-criteria': () => import('./connectors/um-criteria.mjs'),
  'sar-filing': () => import('./connectors/sar-filing.mjs'),
  'hs-classify': () => import('./connectors/hs-classify.mjs'),
  'customs-entry': () => import('./connectors/customs-entry.mjs'),
  'itgc-test': () => import('./connectors/itgc-test.mjs'),
  'meddra-code': () => import('./connectors/meddra-code.mjs'),
  'safety-report': () => import('./connectors/safety-report.mjs'),
};

/** Does this connector have a real (live) adapter wired? */
export function hasLiveAdapter(id) {
  return !!LIVE_ADAPTERS[id];
}

/**
 * Execute a connector op. mode 'stub' (default) → deterministic mock; mode 'live' → the real
 * adapter when one is registered (else falls back to stub with a note). Mode also reads from
 * GREAT_CTO_CONNECTOR_MODE so a whole flow run can be flipped live at once.
 * @returns {Promise<object>} { ok, mode, data|error, … }
 */
export async function call(connectorId, op, payload = {}, { mode } = {}) {
  const m = mode || process.env.GREAT_CTO_CONNECTOR_MODE || 'stub';
  if (m === 'live' && LIVE_ADAPTERS[connectorId]) {
    try {
      const adapter = await LIVE_ADAPTERS[connectorId]();
      if (!adapter.capabilities.includes(op)) return { ok: false, error: `live ${connectorId} has no op '${op}'` };
      const r = await adapter.call(op, payload);
      // The dispatcher owns `mode` — a result from a live adapter is always mode:'live'
      // (the adapter's own sub-mode, e.g. 'deterministic'/'delegate', is kept as adapterMode).
      return { ...r, mode: 'live', connector: connectorId, op, ...(r.mode && r.mode !== 'live' ? { adapterMode: r.mode } : {}) };
    } catch (e) {
      return { ok: false, mode: 'live', connector: connectorId, op, error: `live adapter failed: ${e.message}` };
    }
  }
  if (m === 'live') {
    const r = stubCall(connectorId, op, payload);
    return { ...r, mode: 'stub', note: `${r.note || ''} (no live adapter yet — still stub)`.trim() };
  }
  return stubCall(connectorId, op, payload);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, id, op, payloadArg] = process.argv.slice(2);
  const live = process.argv.includes('--live');
  if (cmd !== 'call' || !id || !op) {
    console.error('usage: connectors.mjs call <connector> <op> [json-payload] [--live]');
    console.error(`live-ready: ${Object.keys(LIVE_ADAPTERS).join(', ')}`);
    process.exit(2);
  }
  let payload = {};
  if (payloadArg && !payloadArg.startsWith('--')) { try { payload = JSON.parse(payloadArg); } catch { console.error('payload must be JSON'); process.exit(2); } }
  call(id, op, payload, { mode: live ? 'live' : 'stub' })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
