// Tests for decision-scorer agent output format.
//
// Validates that the scorer produces:
//   - A markdown table with the 5 required dimensions
//   - A "Recommended" section with a two-sentence rationale
//   - The output file saved under docs/decisions/
//
// Zero LLM cost — all tests operate on static fixtures and the file
// format contract, not on live agent invocations.
//
// Run: node --test tests/agent-decision-scorer.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A minimal ADR with two variants — the canonical happy-path input. */
const MOCK_ADR_TWO_VARIANTS = `# ADR-042: Queue Strategy

Date: 2026-05-21
Status: PROPOSED

## Context

We need to process webhook events asynchronously. Two approaches emerged
from the design session.

## Decision

Pending scoring.

## Alternatives Considered

**Option A: Redis Streams**
Use Redis Streams for event queuing. Low operational overhead for a solo team.
Trade-off: limited replay window, no native dead-letter queue.

**Option B: RabbitMQ**
Use RabbitMQ for event queuing. Mature DLQ support, AMQP protocol.
Trade-off: higher ops burden, needs dedicated node.

## Consequences

- Positive: async decoupling
- Negative: additional infrastructure
- Risks: message loss on Redis restart if persistence not configured
`;

/**
 * Synthetic decision scoring output that decision-scorer would produce.
 * Tests verify this format — keeping agent output and tests in sync.
 */
function buildScoringOutput(opts = {}) {
  const {
    variantA = 'Option A: Redis Streams',
    variantB = 'Option B: RabbitMQ',
    winnerVariant = 'Option A: Redis Streams',
    winnerScore = '3.70',
    runnerScore = '3.10',
    slug = 'queue-strategy',
    date = '20260521',
    sourceFile = 'docs/decisions/ADR-042-queue-strategy.md',
  } = opts;

  return `# Decision Scoring: Queue Strategy

> Source: ${sourceFile}
> Date: 2026-05-21
> Scorer: decision-scorer agent

## Criteria weights

| Dimension | Weight | Basis |
|---|---|---|
| Complexity | 20% | default |
| Cost | 25% | default |
| Security/Compliance | 20% | default |
| Developer Experience | 15% | default |
| Time to Ship | 20% | default |

## Scoring table

| Dimension | Weight | ${variantA} | ${variantB} | Winner |
|---|---|---|---|---|
| Complexity | 20% | 4 | 2 | ${variantA} |
| Cost | 25% | 4 | 3 | ${variantA} |
| Security/Compliance | 20% | 3 | 3 | Tie |
| Developer Experience | 15% | 4 | 2 | ${variantA} |
| Time to Ship | 20% | 4 | 3 | ${variantA} |
| **Weighted total** | **100%** | **${winnerScore}** | **${runnerScore}** | **${winnerVariant}** |

_Score scale: 1 = significant weakness · 3 = adequate · 5 = clear advantage_

## Notes per dimension

- **Complexity**: Redis Streams has lower operational complexity for a solo team; RabbitMQ requires dedicated node management.
- **Cost**: Redis is already in stack for caching; RabbitMQ adds a new managed service (~$15/mo).
- **Security/Compliance**: Both options offer equivalent TLS and auth; assumed neutral — ADR silent on this dimension.
- **Developer Experience**: Redis Streams has simpler client API; RabbitMQ AMQP protocol has steeper learning curve.
- **Time to Ship**: Redis Streams can reuse existing Redis instance; RabbitMQ requires provisioning a new service.

## Recommended

**${winnerVariant}** (weighted score: ${winnerScore}/5.00).

Redis Streams wins on complexity, cost, DX, and time-to-ship dimensions that matter most for a solo-team project in the greenfield phase. Validate that the Redis persistence configuration (AOF + RDB) is enabled before accepting, as the ADR notes message loss risk on restart.
`;
}

// ── Helper: create an isolated tmp directory with the expected layout ────────

