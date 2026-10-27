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

test('SKILL.md fits the 20 KB budget it is loaded under', () => {
  assert.ok(fs.statSync(SKILL).size <= 20 * 1024, `${(fs.statSync(SKILL).size / 1024).toFixed(1)} KB`);
});
