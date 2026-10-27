import { buildAnalysisResult } from '../models/Finding.js';
import { filterByMinSeverity, type AnalysisRequest } from '../models/severity.js';
import type { AnalysisResult, Finding } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { databaseQueryAnalyzer } from '../analyzers/databaseQueryAnalyzer.js';

export async function analyzeDatabaseQueries(
  projectPath: string,
  request: AnalysisRequest = {},
): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = filterByMinSeverity(
    await engine.runAnalyzer(databaseQueryAnalyzer, context),
    request.minSeverity,
  );
  return buildAnalysisResult(findings, {
    analyzer: databaseQueryAnalyzer.name,
    technologies: context.detectedTechnologies,
  });
}

export function formatDatabaseQueryResult(result: AnalysisResult): {
  findings: Finding[];
  summary: AnalysisResult['summary'];
  metadata?: Record<string, unknown>;
} {
  return {
    findings: result.findings,
    summary: result.summary,
    metadata: result.metadata,
  };
}
