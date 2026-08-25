import { buildAnalysisResult } from '../models/Finding.js';
import type { AnalysisResult } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { connectionPoolAnalyzer } from '../analyzers/pooling/connectionPoolAnalyzer.js';

export async function analyzeConnectionPooling(projectPath: string): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = await engine.runAnalyzer(connectionPoolAnalyzer, context);
  return buildAnalysisResult(findings, {
    analyzer: connectionPoolAnalyzer.name,
    technologies: context.detectedTechnologies,
  });
}
