import { buildAnalysisResult } from '../models/Finding.js';
import { filterByMinSeverity, type AnalysisRequest } from '../models/severity.js';
import type { AnalysisResult } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { indexAnalyzer } from '../analyzers/mongodb/indexAnalyzerRunner.js';

export async function analyzeIndexes(
  projectPath: string,
  request: AnalysisRequest = {},
): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = filterByMinSeverity(await engine.runAnalyzer(indexAnalyzer, context), request.minSeverity);
  return buildAnalysisResult(findings, {
    analyzer: indexAnalyzer.name,
    technologies: context.detectedTechnologies,
  });
}
