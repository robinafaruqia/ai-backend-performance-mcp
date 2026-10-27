import { buildAnalysisResult } from '../models/Finding.js';
import { filterByMinSeverity, type AnalysisRequest } from '../models/severity.js';
import type { AnalysisResult } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { asyncPatternAnalyzer } from '../analyzers/async/asyncPatternAnalyzer.js';

export async function analyzeAsyncPatterns(
  projectPath: string,
  request: AnalysisRequest = {},
): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = filterByMinSeverity(
    await engine.runAnalyzer(asyncPatternAnalyzer, context),
    request.minSeverity,
  );
  return buildAnalysisResult(findings, {
    analyzer: asyncPatternAnalyzer.name,
    sourceFileCount: context.sourceFiles.length,
  });
}
