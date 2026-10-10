/** First representative corpus case; only `files` belong in the worker project. */
import { createHash } from 'node:crypto';
import { scenarios } from './adaptive-benchmark-protocol.mjs';

export function docsBenchmarkFixture() {
  const files = {
    '.gitignore': '.great_cto/\n',
    '.great_cto/PROJECT.md': 'archetype: web-service\n',
    'package.json': '{"name":"docs-benchmark-service","private":true,"type":"module"}\n',
    'src/status.mjs': 'export function status() { return { healthy: true }; }\n',
    'docs/README.md': '# Service documentation\n\n[Quick start](guides/getting-started.md)\n\n[API reference](reference/old-api.md)\n',
    'docs/guides/quickstart.md': '# Quick start\n\nRun the service and inspect its health status.\n',
    'docs/reference/api.md': '# API reference\n\nThe status response includes healthy as a boolean.\n',
  };
  const sha = value => createHash('sha256').update(value).digest('hex');
  const scenario = scenarios.find(s => s.id === 'docs-low-risk');
  return { files, oracle: { version: 1, scenario: scenario.id, criteria: scenario.checks,
    baseline: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, sha(text)])),
    protected: Object.keys(files).filter(name => !name.startsWith('docs/')),
    requiredLinks: [
      { from: 'docs/README.md', label: 'Quick start', to: 'docs/guides/quickstart.md' },
      { from: 'docs/README.md', label: 'API reference', to: 'docs/reference/api.md' },
    ],
    grammar: 'bounded inline relative Markdown links, no anchors, references, HTML or remote targets',
    runtimeExclusions: ['.great_cto/events.jsonl', '.great_cto/events.1.jsonl'],
  } };
}