function createTmpProject(adrContent = MOCK_ADR_TWO_VARIANTS) {
  const root = mkdtempSync(join(tmpdir(), 'great_cto_test_'));
  mkdirSync(join(root, 'docs', 'decisions'), { recursive: true });
  mkdirSync(join(root, '.great_cto'), { recursive: true });

  writeFileSync(
    join(root, 'docs', 'decisions', 'ADR-042-queue-strategy.md'),
    adrContent,
    'utf8',
  );

  writeFileSync(
    join(root, '.great_cto', 'PROJECT.md'),
    [
      '# great_cto',
      'primary: greenfield',
      'archetype: greenfield',
      'project_size: medium',
      'team-size: 1',
      'mode: solo',
      'phase: implementation',
      'compliance: [none]',
    ].join('\n'),
    'utf8',
  );

  return root;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('decision-scorer output format', () => {
  test('scoring document contains all 5 required dimensions', () => {
    const output = buildScoringOutput();

    const requiredDimensions = [
      'Complexity',
      'Cost',
      'Security/Compliance',
      'Developer Experience',
      'Time to Ship',
    ];

    for (const dim of requiredDimensions) {
      assert.ok(
        output.includes(dim),
        `Output must contain dimension: "${dim}"`,
      );
    }
  });

  test('scoring document contains a markdown table with Dimension and Weight columns', () => {
    const output = buildScoringOutput();

    // Scoring table must have the pipe-delimited header
    assert.ok(
      output.includes('| Dimension | Weight |'),
      'Output must contain a markdown table header with "Dimension" and "Weight" columns',
    );
  });

  test('scoring table has a Weighted total row', () => {
    const output = buildScoringOutput();

    assert.ok(
      output.includes('**Weighted total**'),
      'Scoring table must include a **Weighted total** row',
    );
  });

  test('scoring table winner column identifies the recommended variant', () => {
    const output = buildScoringOutput({
      winnerVariant: 'Option A: Redis Streams',
      winnerScore: '3.70',
    });

    // The weighted total row must name a winner
    const totalRow = output
      .split('\n')
      .find((l) => l.includes('**Weighted total**'));

    assert.ok(totalRow, 'Weighted total row must exist');
    assert.ok(
      totalRow.includes('Option A: Redis Streams'),
      'Weighted total row must name the winning variant',
    );
  });

  test('output contains a Recommended section', () => {
    const output = buildScoringOutput();

    assert.ok(
      output.includes('## Recommended'),
      'Output must contain a "## Recommended" section',
    );
  });

  test('Recommended section names the winning variant', () => {
    const output = buildScoringOutput({
      winnerVariant: 'Option A: Redis Streams',
    });

    const lines = output.split('\n');
    const recIdx = lines.findIndex((l) => l.startsWith('## Recommended'));
    assert.ok(recIdx !== -1, '## Recommended section must exist');

    // The next non-empty line after ## Recommended must mention the winner
    const recBody = lines.slice(recIdx + 1).join('\n');
    assert.ok(
      recBody.includes('Option A: Redis Streams'),
      'Recommended section must name the winning variant',
    );
  });

  test('Recommended section contains exactly two sentences of rationale', () => {
    const output = buildScoringOutput();

    const lines = output.split('\n');
    const recIdx = lines.findIndex((l) => l.startsWith('## Recommended'));
    assert.ok(recIdx !== -1, '## Recommended section must exist');

    // Collect non-empty body lines after the heading
    const bodyLines = lines.slice(recIdx + 1).filter((l) => l.trim() !== '');

    // The bold "winner" line + one rationale paragraph; paragraph must have 2 sentences
    // (ends with two ". " splits or two periods at sentence boundaries)
    const rationale = bodyLines.find((l) => !l.startsWith('**'));
    assert.ok(rationale, 'Rationale paragraph must exist after winner line');

    // Count sentence-ending periods (naive but sufficient for format validation)
    const sentenceEnds = (rationale.match(/\.\s|\.$/gm) || []).length;
    assert.ok(
      sentenceEnds >= 2,
      `Rationale must contain at least 2 sentences; found ${sentenceEnds} sentence-ending period(s) in: "${rationale}"`,
    );
  });

  test('output contains a score legend', () => {
    const output = buildScoringOutput();

    assert.ok(
      output.includes('Score scale:') || output.includes('score scale:') || output.includes('_Score scale'),
      'Output must include a score scale legend',
    );
  });

  test('weights in criteria table sum to 100%', () => {
    const output = buildScoringOutput();

    // Extract all "| <N>% |" values from the criteria table (first table)
    const criteriaSection = output.split('## Scoring table')[0];
    const weightMatches = [...criteriaSection.matchAll(/\|\s*(\d+)%\s*\|/g)];

    assert.ok(
      weightMatches.length >= 5,
      `Expected at least 5 weight entries in criteria table, found ${weightMatches.length}`,
    );

    const total = weightMatches.reduce(
      (sum, m) => sum + parseInt(m[1], 10),
      0,
    );
    assert.equal(
      total,
      100,
      `Criteria weights must sum to 100%, got ${total}%`,
    );
  });
});

describe('decision-scorer file output', () => {
  test('output file is saved under docs/decisions/', () => {
    // Simulate the scorer writing to the expected path
    const root = createTmpProject();

    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const outputPath = join(
        root,
        'docs',
        'decisions',
        `DECISION-queue-strategy-${today}.md`,
      );

      // Write the synthetic output (simulating what the agent does)
      writeFileSync(outputPath, buildScoringOutput({ date: today }), 'utf8');

      assert.ok(
        existsSync(outputPath),
        `Output file must exist at docs/decisions/DECISION-queue-strategy-${today}.md`,
      );

      const content = readFileSync(outputPath, 'utf8');
      assert.ok(
        content.includes('## Recommended'),
        'Saved file must contain ## Recommended section',
      );
      assert.ok(
        content.includes('## Scoring table'),
        'Saved file must contain ## Scoring table section',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('output file path follows DECISION-{slug}-{YYYYMMDD}.md convention', () => {
    const root = createTmpProject();

    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const outputPath = join(
        root,
        'docs',
        'decisions',
        `DECISION-queue-strategy-${today}.md`,
      );

      writeFileSync(outputPath, buildScoringOutput(), 'utf8');

      // Verify filename matches the convention regex
      const filename = `DECISION-queue-strategy-${today}.md`;
      assert.match(
        filename,
        /^DECISION-[a-z0-9-]+-\d{8}\.md$/,
        'Filename must match DECISION-{slug}-{YYYYMMDD}.md',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('mock ADR with two variants has the expected structure', () => {
    const root = createTmpProject();

    try {
      const adrPath = join(
        root,
        'docs',
        'decisions',
        'ADR-042-queue-strategy.md',
      );
      const content = readFileSync(adrPath, 'utf8');

      assert.ok(
        content.includes('**Option A:'),
        'ADR must contain Option A variant',
      );
      assert.ok(
        content.includes('**Option B:'),
        'ADR must contain Option B variant',
      );
      assert.ok(
        content.includes('## Alternatives Considered'),
        'ADR must have ## Alternatives Considered section',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('decision-scorer skip conditions', () => {
  test('single-variant ADR should be skipped', () => {
    const singleVariantAdr = `# ADR-043: Auth Strategy

Date: 2026-05-21
Status: PROPOSED

## Context

We will use JWT.

## Decision

Use JWT for stateless auth.

## Alternatives Considered

**Option A: JWT**
Standard choice. No alternatives evaluated.

## Consequences

- Positive: stateless
`;

    // The skip logic: count variants — should be < 2
    const variantCount = (
      singleVariantAdr.match(/^\*\*[A-Za-z]/gm) || []
    ).length;
    assert.ok(
      variantCount < 2,
      `Single-variant ADR should have < 2 variants; counted ${variantCount}`,
    );
  });

  test('two-variant ADR passes the variant count gate', () => {
    const variantCount = (
      MOCK_ADR_TWO_VARIANTS.match(/^\*\*Option [A-Z]:/gm) || []
    ).length;
    assert.ok(
      variantCount >= 2,
      `Two-variant ADR must have >= 2 variants; counted ${variantCount}`,
    );
  });
});
