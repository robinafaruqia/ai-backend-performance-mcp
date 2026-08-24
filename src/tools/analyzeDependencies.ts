import { buildAnalysisResult } from '../models/Finding.js';
import type { AnalysisResult } from '../types/index.js';
import { createAnalysisEngine } from '../analysisEngine.js';
import { dependencyAnalyzer } from '../analyzers/dependencies/dependencyAnalyzer.js';

export async function analyzeDependencies(projectPath: string): Promise<AnalysisResult> {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = await engine.runAnalyzer(dependencyAnalyzer, context);
  return buildAnalysisResult(findings, {
    analyzer: dependencyAnalyzer.name,
    packageName: context.packageJson?.name ?? null,
  });
}
