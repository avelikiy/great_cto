// A node:test reporter that writes one CTRF (Common Test Report Format) JSON
// document: https://ctrf.io. Zero dependencies, so the gate can emit a machine-
// readable result for every suite without installing anything.
//
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//     --test-reporter=./scripts/lib/ctrf-reporter.mjs \
//     --test-reporter-destination=.great_cto/test-results/board.ctrf.json  <files>
//
// What it records, and what it refuses to blur:
//   - one entry per test, not per suite (`describe` blocks are containers);
//   - a skipped test is `skipped` with its reason as the message — never `passed`;
//   - a file that failed to load is a failed entry named after the file, so a
//     syntax error cannot vanish from the report.
// The document's `tool.name` is taken from GATE_SUITE (the gate step's label),
// so several reports can be merged and still say where each result came from.

const now = () => Date.now();

function statusOf(type, data) {
  if (type === 'test:fail') return 'failed';
  if (data.skip !== undefined && data.skip !== false) return 'skipped';
  if (data.todo !== undefined && data.todo !== false) return 'pending';
  return 'passed';
}

function messageOf(type, data) {
  if (type === 'test:fail') {
    const err = data.details?.error;
    const cause = err?.cause ?? err;
    return String(cause?.message ?? cause ?? 'failed').split('\n').slice(0, 20).join('\n');
  }
  if (typeof data.skip === 'string') return data.skip;
  if (typeof data.todo === 'string') return data.todo;
  return undefined;
}

function traceOf(data) {
  const err = data.details?.error;
  const cause = err?.cause ?? err;
  return typeof cause?.stack === 'string' ? cause.stack.split('\n').slice(0, 30).join('\n') : undefined;
}

/** Fold node:test events into a CTRF document. Exported for tests. */
export async function toCtrf(source, { suite = process.env.GATE_SUITE || 'node:test', clock = now } = {}) {
  const start = clock();
  const tests = [];
  const parents = [];
  for await (const { type, data } of source) {
    if (type === 'test:start') {
      parents[data.nesting] = data.name;
      continue;
    }
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    if (data.details?.type === 'suite') continue;
    const entry = {
      name: data.name,
      status: statusOf(type, data),
      duration: Math.round(data.details?.duration_ms ?? 0),
    };
    const message = messageOf(type, data);
    if (message) entry.message = message;
    if (type === 'test:fail') {
      const trace = traceOf(data);
      if (trace) entry.trace = trace;
    }
    if (data.file) entry.filePath = data.file;
    const chain = parents.slice(0, data.nesting).filter(Boolean);
    if (chain.length) entry.suite = chain.join(' > ');
    tests.push(entry);
  }
  const count = (s) => tests.filter((t) => t.status === s).length;
  return {
    reportFormat: 'CTRF',
    specVersion: '0.0.0',
    results: {
      tool: { name: suite },
      summary: {
        tests: tests.length,
        passed: count('passed'),
        failed: count('failed'),
        pending: count('pending'),
        skipped: count('skipped'),
        other: 0,
        start,
        stop: clock(),
      },
      tests,
    },
  };
}

export default async function* ctrfReporter(source) {
  yield JSON.stringify(await toCtrf(source), null, 2) + '\n';
}
