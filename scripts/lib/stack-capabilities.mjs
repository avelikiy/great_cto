/**
 * stack-capabilities — what THIS project's operational tools actually are.
 *
 * `l3-support` carries a routing table with thirteen alert sources: grafana,
 * datadog, cloudwatch, eks, argocd, sentry, postgres, kafka, airflow, vercel,
 * betterstack, mongo, and a generic row. It is a good table. What it cannot say
 * is which of those thirteen rows is THIS project — so the agent infers the
 * stack from whatever the alert happened to come from, at the moment somebody is
 * being paged, and its generic fallback row guesses Grafana.
 *
 * `PROJECT.md` already carries a `stack:` line, but it is prose for humans
 * ("TypeScript / Node.js 22 / Cloudflare Workers"). It names no log store, no
 * pager, no error tracker. `stack-baseline` pins what a NEW product should be
 * built with; `observability-baseline` wires it at scaffold time. Neither
 * describes what an existing project has connected today.
 *
 * Borrowed from anthropics/oncall-kit, whose rule is that no skill names a
 * vendor: skills refer to CAPABILITIES, and one file maps each capability to the
 * tool the team actually has. Swap Datadog for Grafana and no skill changes.
 *
 * The vocabulary is deliberately small and closed. An open-ended map becomes a
 * place to write anything, and then nothing can be resolved against it.
 *
 * Declared in PROJECT.md:
 *
 *     capabilities:
 *       logs: grafana-loki
 *       metrics: grafana
 *       errors: sentry
 *       pager: none
 *
 * THREE STATES PER CAPABILITY, never two. `undeclared` and `none` are different
 * answers: the first means nobody has said, the second means the project has
 * deliberately decided it has no pager. An agent that treats "nobody said" as
 * "there is none" stops looking for something that exists.
 */

/** The closed vocabulary. Adding one is a deliberate edit, not a free-text key. */
export const CAPABILITIES = Object.freeze([
  'logs',      // where log lines are searched
  'metrics',   // time-series and dashboards
  'traces',    // distributed traces
  'errors',    // exception capture and grouping
  'alerts',    // what fires, and where its rules live
  'pager',     // who gets woken
  'deploys',   // what shipped, and when
  'code-host', // where the diff and the PR live
]);

/** `none` is a decision. Anything else is a tool name we pass through verbatim. */
const NONE = 'none';

/**
 * @returns {{state:'declared'|'none'|'undeclared', tool:string|null}}
 */
function stateOf(raw) {
  if (raw == null) return { state: 'undeclared', tool: null };
  const v = String(raw).trim();
  if (!v) return { state: 'undeclared', tool: null };
  if (v.toLowerCase() === NONE) return { state: NONE, tool: null };
  return { state: 'declared', tool: v };
}

/**
 * Read the capability block out of a PROJECT.md body.
 *
 * Parsed with the same shape as `levelFromProjectMd` — a top-level key followed
 * by indented `name: value` lines — rather than by pulling in a YAML parser the
 * board's zero-dependency rule forbids.
 *
 * @returns {{map: Record<string,{state:string,tool:string|null}>, declaredCount:number, unknownKeys:string[]}}
 */
export function capabilitiesFromProjectMd(text = '') {
  const body = String(text);
  const start = body.match(/^capabilities:[ \t]*$/m);
  const raw = {};
  const unknownKeys = [];

  if (start) {
    const after = body.slice(start.index + start[0].length);
    for (const line of after.split('\n')) {
      if (/^\S/.test(line)) break;                 // dedent ends the block
      const m = line.match(/^[ \t]+([a-z][a-z0-9-]*)\s*:\s*(.*)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase();
      // An unrecognised key is REPORTED, not dropped. A capability nobody reads
      // because it was misspelled is the same as one nobody wrote, except that
      // the author believes it is there.
      if (!CAPABILITIES.includes(key)) { unknownKeys.push(key); continue; }
      raw[key] = m[2];
    }
  }

  const map = {};
  let declaredCount = 0;
  for (const cap of CAPABILITIES) {
    map[cap] = stateOf(raw[cap]);
    if (map[cap].state === 'declared') declaredCount++;
  }
  return { map, declaredCount, unknownKeys };
}

/**
 * A line an agent can act on, for one capability.
 *
 * The `undeclared` wording matters: it must send the reader to find out, not let
 * them conclude there is nothing there. This is the sentence l3-support reads at
 * 3am, so it says what to do rather than what is missing.
 */
export function describeCapability(cap, entry) {
  if (entry.state === 'declared') return `${cap}: ${entry.tool}`;
  if (entry.state === NONE) return `${cap}: none — this project has decided it has no ${cap}`;
  return `${cap}: not declared — do not assume there is none; ask, or fall back to the alert-source routing table`;
}

/** The whole block, for injection into an agent brief. */
export function describeCapabilities({ map, declaredCount, unknownKeys }) {
  const lines = CAPABILITIES.map((c) => `  ${describeCapability(c, map[c])}`);
  const head = declaredCount === 0
    ? 'This project declares NO operational capabilities. Nothing below is known;'
      + ' route by alert source and say so rather than implying the stack was checked.'
    : `This project declares ${declaredCount} of ${CAPABILITIES.length} capabilities.`;
  const warn = unknownKeys.length
    ? [`  ⚠ unrecognised capability key(s) in PROJECT.md, ignored: ${unknownKeys.join(', ')}`]
    : [];
  return [head, ...lines, ...warn].join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Read by l3-support at the top of an incident, the same way /recall reaches
// memory-search: a block in the agent's own prompt, no new plumbing.
//
//   node scripts/lib/stack-capabilities.mjs [--cwd DIR] [--json]
//
// Exit 0 always. A project with nothing declared is a fact to report, not an
// error to fail on — failing here would make an unconfigured project unable to
// run an incident, which is exactly when you need the agent most.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const args = process.argv.slice(2);
  const cwd = args.includes('--cwd') ? args[args.indexOf('--cwd') + 1] : process.cwd();
  const asJson = args.includes('--json');

  let text = '', read = 'ok';
  try { text = readFileSync(join(cwd, '.great_cto', 'PROJECT.md'), 'utf8'); }
  catch (err) { read = err.code ?? String(err.message); }

  const result = capabilitiesFromProjectMd(text);
  if (asJson) {
    console.log(JSON.stringify({ read, ...result }, null, 2));
  } else if (read !== 'ok') {
    // Distinct from "declares nothing": there was no PROJECT.md to read at all.
    console.log(`no PROJECT.md under ${cwd}/.great_cto (${read}) — the project's capabilities are unknown, not absent.`);
  } else {
    console.log(describeCapabilities(result));
  }
}
