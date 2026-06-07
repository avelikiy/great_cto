// scripts/lib/connectors/itgc-test.mjs — IT General Controls / SOX ITGC adapter (Phase 4, audit).
//
// run-test evaluates a single IT General Control against collected evidence and concludes whether
// the control is operating effectively or has an exception. Four ITGC domains are codified:
//   - logical-access:    terminated-user access, shared admin accounts, MFA, access-review recency.
//   - change-management: unapproved changes, unreviewed emergency changes, dev/prod segregation.
//   - it-operations:     unresolved failed jobs, monitoring gaps.
//   - backup-recovery:   stale restore tests, backup failures.
//
// Each exception is rated (deficiency / significant-deficiency / material-weakness) by type and
// count using real audit reasoning — e.g. terminated users retaining access or changes deployed
// with no approval are material-weakness candidates. Deterministic, no keys, no network.
//
// CRITICAL: any control rated significant-deficiency or material-weakness sets
// requiresPartnerSignoff=true. The autopilot performs the test work and proposes a severity, but
// only the CPA / engagement partner concludes on severity and signs the audit opinion. Set
// ITGC_TEST_URL to delegate execution to a real GRC platform (e.g. AuditBoard / ServiceNow GRC).

export const capabilities = ['run-test'];

const DAY = 86400000;
const SEV_RANK = { none: 0, deficiency: 1, 'significant-deficiency': 2, 'material-weakness': 3 };
const worse = (a, b) => (SEV_RANK[a] >= SEV_RANK[b] ? a : b);

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / DAY);
}

// Each evaluator returns { exceptions:[{code,label,severity}] }.
const EVALUATORS = {
  'logical-access'(ev = {}) {
    const ex = [];
    const terminated = Number(ev.terminatedUsersWithAccess || 0);
    const sharedAdmin = Number(ev.sharedAdminAccounts || 0);
    const mfaEnabled = ev.mfaEnabled !== false; // default-assume on only if explicitly true? be strict:
    const mfaOff = ev.mfaEnabled === false;
    const reviewAge = daysSince(ev.accessReviewDate);
    if (terminated > 0) {
      // Terminated users retaining access is a textbook material-weakness candidate.
      ex.push({ code: 'terminated-user-access', label: `${terminated} terminated user(s) retain system access`, severity: terminated >= 3 ? 'material-weakness' : 'significant-deficiency' });
    }
    if (sharedAdmin > 0) {
      ex.push({ code: 'shared-admin-accounts', label: `${sharedAdmin} shared/generic privileged account(s) — no individual accountability`, severity: sharedAdmin >= 2 ? 'significant-deficiency' : 'deficiency' });
    }
    if (mfaOff) {
      ex.push({ code: 'mfa-disabled', label: 'multi-factor authentication not enforced on privileged access', severity: 'significant-deficiency' });
    }
    if (reviewAge > 90) {
      ex.push({ code: 'access-review-stale', label: `periodic access review is stale (${reviewAge === Infinity ? 'never performed' : reviewAge + 'd'} — quarterly cadence breached)`, severity: 'deficiency' });
    }
    return { exceptions: ex };
  },

  'change-management'(ev = {}) {
    const ex = [];
    const unapproved = Number(ev.changesWithoutApproval || 0);
    const emergencyUnreviewed = Number(ev.emergencyChangesUnreviewed || 0);
    const segregation = ev.segregationDevProd !== false; // false = no segregation
    if (unapproved > 0) {
      // Code reaching production with no approval = material-weakness candidate.
      ex.push({ code: 'no-change-approval', label: `${unapproved} production change(s) deployed without documented approval`, severity: unapproved >= 3 ? 'material-weakness' : 'significant-deficiency' });
    }
    if (emergencyUnreviewed > 0) {
      ex.push({ code: 'emergency-change-unreviewed', label: `${emergencyUnreviewed} emergency change(s) lack retroactive review/approval`, severity: 'significant-deficiency' });
    }
    if (segregation === false || ev.segregationDevProd === false) {
      ex.push({ code: 'no-dev-prod-segregation', label: 'no segregation between development and production environments', severity: 'significant-deficiency' });
    }
    return { exceptions: ex };
  },

  'it-operations'(ev = {}) {
    const ex = [];
    const failedJobs = Number(ev.failedJobsUnresolved || 0);
    const monitoringGaps = Number(ev.monitoringGaps || 0);
    if (failedJobs > 0) {
      ex.push({ code: 'failed-jobs-unresolved', label: `${failedJobs} failed batch job(s) unresolved — data completeness at risk`, severity: failedJobs >= 5 ? 'significant-deficiency' : 'deficiency' });
    }
    if (monitoringGaps > 0) {
      ex.push({ code: 'monitoring-gaps', label: `${monitoringGaps} gap(s) in job/system monitoring coverage`, severity: 'deficiency' });
    }
    return { exceptions: ex };
  },

  'backup-recovery'(ev = {}) {
    const ex = [];
    const restoreAge = daysSince(ev.lastRestoreTestDate);
    const backupFailures = Number(ev.backupFailures || 0);
    if (restoreAge > 365) {
      ex.push({ code: 'restore-test-stale', label: `restore test stale (${restoreAge === Infinity ? 'never performed' : restoreAge + 'd'} — annual cadence breached); recoverability unproven`, severity: restoreAge === Infinity ? 'significant-deficiency' : 'deficiency' });
    }
    if (backupFailures > 0) {
      ex.push({ code: 'backup-failures', label: `${backupFailures} unremediated backup failure(s)`, severity: backupFailures >= 3 ? 'significant-deficiency' : 'deficiency' });
    }
    return { exceptions: ex };
  },
};

