#!/usr/bin/env node
/**
 * finding-beads — findings from the tracker, in the shape closure rules read.
 *
 * Why this exists
 * ---------------
 * `finding-closure.mjs` has the rules — a finding may not be closed by whoever
 * fixed it, the verification must postdate the fix, the reproduction must now
 * pass — and on 2026-08-07 it could say nothing, because findings lived in
 * markdown reports. Its inputs had to be typed in by hand to make it speak, and
 * the two CRITICALs it would have caught were closed by their own fixer in the
 * meantime.
 *
 * A rule with no data source is a rule nobody is subject to. This is the source.
 *
 * The shape it reads
 * ------------------
 * A finding is a bead labelled `finding`, whose description carries a `Repro:`
 * line, and whose comments record who fixed and who verified:
 *
 *     bd create "[Critical] gate approval could be forged" --label finding --type bug \
 *       -d "Location: scripts/lib/gate-state.mjs:99
 *           Repro: node -e '...'
 *           Rationale: ...
 *           Remediation: ..."
 *     bd comment <id> "fixed-by: senior-dev"
 *     bd comment <id> "verified-by: security-officer"
 *
 * Comments rather than fields because the tracker has comments everywhere and
 * custom fields nowhere, and because a comment carries its own timestamp — which
 * is what the "verification must postdate the fix" rule compares.
 *
 * Reading is permissive and reporting is strict: a bead missing `Repro:` still
 * comes back, carrying `repro: null`, so the closure rule can say *why* it may
 * not be closed. Dropping it here would report a clean set and a short list, and
 * the gap between them is invisible.
 */

import { execFileSync } from 'node:child_process';

/** `Repro:` through to the next `Key:` line or the end. */
export function parseRepro(description) {
  const text = String(description || '');
  const m = text.match(/^\s*repro\s*:\s*([\s\S]*?)(?=^\s*(?:location|rationale|remediation|references|severity)\s*:|\Z)/im);
  if (!m) return null;
  const body = m[1].trim();
  return body || null;
}

/**
 * `fixed-by:` / `verified-by:` from comments, newest wins.
 *
 * Newest rather than first: a finding can be fixed twice, and the verification
 * that matters is the one for the fix that stands.
 */
export function parseActors(comments) {
  const out = { fixedBy: null, fixedAt: null, verifiedBy: null, verifiedAt: null };
  const sorted = [...(comments || [])].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const c of sorted) {
    const body = String(c?.body ?? c?.text ?? c?.comment ?? '');
    const fixed = body.match(/^\s*fixed-by\s*:\s*(\S+)/im);
    if (fixed) { out.fixedBy = fixed[1]; out.fixedAt = c.created_at ?? null; }
    const ver = body.match(/^\s*verified-by\s*:\s*(\S+)/im);
    if (ver) { out.verifiedBy = ver[1]; out.verifiedAt = c.created_at ?? null; }
  }
  return out;
}

/** One bead → the record closureDecision() reads. */
export function findingFromBead(bead, { comments = [], reproResult = null } = {}) {
  if (!bead) return null;
  return {
    id: bead.id ? `${bead.id} ${String(bead.title || '').slice(0, 60)}` : String(bead.title || '(untitled)'),
    beadId: bead.id ?? null,
    status: bead.status ?? null,
    repro: parseRepro(bead.description),
    ...parseActors(comments),
    reproResult,
  };
}

/**
 * Finding beads from the tracker. [] on any failure — a tracker we cannot read
 * is not evidence that nothing is open.
 */
export function readFindingBeads({ timeoutMs = 6000, cwd = process.cwd(), exec = execFileSync } = {}) {
  try {
    const out = exec('bd', ['list', '--label', 'finding', '--json', '--status', 'all'],
      { cwd, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const parsed = JSON.parse(out || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Comments for one bead, or [] when they cannot be read. */
export function readBeadComments(id, { timeoutMs = 6000, cwd = process.cwd(), exec = execFileSync } = {}) {
  try {
    const out = exec('bd', ['show', String(id), '--json'],
      { cwd, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const o = JSON.parse(out || '{}');
    const list = o.comments ?? o.issue?.comments ?? [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/finding-beads.mjs            # what may not be closed, and why
//   node scripts/lib/finding-beads.mjs --json
//   node scripts/lib/finding-beads.mjs --strict   # exit 1 if any closure is blocked
//
// Reads only. It never closes a finding and never comments on one: a tool that
// can close a finding is a tool that can close it for the wrong reason.

async function main(argv) {
  const { explainClosures, closureDecision } = await import('./finding-closure.mjs');

  const beads = readFindingBeads();
  if (!beads.length) {
    console.log('finding-beads: no beads labelled `finding` — either nothing is open, or reviewers are still writing findings only into reports.');
    return 0;
  }

  const findings = beads.map((b) => findingFromBead(b, { comments: readBeadComments(b.id) }));

  if (argv.includes('--json')) {
    console.log(JSON.stringify(findings.map((f) => ({ ...f, decision: closureDecision(f) })), null, 2));
    return 0;
  }

  const out = explainClosures(findings);
  console.log(out || `finding-beads: ${findings.length} finding(s), every closure holds.`);
  return argv.includes('--strict') && out ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
