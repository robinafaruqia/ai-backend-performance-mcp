import { createAnalysisEngine, type AnalysisEngine } from '../analysisEngine.js';
import { buildInvestigationResult } from '../investigation/buildInvestigation.js';
import type { InvestigationResult } from '../types/index.js';

export async function investigatePerformance(
  projectPath: string,
  engine: AnalysisEngine = createAnalysisEngine(),
): Promise<InvestigationResult> {
  const context = await engine.loadContext(projectPath);
  const findings = await engine.runAll(context);
  return buildInvestigationResult(context, findings);
}
