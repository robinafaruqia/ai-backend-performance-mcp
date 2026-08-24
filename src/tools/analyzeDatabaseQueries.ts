import { buildAnalysisResult } from '../models/Finding.js';
import type { AnalysisResult, Finding } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { databaseQueryAnalyzer } from '../analyzers/databaseQueryAnalyzer.js';

export async function analyzeDatabaseQueries(projectPath: string): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = await engine.runAnalyzer(databaseQueryAnalyzer, context);
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
