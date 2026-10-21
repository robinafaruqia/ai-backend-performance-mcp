import path from 'node:path';
import { detectTechnologies, parsePackageJson } from './parsers/packageJson.js';
import { loadSourceFiles } from './parsers/sourceFiles.js';
import { createProjectContext } from './models/ProjectContext.js';
import type { Analyzer, Finding, ProjectContext } from './types/index.js';
import { resolveProjectPath } from './utils/fileSystem.js';
import { asyncPatternAnalyzer } from './analyzers/async/asyncPatternAnalyzer.js';
import { databaseQueryAnalyzer } from './analyzers/databaseQueryAnalyzer.js';
import { dependencyAnalyzer } from './analyzers/dependencies/dependencyAnalyzer.js';
import { indexAnalyzer } from './analyzers/mongodb/indexAnalyzerRunner.js';
import { connectionPoolAnalyzer } from './analyzers/pooling/connectionPoolAnalyzer.js';
import { finalizeFindings } from './investigation/finalizeFindings.js';

export interface AnalysisEngineOptions {
  analyzers?: Analyzer[];
}

const defaultAnalyzers: Analyzer[] = [
  databaseQueryAnalyzer,
  indexAnalyzer,
  asyncPatternAnalyzer,
  connectionPoolAnalyzer,
  dependencyAnalyzer,
];

export class AnalysisEngine {
  private readonly analyzers: Analyzer[];

  constructor(options: AnalysisEngineOptions = {}) {
    this.analyzers = options.analyzers ?? defaultAnalyzers;
  }

  async loadContext(projectPath: string): Promise<ProjectContext> {
    const resolvedPath = await resolveProjectPath(projectPath);
    const { packageJson } = await parsePackageJson(resolvedPath);
    const detectedTechnologies = detectTechnologies(packageJson);
    const contextShell = createProjectContext({
      projectPath: resolvedPath,
      packageJson,
      sourceFiles: [],
      detectedTechnologies,
    });
    const loaded = await loadSourceFiles(resolvedPath, {
      extensions: contextShell.config.extensions,
      skipPatterns: contextShell.config.skipPatterns,
      maxFileSizeBytes: contextShell.config.maxFileSizeBytes,
      maxSourceFiles: contextShell.config.maxSourceFiles,
      maxTotalBytes: contextShell.config.maxTotalBytes,
    });

    return createProjectContext({
      projectPath: resolvedPath,
      packageJson,
      sourceFiles: loaded.files,
      detectedTechnologies,
      scan: loaded.scan,
    });
  }

  async runAll(context: ProjectContext): Promise<Finding[]> {
    const results = await Promise.all(this.analyzers.map((analyzer) => analyzer.analyze(context)));
    return finalizeFindings(context, results.flat());
  }

  async runAnalyzer(analyzer: Analyzer, context: ProjectContext): Promise<Finding[]> {
    const findings = await analyzer.analyze(context);
    return finalizeFindings(context, findings);
  }

  getAnalyzers(): Analyzer[] {
    return [...this.analyzers];
  }
}

export function createAnalysisEngine(options?: AnalysisEngineOptions): AnalysisEngine {
  return new AnalysisEngine(options);
}

export async function buildProjectContext(projectPath: string): Promise<ProjectContext> {
  const engine = createAnalysisEngine();
  return engine.loadContext(path.resolve(projectPath));
}
