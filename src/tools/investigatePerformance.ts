import { createAnalysisEngine, type AnalysisEngine } from '../analysisEngine.js';
import { buildInvestigationResult } from '../investigation/buildInvestigation.js';
import { filterByMinSeverity, type AnalysisRequest } from '../models/severity.js';
import type { InvestigationResult } from '../types/index.js';

export async function investigatePerformance(
  projectPath: string,
  engine: AnalysisEngine = createAnalysisEngine(),
  request: AnalysisRequest = {},
): Promise<InvestigationResult> {
  const context = await engine.loadContext(projectPath);
  const findings = filterByMinSeverity(await engine.runAll(context), request.minSeverity);
  return buildInvestigationResult(context, findings);
}
