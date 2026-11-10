// The orchestrator skill names stages the graph runs, and fits its budget.
//
// SKILL.md is loaded whole into every session (37 KB until 2026-10-26) and held
// the pipeline twice: once as prose, once as shared/pipeline.toml. The two had
// drifted — the prose told the model to review with three `senior-dev` spawns,
// the graph fanned out to code-reviewer, qa-engineer and security-officer.
// Stage order now lives in the graph only (great_cto-1puj.4); this test keeps the
// summary that remains from contradicting it and the file from growing back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePipelineToml } from '../../scripts/lib/pipeline-toml.mjs';
import { SIZE_BUDGET } from '../../scripts/skill-lint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = path.join(ROOT, 'skills', 'great_cto', 'SKILL.md');
const skill = fs.readFileSync(SKILL, 'utf8');
const graph = parsePipelineToml(fs.readFileSync(path.join(ROOT, 'shared', 'pipeline.toml'), 'utf8'));

test('the review fan-out in the skill is the graph’s', () => {
  const fanOut = graph['senior-dev'].next;
  const line = skill.split('\n').find((l) => l.includes('∥')) || '';
  for (const agent of fanOut) assert.match(line, new RegExp(`\`${agent}\``), `${agent} missing from the summary`);
  assert.doesNotMatch(skill, /great_cto-senior-dev` with focused prompts/, 'the old senior-dev review recipe is back');
});

test('every reference the skill points at exists', () => {
  const refs = [...skill.matchAll(/`(skills\/great_cto\/[\w./-]+\.md)`/g)].map((m) => m[1]);
  assert.ok(refs.length >= 8, 'the moved sections are referenced');
  for (const r of refs) assert.ok(fs.existsSync(path.join(ROOT, r)), `${r} does not exist`);
});

// The unit is KiB, measured in bytes of the file: 20 * 1024 = 20,480 — the one budget
// scripts/skill-lint.mjs enforces as SK-004, imported rather than restated. It is not
// 20,000 bytes. great_cto-1puj.4 quoted "37.5 -> 19.9 KB" for 37,461 -> 19,906 bytes,
// which is decimal kB (19.4 KiB); the file has since grown to just over 20,000 bytes and is
// still under 20 KiB.
test('SKILL.md fits the 20 KiB (20,480-byte) budget it is loaded under', () => {
  assert.equal(SIZE_BUDGET, 20 * 1024, 'the lint and this test share one budget: 20 KiB');
  const bytes = fs.statSync(SKILL).size;
  assert.ok(bytes <= SIZE_BUDGET, `${bytes} bytes = ${(bytes / 1024).toFixed(2)} KiB; budget ${SIZE_BUDGET} bytes (20 KiB)`);
});
