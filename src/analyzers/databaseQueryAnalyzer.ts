import type { Analyzer, Finding, ProjectContext } from '../types/index.js';
import { looksLikeMongoSource, looksLikePostgresSource, parseAllSourceFiles } from './ast/astUtils.js';
import { analyzeMongoQueries } from './mongodb/queryAnalyzer.js';
import { analyzePostgresQueries } from './postgres/queryAnalyzer.js';

export class DatabaseQueryAnalyzer implements Analyzer {
  readonly name = 'database-query-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const parsed = parseAllSourceFiles(context.sourceFiles);
    const findings: Finding[] = [];

    const mongoFiles = parsed.filter((file) => looksLikeMongoSource(file.info.content));
    const postgresFiles = parsed.filter((file) => looksLikePostgresSource(file.info.content));

    if (mongoFiles.length > 0) {
      findings.push(...analyzeMongoQueries(mongoFiles));
    }
    if (postgresFiles.length > 0) {
      findings.push(...analyzePostgresQueries(postgresFiles));
    }

    return findings;
  }
}

export const databaseQueryAnalyzer = new DatabaseQueryAnalyzer();
