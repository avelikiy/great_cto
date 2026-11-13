#!/usr/bin/env node
/**
 * verdict-authorship-guard — PreToolUse for Bash (inside bash-guards.mjs) and for
 * Edit | Write | MultiEdit (its own hook). ADR-051, slice 1.
 *
 * A verdict in .great_cto/verdicts/<role>.log moves the pipeline and is what a deploy
 * checks. ADR-046 seals each line, and says what the seal does not do: "an agent can
 * run `log-verdict.sh qa-engineer PASS` without being the QA agent". The seal proves
 * the writer ran, not who asked it to. Two refusals close the casual half of that:
 *
 *   1. A SUBAGENT writes only its OWN role. Claude Code hands a PreToolUse hook
 *      fired inside a subagent that subagent's `agent_type`, which the agent does not
 *      choose per call. A writer call — `log-verdict.sh <role> …`, or
 *      `AGENT=<role> … verdict-record.mjs --emit` — naming another role is refused,
 *      and so is a role the hook cannot read (a variable, a `<placeholder>`).
 *      The main session (no agent_type) is not covered here: a human watches it, and
 *      /review writes its own `review` verdict from it. ADR-051 slices 2–3.
 *   2. NOBODY writes a verdict log except through the writer. A shell redirect, tee,
 *      sed -i, cp/mv/rm/truncate/dd whose target is inside .great_cto/verdicts/, and an
 *      Edit/Write/MultiEdit of a file there, are refused. A hand-written line already
 *      fails its seal; a deleted or truncated log is evidence gone (ADR-009).
 *
 * A speed bump, not a lock: the writer's path in a variable, or a `node -e` importing
 * the seal, goes round rule 1. ADR-051 "What this does not do".
 *
 * Off switch (the operator's own shell, for repairing a log by hand):
 *   GREAT_CTO_DISABLE_VERDICT_GUARD=1
 */
import { isAbsolute, resolve } from 'node:path';
import { PASS, deny, emit, readStdinOnce } from '../lib/guard-result.mjs';
import { simpleCommands, base } from '../lib/shell-commands.mjs';
import { shellWriteTargets } from './frozen-gates-guard.mjs';
import { isMainModule } from '../lib/is-main.mjs';

const WRITER = 'log-verdict.sh';
const EMITTER = 'verdict-record.mjs';
const ROLE = /^[a-z0-9][a-z0-9-]*$/;

/** `great-cto:qa-engineer`, `great_cto-qa-engineer` and `qa-engineer` are one role. */
export function roleOf(agentType) {
  return String(agentType ?? '').trim().replace(/^great[-_]cto[:-]/, '');
}

const INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'source', '.']);

/** Is w[at] what runs — the command itself, or the script an interpreter is handed? `cat x.sh` is not. */
function runsScript(w, at) {
  if (at === 0) return true;
  return INTERPRETERS.has(base(w[0])) && w.slice(1, at).every((x) => x.startsWith('-'));
}

/**
 * The roles a shell command records a verdict for, as written — `null` where the
 * role is not a literal the hook can read. Words, not strings: an echo that
 * mentions log-verdict.sh records nothing.
 */
export function verdictWrites(command) {
  const out = [];
  for (const c of simpleCommands(String(command ?? ''))) {
    // `bash -c '…'` is reported once more after its expansion; `bash file …` is not
    // expanded, so the writer is read off that entry's own words.
    if (c.shell && c.script !== null) continue;
    const w = c.words;
    const at = w.findIndex((x) => base(x) === WRITER);
    if (at !== -1 && runsScript(w, at)) {
      const role = w[at + 1];
      out.push(role !== undefined && ROLE.test(role) ? role : null);
      continue;
    }
    if (w.some((x) => base(x) === EMITTER) && w.includes('--emit')) {
      const role = c.env?.AGENT;
      out.push(role !== undefined && ROLE.test(role) ? role : null);
    }
  }
  return out;
}

/** Is `p` inside the project's verdict directory (or that directory itself)? */
export function isVerdictPath(p, { cwd = process.cwd(), dir = process.env.GREAT_CTO_DIR } = {}) {
  if (!p) return false;
  const norm = String(p).replace(/\\/g, '/');
  if (/(^|\/)\.great_cto\/verdicts(\/|$)/.test(norm)) return true;
  if (dir) {
    const abs = (x) => (isAbsolute(x) ? resolve(x) : resolve(cwd, x)).replace(/\\/g, '/');
    const vdir = abs(`${dir}/verdicts`);
    const target = abs(norm);
    return target === vdir || target.startsWith(`${vdir}/`);
  }
  return false;
}

function editPath(d) {
  const ti = d.tool_input || d.toolInput || {};
  return d.file_path || ti.file_path || ti.path || null;
}

/** The decision for one tool-call payload, as a value (scripts/lib/guard-result.mjs). */
export function run(raw, env = process.env) {
  if (env.GREAT_CTO_DISABLE_VERDICT_GUARD === '1' || !raw) return PASS;
  let d;
  try { d = JSON.parse(raw); } catch { return PASS; }
  if (!d || typeof d !== 'object') return PASS;
  const cwd = d.cwd || process.cwd();
  const where = { cwd, dir: env.GREAT_CTO_DIR };
  const off = 'The operator can repair a log by hand with GREAT_CTO_DISABLE_VERDICT_GUARD=1 in their own shell.';

  if (d.tool_name === 'Bash') {
    const command = d.tool_input?.command;
    const self = roleOf(d.agent_type);
    if (self) {
      for (const role of verdictWrites(command)) {
        if (role === self) continue;
        const reason = role === null
          ? `a ${self} subagent called the verdict writer with a role this check cannot read. ` +
            `Call it with your own role spelled out: scripts/log-verdict.sh ${self} <VERDICT> auto … (ADR-051).`
          : `a ${self} subagent tried to record a verdict for ${role}. A role records only its own ` +
            `verdict; ${role}'s verdict comes from a ${role} run (ADR-051).`;
        return deny({ guard: 'verdict-authorship', tag: 'verdict-authorship', reason });
      }
    }
    const target = shellWriteTargets(command).find((p) => isVerdictPath(p, where));
    if (target) {
      return deny({
        guard: 'verdict-authorship', tag: 'verdict-authorship',
        reason: `${target} is a verdict log. It is written only by scripts/log-verdict.sh, never ` +
          `edited, truncated, moved or deleted from a shell (ADR-051, ADR-046). ${off}`,
      });
    }
    return PASS;
  }

  if (d.tool_name === 'Edit' || d.tool_name === 'Write' || d.tool_name === 'MultiEdit') {
    const p = editPath(d);
    if (!isVerdictPath(p, where)) return PASS;
    return deny({
      guard: 'verdict-authorship', tag: 'verdict-authorship', what: 'edit',
      reason: `${p} is a verdict log. It is written only by scripts/log-verdict.sh, never with ` +
        `${d.tool_name} (ADR-051, ADR-046). ${off}`,
    });
  }
  return PASS;
}

if (isMainModule(import.meta.url)) emit(run(readStdinOnce()));
