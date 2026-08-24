import { buildAnalysisResult } from '../models/Finding.js';
import type { AnalysisResult } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { indexAnalyzer } from '../analyzers/mongodb/indexAnalyzerRunner.js';

export async function analyzeIndexes(projectPath: string): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = await engine.runAnalyzer(indexAnalyzer, context);
  return buildAnalysisResult(findings, {
    analyzer: indexAnalyzer.name,
    technologies: context.detectedTechnologies,
  });
}