export async function call(op, payload = {}) {
  if (op === 'run-test') {
    const controlType = String(payload.controlType || '').toLowerCase().trim();
    const evidence = payload.evidence || {};
    const evaluate = EVALUATORS[controlType];
    if (!evaluate) {
      return { ok: false, error: `run-test needs controlType one of ${Object.keys(EVALUATORS).join(', ')}` };
    }

    // Real GRC platform delegation only when explicitly configured.
    const url = process.env.ITGC_TEST_URL;
    let note;
    if (url) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, controlType, evidence }),
        });
        if (res.ok) {
          const data = await res.json();
          return { ok: true, mode: 'live', data };
        }
        note = `GRC platform at ITGC_TEST_URL returned ${res.status}; fell back to built-in control logic`;
      } catch (e) {
        note = `GRC platform at ITGC_TEST_URL unreachable (${e.message}); evaluated with built-in control logic`;
      }
    } else {
      note = 'evaluated with built-in ITGC control logic (set ITGC_TEST_URL to delegate to a GRC platform)';
    }

    const { exceptions } = evaluate(evidence);
    const severity = exceptions.reduce((acc, e) => worse(acc, e.severity), 'none');
    const result = exceptions.length ? 'exception' : 'effective';
    // Only the CPA / engagement partner concludes on severity and the opinion: any control rated
    // significant-deficiency or material-weakness must be escalated for partner sign-off.
    const requiresPartnerSignoff = SEV_RANK[severity] >= SEV_RANK['significant-deficiency'];

    return { ok: true, mode: 'evaluated', data: {
      controlType,
      result,
      exceptions: exceptions.map(({ code, label }) => ({ code, label })),
      severity,
      requiresPartnerSignoff,
      note,
    } };
  }

  return { ok: false, error: `itgc-test adapter has no op '${op}'` };
}

// ---- CLI -------------------------------------------------------------------
// Usage:
//   node itgc-test.mjs run-test '{"controlType":"logical-access","evidence":{...}}'
// With no args, runs the built-in smoke tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [op, json] = process.argv.slice(2);
  const run = async (label, payload) => {
    const out = await call('run-test', payload);
    console.log(`\n# ${label}`);
    console.log(JSON.stringify(out, null, 2));
    return out;
  };

  if (op) {
    let payload = {};
    try { payload = json ? JSON.parse(json) : {}; }
    catch (e) { console.error('bad JSON payload:', e.message); process.exit(1); }
    call(op, payload).then((out) => {
      console.log(JSON.stringify(out, null, 2));
      process.exit(out.ok ? 0 : 1);
    });
  } else {
    (async () => {
      // Smoke 1: clean logical-access control → effective.
      const clean = await run('logical-access (clean) → effective', {
        controlType: 'logical-access',
        evidence: { terminatedUsersWithAccess: 0, sharedAdminAccounts: 0, mfaEnabled: true, accessReviewDate: new Date(Date.now() - 30 * DAY).toISOString() },
      });

      // Smoke 2: terminated user retains access → exception + high severity + partner sign-off.
      const dirty = await run('logical-access (terminated-user access) → exception', {
        controlType: 'logical-access',
        evidence: { terminatedUsersWithAccess: 4, sharedAdminAccounts: 1, mfaEnabled: false, accessReviewDate: '2024-01-01' },
      });

      const ok =
        clean.data.result === 'effective' && clean.data.requiresPartnerSignoff === false &&
        dirty.data.result === 'exception' && dirty.data.severity === 'material-weakness' &&
        dirty.data.requiresPartnerSignoff === true;
      console.log(`\nSMOKE ${ok ? 'PASS' : 'FAIL'}`);
      process.exit(ok ? 0 : 1);
    })();
  }
}
