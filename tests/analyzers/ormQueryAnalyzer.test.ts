import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createAnalysisEngine } from '../../src/analysisEngine.js';
import { ormQueryAnalyzer } from '../../src/analyzers/orm/ormQueryAnalyzer.js';

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

async function rules(name: string) {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(path.join(fixturesRoot, name));
  const findings = await ormQueryAnalyzer.analyze(context);
  return findings.map((finding) => finding.ruleId).sort();
}

describe('ormQueryAnalyzer', () => {
  it('flags Prisma and TypeORM N+1 and unbounded reads', async () => {
    expect(await rules('orm-issues')).toEqual([
      'orm.prisma.n-plus-one',
      'orm.prisma.unbounded-find',
      'orm.typeorm.n-plus-one',
      'orm.typeorm.unbounded-find',
    ]);
  });

  it('does not flag bounded Prisma and TypeORM reads', async () => {
    expect(await rules('valid-orm')).toEqual([]);
  });
});
