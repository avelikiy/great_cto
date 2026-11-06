// docs/QUICKSTART-AI.md — the one prompt a user pastes into Claude Code or Codex.
//
// A paste-to-agent page is only useful while every command in it exists. The
// install route changed under the README once already (ADR-045: `init` now
// refuses activation), so the page is pinned to the CLI's own usage text rather
// than to what its author remembered.
//
// What this pins, and what it does not:
//   - the page exists, with exactly ONE fenced prompt
//   - every `great-cto <subcommand>` and flag in that prompt is in the CLI source
//   - every slash command in it is a file in commands/
//   - the prompt tells the agent what to do when the install is refused, and
//     forbids the workarounds that the refusal exists to prevent
//   - README.md and the nine translated READMEs link to the page from Quick start
// It does not run the prompt. A green result means the page cannot name a command
// that is not there; it does not mean an install succeeded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const PAGE = 'docs/QUICKSTART-AI.md';
const LANGS = ['de', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW'];

/** Fenced blocks of a markdown file: [{info, body}]. */
function fences(text) {
  return [...text.matchAll(/^```([^\n]*)\n([\s\S]*?)^```/gm)].map((m) => ({ info: m[1].trim(), body: m[2] }));
}

/** The text of one `## ` section, up to the next `## `. */
function section(text, title) {
  const at = text.indexOf(`\n## ${title}`);
  assert.ok(at >= 0, `"## ${title}" present`);
  const next = text.indexOf('\n## ', at + 4);
  return text.slice(at, next < 0 ? undefined : next);
}

test('the page exists and carries exactly one fenced prompt', () => {
  assert.ok(existsSync(join(ROOT, PAGE)), `${PAGE} exists`);
  const blocks = fences(read(PAGE));
  assert.equal(blocks.length, 1, 'one fence: the prompt. A second block is a second thing to paste.');
  assert.equal(blocks[0].info, 'text', 'the prompt is a text block, not a shell script');
  assert.ok(blocks[0].body.split('\n').length >= 8, 'the prompt has steps, not a one-liner');
});

test('every great-cto subcommand and flag in the prompt exists in the CLI', () => {
  const prompt = fences(read(PAGE))[0].body;
  const cli = read('packages/cli/src/main.ts') + '\n' + read('packages/cli/src/run.ts');

  const subs = new Set([...prompt.matchAll(/great-cto(?:@[\w.]+)?\s+(?:--yes\s+)?([a-z][a-z-]*)/g)].map((m) => m[1]));
  assert.ok(subs.size >= 4, `the prompt runs several commands (found: ${[...subs].join(', ')})`);
  for (const sub of subs) {
    assert.ok(cli.includes(`great-cto ${sub}`), `"great-cto ${sub}" is in the CLI usage text`);
  }

  const flags = new Set([...prompt.matchAll(/(?<![\w-])(--[a-z][a-z-]*)/g)].map((m) => m[1]));
  for (const flag of flags) {
    assert.ok(cli.includes(`"${flag}"`) || cli.includes(`'${flag}'`) || cli.includes(`${flag} `),
      `${flag} is handled by the CLI`);
  }
  // The flags the steps depend on, by name: a dry-run preview and non-interactive init.
  for (const flag of ['--dry-run', '--yes', '--host', '--allow']) {
    assert.ok(flags.has(flag), `the prompt uses ${flag}`);
  }
});

test('every slash command in the prompt is a shipped command', () => {
  const prompt = fences(read(PAGE))[0].body;
  const slash = [...prompt.matchAll(/(?<![\w/.~-])\/([a-z][a-z-]+)\b/g)].map((m) => m[1]);
  assert.ok(slash.includes('start'), 'the first command for Claude Code is /start');
  for (const name of new Set(slash)) {
    assert.ok(existsSync(join(ROOT, `commands/${name}.md`)), `/${name} has commands/${name}.md`);
  }
});

test('the prompt handles a refused install instead of working around it', () => {
  const prompt = fences(read(PAGE))[0].body;
  assert.match(prompt, /Plugin installation refused/, 'names the CLI\'s refusal text');
  assert.match(prompt, /ADR-045/, 'names the boundary that causes it');
  assert.match(prompt, /quote[^\n]*exact/i, 'the agent quotes the refusal rather than paraphrasing it');
  assert.match(prompt, /do not use --force/i, 'no forced reinstall');
  assert.match(prompt, /~\/\.claude/, 'no hand edits to host settings');
  assert.match(prompt, /data, not (as )?instructions/i, 'repository text is data');
  assert.match(read(PAGE), /verified-updates\.md/, 'links the page that explains the boundary');
});

test('Codex is not handed a slash command as its first command', () => {
  const prompt = fences(read(PAGE))[0].body;
  const codexLines = prompt.split('\n').filter((l) => /codex/i.test(l));
  assert.ok(codexLines.length > 0, 'the prompt covers Codex');
  assert.ok(codexLines.some((l) => /no slash commands/i.test(l)), 'says Codex has no slash commands');
  assert.ok(codexLines.some((l) => /--host codex/.test(l) && /--allow/.test(l)),
    'Codex gets the CLI form with an explicit write scope');
});

test('the page names what the agent must report back', () => {
  const text = read(PAGE);
  const report = section(text, 'What the agent reports back');
  for (const field of ['Host', 'Version', 'Detected', 'Install', 'PROJECT.md', 'First command', 'Not done']) {
    assert.ok(report.includes(field), `report field "${field}" is explained`);
  }
});

test('no machine-local path or private name is written into the page', () => {
  const text = read(PAGE);
  assert.ok(!/\/Users\/|\/home\/[a-z]/.test(text), 'no absolute home path');
});

test('README.md links the page once, from Quick start, as plain text', () => {
  const readme = read('README.md');
  const qs = section(readme, 'Quick start');
  const links = [...qs.matchAll(/\]\(docs\/QUICKSTART-AI\.md\)/g)];
  assert.equal(links.length, 1, 'one link in the Quick start section');
  const line = qs.split('\n').find((l) => l.includes('QUICKSTART-AI.md'));
  assert.ok(!/!\[|\[!\[|<img|<a |<div|<details/.test(line), 'a text line: no image, badge or markup');
  assert.equal(readme.split('QUICKSTART-AI.md').length - 1, 1, 'linked once in the whole README');
});

for (const lang of LANGS) {
  test(`${lang}: the translated README links the same page from its Quick start`, () => {
    const t = read(`docs/${lang}/README.md`);
    assert.equal(t.split('QUICKSTART-AI.md').length - 1, 1, 'linked once');
    assert.ok(t.includes('](../QUICKSTART-AI.md)'), 'relative link resolves from docs/<lang>/');
    const line = t.split('\n').find((l) => l.includes('QUICKSTART-AI.md'));
    assert.ok(!/!\[|\[!\[|<img|<a |<div|<details/.test(line), 'a text line: no image, badge or markup');
  });
}
