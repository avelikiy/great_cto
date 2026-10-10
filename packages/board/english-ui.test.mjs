import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pages = ['index.html', 'share.html'].map(name => ({
  name, html: readFileSync(new URL(`./public/${name}`, import.meta.url), 'utf8'),
}));

for (const { name, html } of pages) {
  test(`${name}: UI dates, times and numbers never inherit the browser language`, () => {
    assert.match(html, /<html\s+lang="en"/);
    const calls = [...html.matchAll(/\.toLocale(?:DateString|TimeString|String)\s*\(([^\n]*)/g)];
    assert.ok(calls.length > 0, 'the guard must cover real formatters');
    for (const [call, args] of calls) {
      assert.match(args, /^\s*['"]en-US['"]\s*[,)]/,
        `Pin the UI formatter to English: ${call}`);
    }
  });
}

test('task timestamps stay English with a Russian default locale without changing timezone', () => {
  // Simulate a non-English browser default, retaining the operator's timezone.
  class RussianDate extends Date {
    toLocaleString(locale, options) { return super.toLocaleString(locale || 'ru-RU', options); }
  }
  const html = pages[0].html;
  const context = vm.createContext({ Date: RussianDate });
  vm.runInContext(html.slice(html.indexOf('function fmtDate(iso)'), html.indexOf('// Money formatting')), context);
  const timestamp = '2026-10-09T15:43:47Z';
  assert.equal(context.fmtDate(timestamp), new Date(timestamp).toLocaleString('en-US'));
  assert.equal(context.fmtDT(timestamp), new Date(timestamp).toLocaleString('en-US', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }));
  assert.equal(context.fmtDate(null), '—');
  assert.equal(context.fmtDT(null), '');
});
