import type { Finding, FindingSeverity } from '../types/index.js';

export const SEVERITY_RANK: Record<FindingSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const SEVERITIES = new Set<FindingSeverity>(['info', 'low', 'medium', 'high', 'critical']);

export function isFindingSeverity(value: string): value is FindingSeverity {
  return SEVERITIES.has(value as FindingSeverity);
}

export interface AnalysisRequest {
  minSeverity?: FindingSeverity;
}

export function filterByMinSeverity(findings: Finding[], minSeverity?: FindingSeverity): Finding[] {
  if (!minSeverity) {
    return findings;
  }
  const minimum = SEVERITY_RANK[minSeverity];
  return findings.filter((finding) => SEVERITY_RANK[finding.severity] >= minimum);
}
