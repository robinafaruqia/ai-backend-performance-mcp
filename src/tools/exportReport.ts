import { findingsToSarif } from '../report/sarif.js';
import type { AnalysisRequest } from '../models/severity.js';
import { analyzeProject } from './analyzeProject.js';

export interface ExportReportOptions extends AnalysisRequest {
  format?: 'json' | 'sarif';
}

export async function exportReport(projectPath: string, options: ExportReportOptions = {}) {
  const project = await analyzeProject(projectPath, undefined, options);
  if (options.format === 'sarif') {
    return {
      format: 'sarif' as const,
      report: findingsToSarif(project.findings),
    };
  }
  return {
    format: 'json' as const,
    report: project,
  };
}
