import { buildAnalysisResult } from '../models/Finding.js';
import type { AnalysisResult } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { asyncPatternAnalyzer } from '../analyzers/async/asyncPatternAnalyzer.js';

export async function analyzeAsyncPatterns(projectPath: string): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = await engine.runAnalyzer(asyncPatternAnalyzer, context);
  return buildAnalysisResult(findings, {
    analyzer: asyncPatternAnalyzer.name,
    sourceFileCount: context.sourceFiles.length,
  });
}
