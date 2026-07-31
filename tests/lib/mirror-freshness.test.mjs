// The nine translated READMEs rotted once already: every mirror still promised
// "~$42K traditional" and "67 agents" two days after the English README dropped
// both. The fix is not translating faster — it is making staleness visible.
// Each mirror now opens by declaring which English version it translates, and
// this test pins two things: the declaration exists, and no mirror carries the
// claims we already retracted. It does NOT require mirrors to match the current
// version — a mirror is allowed to lag; it is not allowed to lie about lagging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const LOCALES = ['ru', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'pt-BR', 'de', 'fr'];
const RETRACTED = [/\$42K/i, /\b6[78] agents\b/, /one human gate/i, /34k installs/i];

for (const loc of LOCALES) {
  const path = new URL(`../../docs/${loc}/README.md`, import.meta.url);
  test(`mirror ${loc} declares its source version and carries no retracted claims`, () => {
    assert.ok(existsSync(path), `docs/${loc}/README.md is linked from the README switcher`);
    const text = readFileSync(path, 'utf8');
    assert.match(text, /v\d+\.\d+\.\d+/,
      'a mirror must say which English version it translates — lagging is fine, lying about it is not');
    assert.match(text.slice(0, 2500), /README/,
      'and point back at the canonical English README');
    for (const rx of RETRACTED) {
      assert.doesNotMatch(text, rx, `retracted claim ${rx} resurfaced in ${loc}`);
    }
  });
}

test('every mirror the README links to exists, and no stray locale dirs linger', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  for (const loc of LOCALES) {
    assert.ok(readme.includes(`docs/${loc}/README.md`), `${loc} missing from the switcher row`);
  }
});
