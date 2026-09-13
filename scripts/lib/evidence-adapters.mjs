// Transitional dual-write adapters from the existing runtime journals into the
// canonical Evidence Ledger. Legacy writers remain authoritative until parity
// is measured; an adapter failure is returned explicitly and never rewritten as
// a successful evidence append.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { appendEvidence } from './evidence-ledger.mjs';
import { parseVerdictLine } from './verdict-record.mjs';

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');
const bounded = (value, max = 2000) => value == null ? null : String(value).slice(0, max);

function identifier(value, fallback) {
  const cleaned = String(value || '').trim().replace(/[^A-Za-z0-9._:@-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128);
  return cleaned || fallback;
}

export function projectIdentity(cwd, declared = null) {
  if (declared) return identifier(declared, 'project');
  try {
    const text = readFileSync(resolve(cwd, '.great_cto', 'PROJECT.md'), 'utf8');
    const slug = (text.match(/^slug:\s*(\S+)/m) || [])[1];
    if (slug) return identifier(slug, 'project');
  } catch { /* basename is an explicit fallback, not a fabricated PROJECT value */ }
  return identifier(basename(resolve(cwd)), 'project');
}

const dispatcherState = (outcome) => ({
  dispatch: 'completed', hold: 'pending', stop: 'completed', launched: 'running',
  'blocked-budget': 'blocked', breaker: 'blocked', disabled: 'cancelled',
  'no-verdict': 'failed', 'no-rule': 'failed', 'unknown-verdict': 'failed', 'no-map': 'failed',
}[outcome] || 'unknown');

/** One legacy pipeline-runs row -> one canonical dispatcher fact. */
export function recordDispatcherEvidence(cwd, row) {
  const identity = sha(JSON.stringify(row));
  return appendEvidence(cwd, {
    eventType: 'pipeline.dispatcher.completed',
    occurredAt: row.ts,
    projectId: projectIdentity(cwd),
    runId: `dispatcher-${identity.slice(0, 24)}`,
    stageId: row.agent || null,
    idempotencyKey: `dispatcher:${identity}`,
    state: dispatcherState(row.outcome),
    reason: bounded(row.why),
    details: {
      map_source: row.map ?? null,
      next: Array.isArray(row.next) ? row.next : [],
      outcome: row.outcome ?? 'unknown',
      progressed: row.progressed === true ? true : row.progressed === false ? false : null,
      started_at: row.started_at ?? null,
      verdict: row.verdict ?? null,
    },
  });
}

const verdictState = (verdict) => ({
  APPROVED: 'passed', PASS: 'passed', PASSED: 'passed', DONE: 'completed', TASK_DONE: 'completed',
  BLOCKED: 'blocked', REJECTED: 'blocked', ESCALATED: 'blocked', FAIL: 'failed', REWORK: 'failed',
  SKIPPED: 'cancelled',
}[String(verdict || '').toUpperCase()] || 'unknown');

/** One canonical/legacy verdict line -> one canonical agent fact. */
export function recordVerdictEvidence(cwd, lineOrRecord) {
  const parsed = typeof lineOrRecord === 'string' ? parseVerdictLine(lineOrRecord) : { ok: true, rec: lineOrRecord };
  if (!parsed.ok) return { state: 'unreadable', why: `verdict line: ${parsed.reason}`, event: null };
  const rec = parsed.rec;
  const identity = sha(JSON.stringify(rec));
  const receiptFiles = rec.receipt?.files && typeof rec.receipt.files === 'object' ? rec.receipt.files : null;
  return appendEvidence(cwd, {
    eventType: 'agent.verdict.recorded',
    occurredAt: rec.ts,
    projectId: projectIdentity(cwd, rec.project),
    runId: `verdict-${identity.slice(0, 24)}`,
    stageId: identifier(rec.agent, 'unknown-agent'),
    agent: identifier(rec.agent, 'unknown-agent'),
    idempotencyKey: `verdict:${identity}`,
    state: verdictState(rec.verdict),
    diffSha: rec.receipt?.dirty ?? null,
    artifactSha: receiptFiles && Object.keys(receiptFiles).length ? sha(JSON.stringify(receiptFiles)) : null,
    details: {
      cost_usd: typeof rec.cost_usd === 'number' ? rec.cost_usd : null,
      receipt_files: receiptFiles ? Object.keys(receiptFiles).length : 0,
      receipt_head: rec.receipt?.head ?? null,
      receipt_truncated: rec.receipt?.truncated === true,
      verdict: rec.verdict,
    },
  });
}

/** A controller-owned Codex state transition -> one canonical lifecycle fact. */
export function recordCodexEvidence(state, eventType, {
  stageId = null,
  lifecycleState,
  reason = null,
  attempt = null,
  discriminator = '',
  diffSha = null,
  artifactSha = null,
  details = {},
} = {}) {
  // Discriminators may be compound controller values (for example two gate
  // names joined by a comma). Hashing keeps the idempotency key bounded and in
  // the ledger's identifier alphabet without discarding their identity.
  const discriminatorId = discriminator ? sha(discriminator).slice(0, 24) : '-';
  return appendEvidence(state.root, {
    eventType,
    projectId: projectIdentity(state.root),
    runId: state.id,
    stageId,
    attempt,
    host: 'codex',
    agent: stageId,
    idempotencyKey: `${state.id}:${eventType}:${stageId || 'pipeline'}:${attempt || 0}:${discriminatorId}`,
    state: lifecycleState,
    reason: bounded(reason),
    diffSha,
    artifactSha,
    details,
  });
}

async function main(argv) {
  if (argv[0] !== 'verdict') return 2;
  const cwd = resolve(argv[1] || '.');
  const line = readFileSync(0, 'utf8').trim();
  let result;
  try { result = recordVerdictEvidence(cwd, line); }
  catch (error) {
    result = { state: 'unreadable', why: String(error?.message || error), event: null };
  }
  if (!['appended', 'duplicate'].includes(result.state)) {
    process.stderr.write(`evidence-ledger: verdict dual-write ${result.state}: ${result.why}\n`);
    return 2;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
