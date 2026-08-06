#!/usr/bin/env node
/**
 * finding-closure — may this finding be called fixed, and who says so?
 *
 * Why this exists
 * ---------------
 * The two rungs below check facts: a named artefact exists, a named check
 * re-runs and passes. Neither can catch what happened twice in one session.
 *
 *   code-reviewer filed a P1. It was fixed. code-reviewer never looked again;
 *   the person who wrote the fix declared it fixed.
 *
 *   security-officer filed two CRITICALs with reproductions. They were fixed.
 *   The re-verification produced no output at all, and again the person who
 *   wrote the fix declared them closed.
 *
 * Both times the fix was probably right. That is not the point — nobody
 * independent looked, and the record did not say so. A finding closed by its
 * own fixer is an unreviewed change wearing a review's clothes, and it reads
 * identically to a verified one in every report.
 *
 * What is mechanically decidable
 * ------------------------------
 * Whether a re-check was competent is not. Whether it was INDEPENDENT and
 * POSTERIOR is: two actors, two timestamps, and the finding's own reproduction
 * re-run after the fix. That is what this decides, and it is deliberately all it
 * claims — a distinct verifier is not necessarily a good one, and this module
 * cannot make it one. It removes the case where there was no second look at all.
 *
 * The four ways a closure fails, all of them observed or one step from it:
 *
 *   no-repro       the finding never carried a way to reproduce it, so nothing
 *                  can be shown to be fixed. The security report called its own
 *                  weaker items hypotheses for this reason.
 *   not-verified   a fix exists and no verification record does.
 *   self-verified  the verifier is the fixer. Today's case, twice.
 *   premature      the verification predates the fix — it verified the bug.
 *
 * Polarity, as everywhere here: a closure that cannot be shown independent has
 * not been shown independent. All four block.
 */

/** Actors compare case-insensitively and ignore a `great_cto-` agent prefix. */
function sameActor(a, b) {
  const norm = (x) => String(x ?? '').trim().toLowerCase().replace(/^great_cto-/, '');
  const na = norm(a); const nb = norm(b);
  return Boolean(na) && na === nb;
}

const ms = (t) => {
  const n = Date.parse(String(t ?? ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {object} finding
 *   {id, repro, fixedBy, fixedAt, verifiedBy, verifiedAt, reproResult}
 *   `reproResult` is the execution-claims verdict from re-running `repro`
 *   AFTER the fix: {status: 'passed'|'failed'|'not_run'|'refused'}.
 * @returns {{ok:boolean, reason:string, why:string}}
 */
export function closureDecision(finding = {}) {
  const { id = '(unnamed)', repro, fixedBy, fixedAt, verifiedBy, verifiedAt, reproResult } = finding;

  if (!repro) {
    return {
      ok: false,
      reason: 'no-repro',
      why: `${id} carries no reproduction — nothing can be shown to be fixed, so closing it is an opinion. `
        + 'A finding without a way to reproduce it is a hypothesis; record the command or the steps.',
    };
  }
  if (!fixedBy) {
    return { ok: false, reason: 'not-fixed', why: `${id} has no recorded fix.` };
  }
  if (!verifiedBy) {
    return {
      ok: false,
      reason: 'not-verified',
      why: `${id} was fixed by ${fixedBy} and nobody has verified it. `
        + 'A fix declared closed by its own author is an unreviewed change that reads like a reviewed one.',
    };
  }
  if (sameActor(verifiedBy, fixedBy)) {
    return {
      ok: false,
      reason: 'self-verified',
      why: `${id} was fixed and verified by the same actor (${fixedBy}). `
        + 'Independence is the whole content of a re-check: ask the agent that filed it, or any actor that did not write the fix.',
    };
  }

  const fAt = ms(fixedAt);
  const vAt = ms(verifiedAt);
  if (fixedAt != null && verifiedAt != null) {
    if (fAt === null || vAt === null) {
      return { ok: false, reason: 'premature', why: `${id} has an unreadable timestamp — the order of fix and verification cannot be established.` };
    }
    if (vAt < fAt) {
      return {
        ok: false,
        reason: 'premature',
        why: `${id} was verified before it was fixed — that verification looked at the bug, not the repair.`,
      };
    }
  }

  if (reproResult && reproResult.status !== 'passed') {
    return {
      ok: false,
      reason: 'repro-not-passing',
      why: `${id}: re-running its reproduction after the fix reported "${reproResult.status}". `
        + 'Only a reproduction that now passes shows the finding is gone; anything else leaves it open.',
    };
  }
  if (!reproResult) {
    return {
      ok: false,
      reason: 'repro-not-run',
      why: `${id}: its reproduction was never re-run after the fix. `
        + 'An unrun check is not a passing one.',
    };
  }

  return { ok: true, reason: 'closed', why: `${id} verified by ${verifiedBy}, independent of ${fixedBy}, with its reproduction passing.` };
}

/** Findings that may not be closed, with the reason each. */
export function blockedClosures(findings) {
  return (findings || [])
    .map((f) => ({ finding: f, decision: closureDecision(f) }))
    .filter((x) => !x.decision.ok);
}

/** One operator-facing block, or null when every closure holds. */
export function explainClosures(findings) {
  const blocked = blockedClosures(findings);
  if (!blocked.length) return null;
  const lines = [`${blocked.length} finding(s) cannot be called fixed:`];
  for (const b of blocked) lines.push(`  [${b.decision.reason}] ${b.decision.why}`);
  lines.push('');
  lines.push('This does not say the fixes are wrong. It says nobody independent has shown they are right,');
  lines.push('and a self-closed finding is indistinguishable from a verified one in every report that follows.');
  return lines.join('\n');
}
