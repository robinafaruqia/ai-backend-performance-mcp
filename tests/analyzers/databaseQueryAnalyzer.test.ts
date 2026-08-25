import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { databaseQueryAnalyzer } from '../../src/analyzers/databaseQueryAnalyzer.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

async function analyzeFixture(name: string) {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(path.join(fixturesRoot, name));
  return databaseQueryAnalyzer.analyze(context);
}

describe('databaseQueryAnalyzer', () => {
  it('detects N+1 query patterns in loops', async () => {
    const findings = await analyzeFixture('n-plus-one');
    const nPlusOne = findings.find((finding) => finding.title.includes('inside loop'));
    expect(nPlusOne).toBeDefined();
    expect(nPlusOne?.category).toBe('database');
    expect(nPlusOne?.severity).toBe('high');
    expect(nPlusOne?.file).toContain('users.ts');
    expect(nPlusOne?.line).toBeGreaterThan(0);
    expect(nPlusOne?.confidence).toBeGreaterThan(0.5);
    expect(nPlusOne?.ruleId).toBe('db.mongo.n-plus-one');
    expect(nPlusOne?.evidence.kind).toBe('potential');
  });

  it('does not flag Array.find, batched $in, findOne, or limited find', async () => {
    const findings = await analyzeFixture('valid-mongo-patterns');
    expect(findings.filter((finding) => finding.title.includes('inside loop'))).toHaveLength(0);
    expect(findings.filter((finding) => finding.title.includes('unbounded'))).toHaveLength(0);
  });

  it('detects PostgreSQL N+1 while allowing ANY() batching and INSERT', async () => {
    const bad = await analyzeFixture('postgres-n-plus-one');
    expect(bad.some((finding) => finding.ruleId === 'db.pg.n-plus-one')).toBe(true);

    const good = await analyzeFixture('valid-postgres');
    expect(good.filter((finding) => finding.ruleId === 'db.pg.n-plus-one')).toHaveLength(0);
    expect(good.filter((finding) => finding.ruleId === 'db.pg.unbounded-select')).toHaveLength(0);
  });
});
