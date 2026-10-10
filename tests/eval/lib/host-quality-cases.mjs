// Evaluator-only corpus. Never copy this file into a worker workspace or prompt.
const check = (id, args, expected) => ({ id, args, expected });
export const cases = [
  {
    id: 'money', fn: 'parseMinor',
    spec: 'Export parseMinor(value) from src/solution.mjs. Accept only a primitive string matching an optional minus sign, one or more ASCII digits, and an optional dot followed by one or two digits. No whitespace, plus sign, exponent, empty fractional part or other characters. Convert exactly to integer cents and return a decimal string, canonicalizing leading zeros and negative zero. Support arbitrarily large magnitudes without Number precision loss. Return null for invalid input. No imports, dependencies, I/O or global mutation.',
    tests: [check('integer', ['12'], '1200'), check('fraction', ['12.3'], '1230'),
      check('negative', ['-0.01'], '-1'), check('zero', ['-000.00'], '0'),
      check('leading', ['00012.09'], '1209'), check('large', ['9007199254740993.99'], '900719925474099399'),
      check('space', [' 1.00'], null), check('exponent', ['1e2'], null),
      check('precision', ['1.001'], null), check('dot', ['1.'], null),
      check('type', [1], null), check('plus', ['+1'], null)],
  },
  {
    id: 'retry', fn: 'retryDelay',
    spec: 'Export retryDelay(attempt, base, cap, retryAfter) from src/solution.mjs. attempt must be a nonnegative safe integer; base and cap must be nonnegative finite numbers; retryAfter must be undefined, null, or a nonnegative finite number. Return null for invalid input. Otherwise return min(cap, max(base * 2**attempt, retryAfter ?? 0)). Avoid NaN when base is zero and attempt is huge: zero exponential delay stays zero. Inputs are milliseconds, no randomness or mutation. No imports, dependencies or I/O.',
    tests: [check('first', [0, 100, 1000], 100), check('doubling', [3, 100, 1000], 800),
      check('cap', [10, 100, 1000], 1000), check('header', [0, 100, 1000, 500], 500),
      check('header-cap', [0, 100, 1000, 5000], 1000), check('zero-overflow', [100000, 0, 1000], 0),
      check('overflow', [100000, 1, 1000], 1000), check('negative', [-1, 1, 10], null),
      check('fractional', [0.5, 1, 10], null), check('unsafe', [9007199254740992, 1, 10], null),
      check('wrong-type', [1, '10', 100], null), check('header-invalid', [1, 10, 100, -1], null)],
  },
  {
    id: 'dedup', fn: 'deduplicate',
    spec: 'Export deduplicate(events) from src/solution.mjs. Return null unless events is an array and each entry is a non-null non-array object with own primitive nonempty string properties tenant and id. Whitespace strings are nonempty and valid. Return the first event for each exact (tenant,id) pair in input order, preserving other fields, without mutating input. Pair identity must not collide for delimiters, Unicode, __proto__, constructor or toString. No imports, dependencies, I/O or global mutation.',
    tests: [check('empty', [[]], []), check('first', [[{ tenant: 'a', id: '1', v: 1 }, { tenant: 'a', id: '1', v: 2 }]], [{ tenant: 'a', id: '1', v: 1 }]),
      check('tenants', [[{ tenant: 'a', id: '1' }, { tenant: 'b', id: '1' }]], [{ tenant: 'a', id: '1' }, { tenant: 'b', id: '1' }]),
      check('delimiter', [[{ tenant: 'a|b', id: 'c' }, { tenant: 'a', id: 'b|c' }]], [{ tenant: 'a|b', id: 'c' }, { tenant: 'a', id: 'b|c' }]),
      check('prototype', [[{ tenant: '__proto__', id: 'constructor' }, { tenant: '__proto__', id: 'toString' }]], [{ tenant: '__proto__', id: 'constructor' }, { tenant: '__proto__', id: 'toString' }]),
      check('unicode', [[{ tenant: 'α', id: 'β' }, { tenant: 'α', id: 'β' }]], [{ tenant: 'α', id: 'β' }]),
      check('spaces', [[{ tenant: ' ', id: ' ' }]], [{ tenant: ' ', id: ' ' }]),
      check('invalid-tail', [[{ tenant: 'a', id: '1' }, null]], null),
      check('array-entry', [[[]]], null), check('type', ['x'], null),
      check('empty-id', [[{ tenant: 'a', id: '' }]], null), check('numeric-id', [[{ tenant: 'a', id: 1 }]], null)],
  },
];
