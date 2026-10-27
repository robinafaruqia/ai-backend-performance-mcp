import type { Finding, FindingSeverity } from '../types/index.js';

export type SarifLevel = 'error' | 'warning' | 'note';

export function sarifLevel(severity: FindingSeverity): SarifLevel {
  if (severity === 'critical' || severity === 'high') {
    return 'error';
  }
  if (severity === 'medium') {
    return 'warning';
  }
  return 'note';
}

export function findingsToSarif(findings: Finding[], toolVersion = '0.3.0') {
  const rules = new Map<string, Finding>();
  for (const finding of findings) {
    if (!rules.has(finding.ruleId)) {
      rules.set(finding.ruleId, finding);
    }
  }

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0' as const,
    runs: [
      {
        tool: {
          driver: {
            name: 'ai-backend-performance-mcp',
            version: toolVersion,
            rules: [...rules.values()].map((finding) => ({
              id: finding.ruleId,
              shortDescription: { text: finding.title },
              help: { text: finding.recommendation },
            })),
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: sarifLevel(finding.severity),
          message: { text: finding.description },
          locations: finding.file
            ? [
                {
                  physicalLocation: {
                    artifactLocation: { uri: finding.file },
                    region: {
                      startLine: finding.line ?? 1,
                      startColumn: finding.column ?? 1,
                    },
                  },
                },
              ]
            : [],
        })),
      },
    ],
  };
}
