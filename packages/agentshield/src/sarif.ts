/**
 * SARIF 2.1.0 output for GitHub Code Scanning.
 *
 * https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
 */

import type { ScanReport, Severity } from './types.js';

const SEVERITY_TO_LEVEL: Record<Severity, 'error' | 'warning' | 'note' | 'none'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

export function toSarif(report: ScanReport): unknown {
  // Collect unique rules referenced by findings
  const rulesById = new Map<string, ReturnType<typeof toSarifRule>>();
  for (const f of report.findings) {
    if (!rulesById.has(f.rule.id)) {
      rulesById.set(f.rule.id, toSarifRule(f.rule));
    }
  }

  return {
    $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/cs01/schemas/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'agentshield',
            organization: 'great-cto',
            informationUri: 'https://greatcto.systems/agentshield',
            rules: [...rulesById.values()],
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.rule.id,
          level: SEVERITY_TO_LEVEL[f.rule.severity],
          message: { text: `${f.rule.title} — ${f.match.slice(0, 100)}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.location.file },
                region: {
                  startLine: f.location.line,
                  startColumn: f.location.column ?? 1,
                  snippet: { text: f.location.snippet },
                },
              },
            },
          ],
          properties: {
            severity: f.rule.severity,
            scanner: f.rule.scanner,
            owasp: f.rule.owasp,
          },
        })),
      },
    ],
  };
}

function toSarifRule(rule: { id: string; title: string; description: string; remediation: string; severity: Severity; owasp?: string }) {
  return {
    id: rule.id,
    name: rule.title,
    shortDescription: { text: rule.title },
    fullDescription: { text: rule.description },
    helpUri: 'https://greatcto.systems/agentshield/rules/' + rule.id,
    help: {
      text: `${rule.description}\n\nRemediation: ${rule.remediation}`,
      markdown: `**${rule.title}**\n\n${rule.description}\n\n**Remediation:** ${rule.remediation}` + (rule.owasp ? `\n\n_OWASP: ${rule.owasp}_` : ''),
    },
    defaultConfiguration: {
      level: SEVERITY_TO_LEVEL[rule.severity],
    },
    properties: {
      severity: rule.severity,
      owasp: rule.owasp,
      tags: ['ai-security', rule.severity, ...(rule.owasp ? ['owasp-llm'] : [])],
    },
  };
}
