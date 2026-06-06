// scripts/lib/compress/line-importance.mjs — severity/keyword line scoring.
//
// Phase 1 of the headroom-inspired compression layer. Deterministic, $0 (no LLM).
// Ports headroom's line_importance + keyword_detector idea: score each line so a
// budget-bounded trim keeps the FATAL/ERROR/stack lines and crushes boilerplate.

// High-signal severity / failure markers (case-insensitive).
const HIGH = /\b(FATAL|PANIC|CRITICAL|ERROR|EXCEPTION|TRACEBACK|SEGFAULT|ASSERT(ION)?\s*FAIL|OOM|OUT OF MEMORY|FAILED|FAILURE|CRASH|UNCAUGHT|UNHANDLED)\b/i;
const MED = /\b(WARN(ING)?|DEPRECATED|RETRY|TIMEOUT|REFUSED|DENIED|INVALID|MISSING)\b/i;
// Stack-frame shapes: "at fn (file:12:3)", 'File "x.py", line 5', "x.rs:40:12", "#3 0x..".
const STACK = /(^\s*at\s+\S|File\s+"[^"]+",\s*line\s+\d+|\b[\w./-]+:\d+:\d+\b|^\s*#\d+\s+0x[0-9a-f]+)/;

/** Score a single line: 3 = high (failure), 2 = medium (warn/stack), 1 = low (boilerplate). */
export function scoreLine(line) {
  if (HIGH.test(line)) return 3;
  if (MED.test(line) || STACK.test(line)) return 2;
  return 1;
}

/** Score every line. Returns [{ i, line, score }]. */
export function scoreLines(text) {
  return String(text).split('\n').map((line, i) => ({ i, line, score: scoreLine(line) }));
}

/**
 * Trim text toward `budget` characters, keeping the most important lines plus
 * `context` neighbour lines around each high/medium line. Low-signal runs that
 * are dropped are replaced by a single "… N lines elided …" marker so the shape
 * is preserved and nothing is silently lost.
 *
 * Never drops a HIGH (score 3) line. If everything fits, returns the input.
 *
 * @returns {{ text: string, kept: number, total: number, elided: number }}
 */
export function trimByImportance(text, { budget = Infinity, context = 2 } = {}) {
  const lines = String(text).split('\n');
  const total = lines.length;
  if (text.length <= budget) return { text, kept: total, total, elided: 0 };

  const scores = lines.map(scoreLine);
  const keep = new Array(total).fill(false);

  // Always keep high/medium lines + their context window.
  for (let i = 0; i < total; i++) {
    if (scores[i] >= 2) {
      for (let j = Math.max(0, i - context); j <= Math.min(total - 1, i + context); j++) keep[j] = true;
    }
  }

  // If still over budget, we keep as-is (we never drop signal). If UNDER budget
  // after keeping signal, greedily add low lines from the top until we approach budget.
  let used = lines.filter((l, i) => keep[i]).reduce((a, l) => a + l.length + 1, 0);
  if (used < budget) {
    for (let i = 0; i < total && used < budget; i++) {
      if (!keep[i]) { keep[i] = true; used += lines[i].length + 1; }
    }
  }

  // Emit, collapsing dropped runs into a marker.
  const out = [];
  let elided = 0, run = 0;
  for (let i = 0; i < total; i++) {
    if (keep[i]) {
      if (run > 0) { out.push(`… ${run} line${run > 1 ? 's' : ''} elided …`); elided += run; run = 0; }
      out.push(lines[i]);
    } else {
      run++;
    }
  }
  if (run > 0) { out.push(`… ${run} line${run > 1 ? 's' : ''} elided …`); elided += run; }

  return { text: out.join('\n'), kept: total - elided, total, elided };
}
