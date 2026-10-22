import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { agentGroups, classifyAgentGroup, agentGroupIcon } from '../../scripts/lib/agent-groups.mjs';
import { deriveDomain } from '../../packages/board/lib/fleet.mjs';

test('browser and Node use identical glyphs and classification for the entire shipped roster', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../../packages/board/public/assets/agent-groups.js', import.meta.url), 'utf8'), context);
  const browser = context.GctoAgentGroups;
  const slugs = readdirSync(new URL('../../agents/', import.meta.url)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
  assert.equal(slugs.length, 72);
  assert.equal(agentGroups.length, 9);
  assert.equal(new Set(agentGroups.map(g => g.svg)).size, 9);
  for (const slug of slugs) {
    const group = classifyAgentGroup(slug);
    assert.equal(deriveDomain(slug), group, slug);
    assert.equal(browser.classify(slug), group, slug);
    assert.equal(browser.icon(group), agentGroupIcon(group), slug);
    assert.match(agentGroupIcon(group), /aria-hidden="true" focusable="false"/);
  }
  assert(Object.isFrozen(agentGroups)); assert(agentGroups.every(Object.isFrozen));
});

test('untrusted or unknown keys cannot enter SVG markup; symbols are not status indicators', () => {
  for (const key of ['<img src=x onerror=alert(1)>', '" onclick="alert(1)', null, undefined, 'unknown']) {
    assert.equal(agentGroupIcon(key), agentGroupIcon('other'));
    assert.doesNotMatch(agentGroupIcon(key), /onerror|onclick|<img|<script|href=|style=/);
  }
  assert.equal(classifyAgentGroup(null), 'other');
  for (const g of agentGroups) assert.doesNotMatch(agentGroupIcon(g.key), /status-|health|approved|passed|failed/);
  const html = readFileSync(new URL('../../packages/board/public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<span class="ar-status" aria-hidden="true"><\/span>/);
  assert(html.indexOf('/assets/agent-groups.js') < html.indexOf('const AGENT_GROUPS'));
});
