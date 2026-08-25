import { buildAnalysisResult, groupFindings } from '../models/Finding.js';
import type { AnalysisResult, Finding, GroupedFindings, ProjectContext } from '../types/index.js';
import { createAnalysisEngine, type AnalysisEngine } from '../analysisEngine.js';

export interface ProjectAnalysisOutput {
  projectPath: string;
  technologies: string[];
  metadata: {
    packageName: string | null;
    packageVersion: string | null;
    sourceFileCount: number;
  };
  findings: Finding[];
  groupedFindings: GroupedFindings;
  summary: AnalysisResult['summary'];
}

export async function analyzeProject(
  projectPath: string,
  engine: AnalysisEngine = createAnalysisEngine(),
): Promise<ProjectAnalysisOutput> {
  const context = await engine.loadContext(projectPath);
  const findings = await engine.runAll(context);
  const result = buildAnalysisResult(findings, {
    technologies: context.detectedTechnologies,
    sourceFileCount: context.sourceFiles.length,
  });

  return formatProjectOutput(context, result.findings, result.summary);
}

export function formatProjectOutput(
  context: ProjectContext,
  findings: Finding[],
  summary: AnalysisResult['summary'],
): ProjectAnalysisOutput {
  return {
    projectPath: context.projectPath,
    technologies: context.detectedTechnologies,
    metadata: {
      packageName: context.packageJson?.name ?? null,
      packageVersion: context.packageJson?.version ?? null,
      sourceFileCount: context.sourceFiles.length,
    },
    findings,
    groupedFindings: groupFindings(findings),
    summary,
  };
}
