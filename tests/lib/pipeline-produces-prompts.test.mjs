// A stage contract the agent was never told about is a contract nobody can meet.
//
// shared/pipeline.toml says a key is declared "only where BOTH the agent's own
// prompt and its verdict history agree". Nothing held the prompt half: the
// security-officer contract asked for `report` while its log-verdict line had no
// `report=`, and 29 of 30 runs since 2026-10-01 came back without it. Before rule 2
// of the graph guard (ADR-039) reads `produces`, every declared key must appear in
// the stage agent's own log-verdict instruction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePipelineToml } from '../../scripts/lib/pipeline-toml.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const graph = parsePipelineToml(fs.readFileSync(path.join(ROOT, 'shared', 'pipeline.toml'), 'utf8'));

test('every key a stage must produce is asked for in its agent prompt', () => {
  const gaps = [];
  for (const [stage, rule] of Object.entries(graph)) {
    const agent = stage.split('.')[0];
    for (const key of rule.produces || []) {
      if (key === 'receipt') continue;   // recorded by the receipt store, not typed by the agent
      const prompt = fs.readFileSync(path.join(ROOT, 'agents', `${agent}.md`), 'utf8');
      const logLines = prompt.split('\n').map((l, i, a) => (/log-verdict\.sh/.test(l) ? a.slice(i, i + 3).join(' ') : '')).filter(Boolean);
      if (!logLines.some((l) => new RegExp(`(^|[\\s"'])${key}=`).test(l))) gaps.push(`${stage}: ${key}=`);
    }
  }
  assert.deepEqual(gaps, []);
});
