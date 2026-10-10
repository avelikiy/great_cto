export const arms = Object.freeze({
  codex: ['codex', 'codex', 'codex'],
  claude: ['claude-code', 'claude-code', 'claude-code'],
  mixed: ['codex', 'claude-code', 'codex'],
});

export function summarize(rows) {
  const byArm = Object.fromEntries(Object.keys(arms).map(arm => {
    const runs = rows.filter(r => r.arm === arm);
    const completed = runs.filter(r => r.status === 'completed');
    const checks = completed.reduce((a, r) => ({ passed: a.passed + r.final.passed, total: a.total + r.final.total }), { passed: 0, total: 0 });
    return [arm, { attempted: runs.length, completed: completed.length,
      blocked: runs.filter(r => r.status === 'blocked').length,
      interrupted: runs.filter(r => r.status === 'interrupted').length,
      running: runs.filter(r => r.status === 'running').length,
      tasksPassed: completed.filter(r => r.final.passed === r.final.total).length,
      workflowTaskPassRate: runs.length ? completed.filter(r => r.final.passed === r.final.total).length / runs.length : null,
      checkPassRate: checks.total ? checks.passed / checks.total : null,
      elapsedMs: completed.reduce((n, r) => n + r.elapsedMs, 0),
      costUsd: null }];
  }));
  // Compare only complete matched task/repetition blocks, never drop a failed host
  // and then call the surviving arms better. Individual assertions aren't samples.
  const keys = [...new Set(rows.map(r => `${r.task}:${r.repetition}`))];
  const matched = keys.filter(key => Object.keys(arms).every(arm => rows.some(r =>
    `${r.task}:${r.repetition}` === key && r.arm === arm && r.status === 'completed')));
  const rates = Object.fromEntries(Object.keys(arms).map(arm => {
    const paired = rows.filter(r => r.arm === arm && matched.includes(`${r.task}:${r.repetition}`));
    return [arm, paired.length ? paired.filter(r => r.final.passed === r.final.total).length / paired.length : null];
  }));
  const comparisons = Object.fromEntries(['codex', 'claude'].map(baseline => {
    const base = rates[baseline], mixed = rates.mixed;
    return [baseline, { deltaPercentagePoints: base === null ? null : (mixed - base) * 100,
      relativePercent: base === null || base === 0 ? null : (mixed - base) / base * 100 }];
  }));
  return { byArm, matchedBlocks: matched.length, pairedTaskPassRates: rates, comparisons,
    conclusion: 'exploratory pilot; no population-level product-quality claim',
    confidenceInterval: null, costComparable: false };
}
