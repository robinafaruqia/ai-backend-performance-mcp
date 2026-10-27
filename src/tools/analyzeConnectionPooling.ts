import { buildAnalysisResult } from '../models/Finding.js';
import { filterByMinSeverity, type AnalysisRequest } from '../models/severity.js';
import type { AnalysisResult } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { connectionPoolAnalyzer } from '../analyzers/pooling/connectionPoolAnalyzer.js';

export async function analyzeConnectionPooling(
  projectPath: string,
  request: AnalysisRequest = {},
): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = filterByMinSeverity(
    await engine.runAnalyzer(connectionPoolAnalyzer, context),
    request.minSeverity,
  );
  return buildAnalysisResult(findings, {
    analyzer: connectionPoolAnalyzer.name,
    technologies: context.detectedTechnologies,
  });
}
