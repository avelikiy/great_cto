#!/usr/bin/env node
// GitHub Actions workflow security — checked, not described.
//
// security-officer's prompt used to say "look for pull_request_target misuse and
// script injection" and leave the rest to reading YAML by eye. Both classic
// attacks are one line each: a pwn-request is a `ref:` pointing at the PR head
// in a workflow that runs with the base repo's token and secrets; a script
// injection is `${{ github.event.issue.title }}` pasted straight into `run:`,
// where the shell sees attacker text as code. A deterministic scan finds both
// every time, with file:line, for zero tokens.
//
// Usage: node scripts/lib/workflow-security.mjs [--cwd DIR] [--json]
//   Scans DIR/.github/workflows/*.yml|*.yaml. Exit 1 if any HIGH finding.
//
// Zero dependencies: a small indentation-based YAML reader covers what workflow
// files actually use (block maps/sequences, block scalars, one-line flow lists
// and maps, comments). Anchors, aliases and multi-document streams are not
// supported — GitHub itself rejects most of them in workflows.
import { readdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── tiny YAML reader ────────────────────────────────────────────────────────

class YMap {
  constructor(line) { this.type = 'map'; this.line = line; this.entries = []; }
  get(key) { const e = this.entries.find((x) => x.key === key); return e ? e.value : undefined; }
  has(key) { return this.entries.some((x) => x.key === key); }
  entry(key) { return this.entries.find((x) => x.key === key); }
}
class YSeq {
  constructor(line) { this.type = 'seq'; this.line = line; this.items = []; }
}
const scalar = (value, line, extra = {}) => ({ type: 'scalar', value, line, ...extra });

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { if (i === 0 || /[\s:[{,]/.test(s[i - 1])) q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function splitFlow(inner) {
  const parts = [];
  let depth = 0; let q = null; let cur = '';
  for (const c of inner) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseInline(text, line) {
  const t = text.trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    const seq = new YSeq(line);
    for (const p of splitFlow(t.slice(1, -1))) seq.items.push(parseInline(p, line));
    return seq;
  }
  if (t.startsWith('{') && t.endsWith('}')) {
    const map = new YMap(line);
    for (const p of splitFlow(t.slice(1, -1))) {
      const m = p.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
      if (m) map.entries.push({ key: unquote(m[1]), line, value: parseInline(m[2], line) });
    }
    return map;
  }
  return scalar(unquote(t), line, { raw: t });
}

const KEY_RE = /^("[^"]*"|'[^']*'|[^\s"'#\-[{][^:]*?|-[^\s][^:]*?)\s*:(?:\s+(.*))?$/;
const indentOf = (s) => s.match(/^ */)[0].length;
const isBlank = (s) => /^\s*(#.*)?$/.test(s);

/** Parse workflow YAML into YMap / YSeq / scalar nodes that carry 1-based line numbers. */
export function parseYaml(text) {
  const L = String(text).replace(/\t/g, '  ').split(/\r?\n/);
  let i = 0;
  const skip = () => { while (i < L.length && isBlank(L[i])) i++; };

  function blockScalar(parentIndent, keyLine, style) {
    const lines = [];
    let contentIndent = null;
    while (i < L.length) {
      const s = L[i];
      if (s.trim() === '') { lines.push({ text: '', line: i + 1 }); i++; continue; }
      const ind = indentOf(s);
      if (ind <= parentIndent) break;
      if (contentIndent === null) contentIndent = ind;
      if (ind < contentIndent) break;
      lines.push({ text: s.slice(contentIndent), line: i + 1 });
      i++;
    }
    while (lines.length && lines.at(-1).text === '') lines.pop();
    const value = lines.map((l) => l.text).join(style === '>' ? ' ' : '\n');
    return scalar(value, keyLine, { block: true, lines });
  }

  function node(minIndent) {
    skip();
    if (i >= L.length) return null;
    const ind = indentOf(L[i]);
    if (ind < minIndent) return null;
    const content = L[i].slice(ind);
    if (content === '-' || content.startsWith('- ')) return seq(ind);
    if (KEY_RE.test(stripComment(content))) return map(ind);
    const line = i + 1;
    // plain or flow scalar, possibly continued on more-indented lines
    let text = stripComment(content);
    i++;
    while (i < L.length && !isBlank(L[i]) && indentOf(L[i]) > ind - 1 && indentOf(L[i]) >= minIndent
      && !KEY_RE.test(stripComment(L[i].trim())) && !L[i].trim().startsWith('- ')) {
      text += ` ${stripComment(L[i].trim())}`; i++;
    }
    return parseInline(text, line);
  }

  function seq(ind) {
    const out = new YSeq(i + 1);
    for (;;) {
      skip();
      if (i >= L.length || indentOf(L[i]) !== ind) break;
      const content = L[i].slice(ind);
      if (!(content === '-' || content.startsWith('- '))) break;
      const rest = content.slice(1);
      if (rest.trim() === '' || rest.trim().startsWith('#')) {
        i++;
        out.items.push(node(ind + 1) ?? scalar(null, i));
        continue;
      }
      const col = ind + 1 + indentOf(rest);
      L[i] = ' '.repeat(col) + rest.trimStart();
      out.items.push(node(col) ?? scalar(null, i + 1));
    }
    return out;
  }

  function map(ind) {
    const out = new YMap(i + 1);
    for (;;) {
      skip();
      if (i >= L.length || indentOf(L[i]) !== ind) break;
      const content = stripComment(L[i].slice(ind));
      const m = content.match(KEY_RE);
      if (!m) break;
      const key = unquote(m[1]);
      const keyLine = i + 1;
      const rest = (m[2] ?? '').trim();
      i++;
      let value;
      if (rest === '') {
        skip();
        if (i < L.length && indentOf(L[i]) === ind && /^-(\s|$)/.test(L[i].slice(ind))) value = seq(ind);
        else value = node(ind + 1) ?? scalar(null, keyLine);
      } else if (/^[|>][-+0-9]*$/.test(rest)) {
        value = blockScalar(ind, keyLine, rest[0]);
      } else if ((rest.startsWith('[') && !rest.endsWith(']')) || (rest.startsWith('{') && !rest.endsWith('}'))) {
        // multi-line flow collection: gather until it closes
        let text = rest;
        const close = rest[0] === '[' ? ']' : '}';
        while (i < L.length && !text.trimEnd().endsWith(close)) { text += ` ${stripComment(L[i].trim())}`; i++; }
        value = parseInline(text, keyLine);
      } else {
        value = parseInline(rest, keyLine);
      }
      out.entries.push({ key, line: keyLine, value });
    }
    return out;
  }

  return node(0) ?? new YMap(1);
}

// ── rules ───────────────────────────────────────────────────────────────────

const PRIVILEGED = new Set(['pull_request_target', 'workflow_run']);

// Event fields an outside contributor controls — GitHub's own list of
// "potentially untrusted input". Deliberately excludes .sha/.number and base.*.
const UNTRUSTED_EXPR = [
  /\bgithub\.head_ref\b/,
  /\bgithub\.event\.(?:issue|pull_request|discussion)\.(?:title|body)\b/,
  /\bgithub\.event\.pull_request\.head\.(?:ref|label|repo\.default_branch)\b/,
  /\bgithub\.event\.(?:comment|review|review_comment|discussion_comment)\.body\b/,
  /\bgithub\.event\.pages(?:\[[^\]]*\]|\.\*)?\.page_name\b/,
  /\bgithub\.event\.(?:workflow_run\.)?head_commit\.(?:message|author\.(?:email|name)|committer\.(?:email|name))\b/,
  /\bgithub\.event\.commits(?:\[[^\]]*\]|\.\*)?\.(?:message|author\.(?:email|name)|committer\.(?:email|name))\b/,
  /\bgithub\.event\.workflow_run\.(?:head_branch|display_title)\b/,
  /\bgithub\.event\.workflow_run\.pull_requests(?:\[[^\]]*\]|\.\*)?\.head\.ref\b/,
];
const isUntrustedExpr = (inner) => UNTRUSTED_EXPR.some((re) => re.test(inner));

// A checkout `ref:` / `repository:` that resolves to the contributor's code.
const PR_HEAD_REF = [
  /\bgithub\.event\.pull_request\.head\.(?:sha|ref|repo\.full_name)\b/,
  /\bgithub\.head_ref\b/,
  /\bgithub\.event\.workflow_run\.(?:head_sha|head_branch|head_repository(?:\.[\w.]+)?)\b/,
  /\bgithub\.event\.workflow_run\.pull_requests(?:\[[^\]]*\]|\.\*)?\.head\.(?:sha|ref|repo\.full_name)\b/,
  /\brefs\/(?:remotes\/)?pull\//,
];

// Commands that execute the checked-out tree (build scripts, test runners, installs with lifecycle hooks).
const EXECUTES_CODE = /\b(?:npm|pnpm|yarn|bun|npx)\s+(?:ci|install|i|run|test|exec|build)\b|\bmake\b|\bpip\s+install\b|\bpython3?\s|\bnode\s|\bgo\s+(?:run|test|build|generate)\b|\bcargo\s|\bmvn\b|\bgradlew?\b|\bbundle\s+exec\b|\brake\b|\bpytest\b|\btox\b|\.\/[\w./-]+/;

const EXPR_RE = /\$\{\{([\s\S]*?)\}\}/g;

function triggersOf(root) {
  const on = root.get?.('on') ?? root.get?.('true');
  const out = new Set();
  if (!on) return out;
  if (on.type === 'scalar' && on.value) out.add(String(on.value));
  if (on.type === 'seq') for (const it of on.items) if (it.type === 'scalar') out.add(String(it.value));
  if (on.type === 'map') for (const e of on.entries) out.add(e.key);
  return out;
}

/** Flatten a node into [{text, line}] leaf strings, block scalars line by line. */
function leaves(n, out = []) {
  if (!n) return out;
  if (n.type === 'scalar') {
    if (n.block) for (const l of n.lines) out.push({ text: l.text, line: l.line });
    else if (n.value != null) out.push({ text: String(n.value), line: n.line });
  } else if (n.type === 'seq') for (const it of n.items) leaves(it, out);
  else if (n.type === 'map') for (const e of n.entries) leaves(e.value, out);
  return out;
}

const scalarText = (n) => (n && n.type === 'scalar' && n.value != null ? String(n.value) : '');

function parseUses(ref) {
  const s = ref.trim();
  if (s.startsWith('./') || s.startsWith('.\\')) return { local: true };
  if (s.startsWith('docker://')) return { docker: true, pinned: /@sha256:[0-9a-f]{64}$/.test(s) };
  const at = s.lastIndexOf('@');
  const path = at >= 0 ? s.slice(0, at) : s;
  const version = at >= 0 ? s.slice(at + 1) : '';
  const owner = path.split('/')[0].toLowerCase();
  return { owner, path, version, pinned: /^[0-9a-f]{40}$/.test(version) };
}

function permissionFindings(permNode, where, add, privileged, triggerList) {
  if (!permNode) return;
  if (permNode.type === 'scalar' && /^write-all$/i.test(scalarText(permNode))) {
    add('MEDIUM', 'permissions-write-all', permNode.line,
      `${where} grants permissions: write-all — every scope of GITHUB_TOKEN is writable; list only the scopes the job needs`);
    return;
  }
  if (permNode.type === 'map' && privileged) {
    const e = permNode.entry('contents');
    if (e && /^write$/i.test(scalarText(e.value))) {
      add('MEDIUM', 'contents-write-untrusted', e.line,
        `${where} has contents: write under ${triggerList} — a token that can push to the repo sits next to contributor-controlled input`);
    }
  }
}

/** Scan one workflow's text. Returns findings [{severity, rule, file, line, message}]. */
export function scanWorkflow(text, file = 'workflow.yml') {
  const findings = [];
  const add = (severity, rule, line, message) => findings.push({ severity, rule, file, line, message });

  // Line rule first: independent of structure, so it also catches `>> $GITHUB_ENV`.
  String(text).split(/\r?\n/).forEach((s, idx) => {
    if (/^\s*#/.test(s)) return;
    if (/ACTIONS_ALLOW_UNSECURE_COMMANDS['"]?\s*[:=]\s*['"]?true\b/i.test(s)) {
      add('MEDIUM', 'unsecure-commands', idx + 1,
        'ACTIONS_ALLOW_UNSECURE_COMMANDS: true re-enables set-env/add-path — any step output can rewrite the environment and PATH');
    }
  });

  let root;
  try { root = parseYaml(text); } catch (err) {
    add('LOW', 'parse-error', 1, `could not parse workflow: ${err.message}`);
    return findings;
  }
  if (!root || root.type !== 'map') return findings;

  const triggers = triggersOf(root);
  const privTriggers = [...triggers].filter((t) => PRIVILEGED.has(t));
  const privileged = privTriggers.length > 0;
  const triggerList = privTriggers.join('/');
  const prt = triggers.has('pull_request_target');

  const topPerms = root.get('permissions');
  permissionFindings(topPerms, 'workflow', add, privileged, triggerList);

  const jobsNode = root.get('jobs');
  const jobs = jobsNode && jobsNode.type === 'map' ? jobsNode.entries : [];

  if (privileged && !topPerms) {
    const unscoped = jobs.filter((j) => !(j.value?.type === 'map' && j.value.has('permissions')));
    if (unscoped.length > 0 || jobs.length === 0) {
      const onEntry = root.entry('on') ?? root.entry('true');
      add('MEDIUM', 'permissions-missing', onEntry ? onEntry.line : 1,
        `${triggerList} workflow has no top-level permissions: — the token falls back to the repository default (often read/write); `
        + `set permissions: {} or the minimum scopes${unscoped.length ? ` (unscoped jobs: ${unscoped.map((j) => j.key).join(', ')})` : ''}`);
    }
  }

  for (const job of jobs) {
    const j = job.value;
    if (!j || j.type !== 'map') continue;
    permissionFindings(j.get('permissions'), `job "${job.key}"`, add, privileged, triggerList);

    // Reusable workflow call at job level.
    const jobUses = j.get('uses');
    if (jobUses && jobUses.type === 'scalar') checkUses(scalarText(jobUses), jobUses.line, add);
    if (prt && jobUses && scalarText(j.get('secrets')) === 'inherit') {
      add('MEDIUM', 'secrets-untrusted-trigger', j.entry('secrets').line,
        `job "${job.key}" passes secrets: inherit to a reusable workflow under pull_request_target`);
    }
    if (prt) secretFindings(j.get('env'), `job "${job.key}" env`, add);

    const steps = j.get('steps');
    if (!steps || steps.type !== 'seq') continue;
    let untrustedCheckout = null;

    steps.items.forEach((step, idx) => {
      if (!step || step.type !== 'map') return;
      const usesNode = step.get('uses');
      const uses = scalarText(usesNode);
      const withNode = step.get('with');
      const runNode = step.get('run');
      const parsed = uses ? parseUses(uses) : null;

      if (uses) checkUses(uses, usesNode.line, add);

      // HIGH: pwn-request
      if (privileged && parsed && parsed.path === 'actions/checkout' && withNode?.type === 'map') {
        for (const key of ['ref', 'repository']) {
          const e = withNode.entry(key);
          if (!e) continue;
          const v = scalarText(e.value);
          if (PR_HEAD_REF.some((re) => re.test(v))) {
            untrustedCheckout = { line: e.value.line ?? e.line, idx, value: v.trim(), finding: null };
            break;
          }
        }
        if (untrustedCheckout && untrustedCheckout.idx === idx) {
          const f = {
            severity: 'HIGH', rule: 'pwn-request', file, line: untrustedCheckout.line,
            message: `${triggerList} checks out contributor code (${untrustedCheckout.value}) in a job that holds the base repo's token and secrets`,
          };
          findings.push(f);
          untrustedCheckout.finding = f;
        }
      }
      if (untrustedCheckout && untrustedCheckout.finding && idx > untrustedCheckout.idx && !untrustedCheckout.execLine) {
        const exec = runNode ? leaves(runNode).find((l) => EXECUTES_CODE.test(l.text)) : null;
        const localAction = parsed?.local ? { line: usesNode.line, text: uses } : null;
        const hit = exec ?? localAction;
        if (hit) {
          untrustedCheckout.execLine = hit.line;
          untrustedCheckout.finding.message += ` and then executes it (line ${hit.line}: ${hit.text.trim().slice(0, 60)})`;
        }
      }

      // HIGH: script injection in run: and github-script's script:
      const codeNodes = [];
      if (runNode) codeNodes.push(['run', runNode]);
      if (parsed?.path === 'actions/github-script' && withNode?.type === 'map' && withNode.get('script')) {
        codeNodes.push(['github-script script', withNode.get('script')]);
      }
      for (const [where, n] of codeNodes) {
        for (const l of leaves(n)) {
          for (const m of l.text.matchAll(EXPR_RE)) {
            if (isUntrustedExpr(m[1])) {
              add('HIGH', 'script-injection', l.line,
                `${m[0].trim()} is interpolated into ${where} — the text becomes code before the shell sees it; pass it through env: and quote "$VAR"`);
            }
          }
        }
      }

      if (prt) {
        secretFindings(step.get('env'), 'step env', add);
        secretFindings(withNode, 'step with', add);
        if (runNode) secretFindings(runNode, 'step run', add);
      }

      // LOW: cache poisoning
      if (prt && parsed && /^actions\/cache(\/(restore|save))?$/.test(parsed.path) && withNode?.type === 'map') {
        for (const key of ['key', 'restore-keys']) {
          const e = withNode.entry(key);
          if (!e) continue;
          for (const l of leaves(e.value)) {
            const exprs = [...l.text.matchAll(EXPR_RE)].map((m) => m[1]);
            const tainted = exprs.some((x) => isUntrustedExpr(x) || PR_HEAD_REF.some((re) => re.test(x))
              || (untrustedCheckout && /\bhashFiles\s*\(/.test(x)));
            if (tainted) {
              add('LOW', 'cache-poisoning', l.line,
                `actions/cache ${key} derives from contributor input under pull_request_target — a PR can plant a cache entry the base branch later restores`);
            }
          }
        }
      }
    });
  }

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return findings.sort((a, b) => a.line - b.line || rank[a.severity] - rank[b.severity]);
}

function checkUses(uses, line, add) {
  const p = parseUses(uses);
  if (p.local) return;
  if (p.docker) {
    if (!p.pinned) add('LOW', 'unpinned-action', line, `${uses} is a docker image without an @sha256 digest`);
    return;
  }
  if (p.pinned) return;
  const official = p.owner === 'actions' || p.owner === 'github';
  const what = p.version ? `mutable ref @${p.version}` : 'no ref at all';
  add(official ? 'LOW' : 'MEDIUM', 'unpinned-action', line,
    `${uses} uses a ${what}; ${official ? 'official action, but' : 'a third-party owner can move it —'} pin to a 40-char commit SHA (keep the tag in a comment)`);
}

function secretFindings(n, where, add) {
  for (const l of leaves(n)) {
    for (const m of l.text.matchAll(EXPR_RE)) {
      const names = [...m[1].matchAll(/\bsecrets\.([A-Za-z_][\w]*)/g)].map((x) => x[1]).filter((s) => s !== 'GITHUB_TOKEN');
      const indexed = /\bsecrets\[/.test(m[1]);
      if (names.length || indexed) {
        add('MEDIUM', 'secrets-untrusted-trigger', l.line,
          `${where} passes ${names.length ? names.map((s) => `secrets.${s}`).join(', ') : 'a secret'} into a pull_request_target job — any code this job runs from the PR can read it`);
      }
    }
  }
}

/** Scan <cwd>/.github/workflows. Returns { files, findings, summary }. */
export function scanDir(cwd = process.cwd()) {
  const dir = join(resolve(cwd), '.github', 'workflows');
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f)).sort()
    : [];
  const findings = [];
  for (const f of files) {
    const rel = `.github/workflows/${f}`;
    findings.push(...scanWorkflow(readFileSync(join(dir, f), 'utf8'), rel));
  }
  const summary = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) summary[f.severity]++;
  return { files: files.map((f) => `.github/workflows/${f}`), findings, summary };
}

export function renderTable(result) {
  const { files, findings } = result;
  const summary = result.summary ?? findings.reduce((s, f) => (s[f.severity]++, s), { HIGH: 0, MEDIUM: 0, LOW: 0 });
  if (!files.length) return 'workflow-security: no .github/workflows/*.yml files — nothing to check\n';
  const head = `workflow-security: ${files.length} workflow file(s) — HIGH ${summary.HIGH} · MEDIUM ${summary.MEDIUM} · LOW ${summary.LOW}\n`;
  if (!findings.length) return `${head}no findings\n`;
  const rows = findings.map((f) => [f.severity, `${f.file}:${f.line}`, f.rule, f.message]);
  const w = [0, 1, 2].map((c) => Math.max(...rows.map((r) => r[c].length)));
  return head + rows.map((r) => `${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`).join('\n') + '\n';
}

const isMain = (() => {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--cwd');
  const cwd = ci >= 0 ? args[ci + 1] : process.cwd();
  const result = scanDir(cwd);
  process.stdout.write(args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : renderTable(result));
  process.exit(result.summary.HIGH > 0 ? 1 : 0);
}
