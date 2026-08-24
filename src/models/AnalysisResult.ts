import { randomUUID } from 'node:crypto';
import type {
  AnalysisResult,
  AnalysisSummary,
  Finding,
  FindingCategory,
  FindingEvidence,
  FindingSeverity,
  GroupedFindings,
} from '../types/index.js';

export function createFindingId(): string {
  return randomUUID();
}

export function createFinding(input: {
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  file?: string;
  line?: number;
  column?: number;
  evidence: FindingEvidence;
  recommendation: string;
  confidence: number;
  estimatedImpact: string;
}): Finding {
  const confidence = Math.min(1, Math.max(0, input.confidence));
  return {
    id: createFindingId(),
    ...input,
    confidence,
  };
}

export function buildSummary(findings: Finding[]): AnalysisSummary {
  const bySeverity: AnalysisSummary['bySeverity'] = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  const byCategory: Record<string, number> = {};
  let confirmedCount = 0;
  let potentialCount = 0;

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    if (finding.evidence.kind === 'confirmed') {
      confirmedCount += 1;
    } else {
      potentialCount += 1;
    }
  }

  return {
    totalFindings: findings.length,
    bySeverity,
    byCategory,
    confirmedCount,
    potentialCount,
  };
}

export function buildAnalysisResult(
  findings: Finding[],
  metadata?: Record<string, unknown>,
): AnalysisResult {
  return {
    findings,
    summary: buildSummary(findings),
    metadata,
  };
}

export function groupFindings(findings: Finding[]): GroupedFindings {
  const byCategory: Record<string, Finding[]> = {};
  const bySeverity: GroupedFindings['bySeverity'] = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: [],
  };
  const byFile: Record<string, Finding[]> = {};

  for (const finding of findings) {
    const categoryList = byCategory[finding.category] ?? [];
    categoryList.push(finding);
    byCategory[finding.category] = categoryList;

    bySeverity[finding.severity].push(finding);

    if (finding.file) {
      const fileList = byFile[finding.file] ?? [];
      fileList.push(finding);
      byFile[finding.file] = fileList;
    }
  }

  return { byCategory, bySeverity, byFile };
}
