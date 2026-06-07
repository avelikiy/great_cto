// scripts/lib/connectors/e-signature.mjs — e-signature adapter (Phase 4 Wave 5, legaltech).
//
//   - check-excluded: REAL ESIGN/UETA rules — is this document type one that cannot be e-signed
//     (wills, certain family-law, notarial, some UCC instruments)? Deterministic, no keys. This is
//     the legaltech autopilot's guardrail: an excluded doc must route to wet-signature, never auto.
//   - send-for-signature: builds a real DocuSign EnvelopeDefinition and POSTs it when
//     GREAT_CTO_DOCUSIGN_BASE + GREAT_CTO_DOCUSIGN_TOKEN are set (developer sandbox or production);
//     otherwise returns the prepared envelope + the excluded-doc check, ready to send. It refuses
//     to prepare an excluded document.
//
// No external deps. DocuSign sandbox needs OAuth — set the env vars to go live; the envelope shape
// and the exclusion logic are real either way.

const DS_BASE = (process.env.GREAT_CTO_DOCUSIGN_BASE || '').replace(/\/$/, '');
const DS_TOKEN = process.env.GREAT_CTO_DOCUSIGN_TOKEN || '';
const DS_ACCOUNT = process.env.GREAT_CTO_DOCUSIGN_ACCOUNT || '';

export const capabilities = ['send-for-signature', 'check-excluded'];

// ESIGN Act / UETA §3(b) excluded categories (cannot be validly e-signed in many states).
const EXCLUDED = [
  { match: /\bwill\b|testament|codicil/i, reason: 'wills, codicils and testamentary trusts are excluded under UETA §3(b)' },
  { match: /divorce|adoption|custody|family law/i, reason: 'certain family-law documents are excluded' },
  { match: /notar/i, reason: 'documents requiring a notary/acknowledgement need a notarial act' },
  { match: /\bUCC\b|negotiable instrument|letter of credit|bill of lading/i, reason: 'certain UCC instruments are excluded' },
  { match: /court order|eviction|foreclosure notice/i, reason: 'certain court / official notices are excluded' },
];

/** Real exclusion check for a document type / title. */
export function checkExcluded(docType = '') {
  const hit = EXCLUDED.find((e) => e.match.test(docType));
  return hit
    ? { excluded: true, reason: hit.reason, action: 'route to wet-signature / notary — do NOT e-sign' }
    : { excluded: false, action: 'e-signable with intent + consent capture + tamper-evident audit trail' };
}

/** Build a real DocuSign EnvelopeDefinition. */
export function buildEnvelope({ docType = 'NDA', documentBase64 = '', fileName = 'document.pdf', signer = {} } = {}) {
  return {
    emailSubject: `Please sign: ${docType}`,
    status: 'sent',
    documents: [{ documentBase64: documentBase64 || Buffer.from(`[${docType} — demo document]`).toString('base64'), name: fileName, fileExtension: 'pdf', documentId: '1' }],
    recipients: {
      signers: [{
        email: signer.email || 'signer@example.com',
        name: signer.name || 'Authorized Signer',
        recipientId: '1', routingOrder: '1',
        tabs: { signHereTabs: [{ anchorString: '/sig/', anchorXOffset: '0', anchorYOffset: '0' }] },
      }],
    },
  };
}

export async function call(op, payload = {}) {
  if (op === 'check-excluded') {
    const docType = payload.docType || payload.type || payload.title || '';
    if (!docType) return { ok: false, error: 'check-excluded needs { docType }' };
    return { ok: true, mode: 'live', data: { docType, ...checkExcluded(docType) } };
  }

  if (op === 'send-for-signature') {
    const docType = payload.docType || payload.type || 'NDA';
    const excl = checkExcluded(docType);
    if (excl.excluded) {
      return { ok: false, mode: 'live', blocked: true, data: { docType, ...excl },
        error: `refused to e-sign an excluded document: ${excl.reason}` };
    }
    const envelope = buildEnvelope({ ...payload, docType });
    if (DS_BASE && DS_TOKEN && DS_ACCOUNT) {
      try {
        const r = await fetch(`${DS_BASE}/restapi/v2.1/accounts/${DS_ACCOUNT}/envelopes`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${DS_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
        });
        const body = r.ok ? await r.json() : null;
        return { ok: r.ok, mode: 'live', sent: r.ok, status: r.status, data: { docType, envelopeId: body?.envelopeId, envelope } };
      } catch (e) {
        return { ok: false, mode: 'live', error: `DocuSign send failed: ${e.message}`, data: { envelope } };
      }
    }
    return { ok: true, mode: 'live', sent: false, data: { docType, envelope },
      note: 'Prepared a valid DocuSign envelope. Set GREAT_CTO_DOCUSIGN_BASE/TOKEN/ACCOUNT to send via the sandbox.' };
  }

  return { ok: false, error: `e-signature adapter has no op '${op}'` };
}
