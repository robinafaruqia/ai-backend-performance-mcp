import type { Analyzer, Finding, ProjectContext } from '../types/index.js';
import { parseAllSourceFiles } from './ast/astUtils.js';
import { analyzeMongoQueries } from './mongodb/queryAnalyzer.js';
import { analyzePostgresQueries } from './postgres/queryAnalyzer.js';

export class DatabaseQueryAnalyzer implements Analyzer {
  readonly name = 'database-query-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const parsed = parseAllSourceFiles(context.sourceFiles);
    const findings: Finding[] = [];

    const hasMongo =
      context.detectedTechnologies.includes('mongodb') ||
      context.detectedTechnologies.includes('mongoose');
    const hasPostgres =
      context.detectedTechnologies.includes('postgresql') ||
      context.detectedTechnologies.includes('prisma');

    if (hasMongo || !hasPostgres) {
      findings.push(...analyzeMongoQueries(parsed));
    }

    if (hasPostgres || !hasMongo) {
      findings.push(...analyzePostgresQueries(parsed));
    }

    return findings;
  }
}

export const databaseQueryAnalyzer = new DatabaseQueryAnalyzer();
