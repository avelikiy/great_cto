/** Host-neutral review evidence. Pure data contract, never gate authority. */
import { createHash } from 'node:crypto';

export const REVIEW_CONTRACT_VERSION = 1;
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Bind the exact submitted UTF-8 inputs and caller context, without storing bodies. */
export function reviewInputBinding({ diff, spec = null, taskId = null, sourceSha = null } = {}) {
  if (typeof diff !== 'string' || (spec !== null && typeof spec !== 'string')
    || (taskId !== null && (typeof taskId !== 'string' || taskId.length > 256))
    || (sourceSha !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sourceSha))) throw Error('invalid review input');
  const binding = { version: REVIEW_CONTRACT_VERSION, taskId, sourceSha,
    diffSha256: hash(diff), diffBytes: Buffer.byteLength(diff),
    specSha256: spec === null ? null : hash(spec), specBytes: spec === null ? null : Buffer.byteLength(spec) };
  return { ...binding, inputDigest: hash(JSON.stringify(binding)) };
}

/** Normalize trusted adapter metadata plus untrusted reviewer output. */
export function normalizeReviewResult(options = {}) {
  const { inputDigest, expectedInputDigest, reviewer,
    state = 'ok', verdict = null, findings = null } = options && typeof options === 'object' ? options : {};
  const identity = { host: typeof reviewer?.host === 'string' ? reviewer.host : null,
    model: typeof reviewer?.model === 'string' ? reviewer.model : null };
  const unknown = reason => ({ version: REVIEW_CONTRACT_VERSION, state: 'not-checked',
    verdict: null, reason, inputDigest: digest(inputDigest) ? inputDigest : null,
    reviewer: identity, findings: [] });
  if (!digest(inputDigest) || !digest(expectedInputDigest) || inputDigest !== expectedInputDigest) return unknown('input-mismatch');
  if (state !== 'ok') return unknown('adapter-unavailable');
  if (!['PASS', 'BLOCK'].includes(verdict) || !Array.isArray(findings) || findings.length > 200) return unknown('invalid-result');
  const valid = findings.every(f => f && typeof f === 'object'
    && typeof f.file === 'string' && f.file.length > 0 && f.file.length <= 1024
    && !/^[\\/]|^[A-Za-z]:|[\\\x00-\x1f]/.test(f.file)
    && f.file.split('/').every(part => part && part !== '.' && part !== '..')
    && Number.isSafeInteger(f.line) && f.line > 0
    && ['P0', 'P1', 'P2'].includes(f.severity)
    && typeof f.issue === 'string' && f.issue.trim().length > 0 && f.issue.length <= 4000);
  if (!valid) return unknown('invalid-findings');
  const result = findings.map(({ file, line, severity, issue }) => ({ file, line, severity, issue }));
  return { version: REVIEW_CONTRACT_VERSION, state: 'checked',
    verdict: result.some(f => f.severity === 'P0') ? 'BLOCK' : verdict,
    reason: result.some(f => f.severity === 'P0') && verdict === 'PASS' ? 'p0-overrides-pass' : null,
    inputDigest, reviewer: identity, findings: result };
}

/** Legacy line protocol adapter; ambiguity never becomes approval. */
export function parseLegacyReview(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) return { findings: [], verdict: null };
  const findings = [], verdicts = []; let malformed = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim(), v = line.match(/^VERDICT:\s*(BLOCK|PASS)$/i);
    if (v) { verdicts.push(v[1].toUpperCase()); continue; }
    if (/^VERDICT:/i.test(line)) { malformed = true; continue; }
    const m = line.match(/^(.+?):(\d+)\s*\|\s*(P[012])\s*\|\s*(.+)$/i);
    if (m) findings.push({ file: m[1].trim(), line: Number(m[2]), severity: m[3].toUpperCase(), issue: m[4].trim() });
    else if (/\|\s*P\d/i.test(line) || /^.+?:\d+\s*\|/.test(line)) malformed = true;
  }
  // No verdict may conservatively block a concrete P0, never pass.
  const verdict = malformed || verdicts.length > 1 ? null
    : verdicts[0] || (findings.some(f => f.severity === 'P0') ? 'BLOCK' : null);
  const pin = hash('legacy-adapter');
  const normalized = normalizeReviewResult({ inputDigest: pin, expectedInputDigest: pin, verdict, findings });
  // Preserve valid parsed findings for diagnostics when the verdict is missing.
  const validation = normalizeReviewResult({ inputDigest: pin, expectedInputDigest: pin, verdict: 'BLOCK', findings });
  return { findings: validation.findings, verdict: normalized.verdict };
}
