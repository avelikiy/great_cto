// One job = one command (3.40, stream C). /learn, /ccr, /cost, /burn and
// /gov-metrics were folded into modes of /crystallize, /recall and /digest.
// A mode that the dispatch names but no section explains — or a section the
// dispatch never reaches — is a command that silently does the wrong thing,
// so each surviving command is held to both halves here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, strictYamlIssues } from '../../scripts/skill-lint.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (name) => fs.readFileSync(path.join(REPO, 'commands', `${name}.md`), 'utf8');

/** The first ```bash block that contains a `case` statement — the command's dispatch. */
function dispatch(text) {
  const blocks = [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  const d = blocks.find((b) => /\bcase\b[\s\S]*\besac\b/.test(b));
  assert.ok(d, 'no dispatch `case … esac` block found');
  return d;
}
const armed = (d, arm) => new RegExp(`^\\s*${arm}\\)`, 'm').test(d);
const heading = (text, re) => text.split('\n').some((l) => /^#{2,3} /.test(l) && re.test(l));

test('the folded commands are gone', () => {
  for (const name of ['learn', 'ccr', 'cost', 'burn', 'gov-metrics']) {
    assert.equal(fs.existsSync(path.join(REPO, 'commands', `${name}.md`)), false, `commands/${name}.md still ships`);
  }
});

test('/crystallize dispatch names each subcommand, and each has its section', () => {
  const text = read('crystallize');
  const d = dispatch(text);
  for (const sub of ['learn', 'approve', 'reject', 'rollback', 'propose', 'prune', 'skill', 'status']) {
    assert.ok(armed(d, sub), `dispatch has no \`${sub})\` arm`);
  }
  for (const sub of ['learn', 'approve', 'reject', 'rollback', 'propose', 'prune', 'skill']) {
    assert.ok(heading(text, new RegExp(`^## Subcommand: ${sub}\\b`)), `no "## Subcommand: ${sub}" section`);
  }
  assert.match(text, /Task\(subagent_type="continuous-learner"/, 'learn no longer spawns the continuous-learner');
  const fm = parseFrontmatter(text).data;
  assert.match(fm['allowed-tools'], /\bTask\b/, 'learn spawns a subagent — Task must be allowed');
  assert.match(fm['argument-hint'], /\blearn\b/);
});

test('/recall keeps keyword search as default and dispatches ccr:<id> / --id <id>', () => {
  const text = read('recall');
  const d = dispatch(text);
  assert.ok(armed(d, 'ccr:\\*'), 'no `ccr:*)` arm');
  assert.ok(/^\s*--id\\ \*\)/m.test(d), 'no `--id <id>` arm');
  assert.ok(armed(d, '\\*'), 'no default arm');
  assert.match(d, /\*\)\s+MODE=keyword/, 'the default is not keyword search');
  assert.ok(heading(text, /^## Mode: ccr\b/), 'no "## Mode: ccr" section');
  assert.ok(heading(text, /^## Step 1\b/), 'keyword search steps are missing');
  assert.match(text, /node scripts\/lib\/ccr\.mjs recall "\$ID"/);
  assert.match(text, /node scripts\/lib\/ccr\.mjs list/);
});

test('/digest dispatches cost, sessions, slo and gov, and each has its section', () => {
  const text = read('digest');
  const d = dispatch(text);
  for (const mode of ['cost', 'sessions', 'slo', 'gov']) assert.ok(armed(d, mode), `dispatch has no \`${mode})\` arm`);
  assert.match(d, /\*\)\s+MODE=digest/, 'the default is not the weekly digest');
  for (const mode of ['cost', 'slo', 'gov']) {
    assert.ok(heading(text, new RegExp(`^## Mode: ${mode}\\b`)), `no "## Mode: ${mode}" section`);
  }
  // `sessions` is a sub-mode of cost: reachable as /digest sessions and /digest cost sessions.
  assert.ok(heading(text, /^### Sessions mode\b/), 'no sessions section');
  assert.match(text, /sessions\)\s*\n\s*DAYS=/, 'cost sub-dispatch lost its sessions arm');
  assert.match(text, /scripts\/lib\/session-shape\.mjs/);
  assert.match(text, /scripts\/lib\/gov-metrics\.mjs" "\$@"/, 'gov does not pass its own arguments through');
  assert.match(text, /slo-burn-history\.log/);
});

test('surviving commands: strict-YAML frontmatter, and the description leads with when + what', () => {
  const lead = {
    crystallize: /^After a session or an incident/,
    recall: /^When you half-remember something/,
    digest: /^Friday review — what shipped, what broke, what it cost/,
  };
  for (const [name, re] of Object.entries(lead)) {
    const text = read(name);
    assert.deepEqual(strictYamlIssues(text), [], `${name}: frontmatter is not strict YAML`);
    const fm = parseFrontmatter(text).data;
    assert.match(fm.description, re, `${name}: description does not lead with when + what`);
  }
  const digest = parseFrontmatter(read('digest')).data;
  for (const mode of ['cost', 'slo', 'gov', 'sessions']) {
    assert.match(digest.description, new RegExp(`\`${mode}\``), `digest description does not name ${mode}`);
    assert.match(digest['argument-hint'], new RegExp(`\\b${mode}\\b`), `digest argument-hint does not name ${mode}`);
  }
  assert.match(parseFrontmatter(read('recall')).data['argument-hint'], /ccr:<id>/);
});
