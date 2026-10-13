import { createHash } from 'node:crypto';

/** Host-provided identity, never inferred from a shared role log or session transcript. */
export function invocationIdentity(payload) {
  const valid = (v) => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(v);
  if (!valid(payload?.agent_id) || !valid(payload?.session_id)) return null;
  // Tuple encoding avoids ambiguous delimiters; a bounded digest fits marker
  // filenames even when the provider supplies long identifiers.
  return createHash('sha256').update(JSON.stringify([payload.session_id, payload.agent_id])).digest('hex');
}
