import type { Analyzer, Finding, ProjectContext } from '../../types/index.js';
import { parseAllSourceFiles } from '../ast/astUtils.js';
import { analyzeMongoIndexes } from './indexAnalyzer.js';

export class MongoIndexAnalyzer implements Analyzer {
  readonly name = 'mongodb-index-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const parsed = parseAllSourceFiles(context.sourceFiles);
    return analyzeMongoIndexes(parsed);
  }
}

export const indexAnalyzer = new MongoIndexAnalyzer();
