import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { databaseQueryAnalyzer } from '../../src/analyzers/databaseQueryAnalyzer.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

describe('databaseQueryAnalyzer', () => {
  it('detects N+1 query patterns in loops', async () => {
    const engine = createAnalysisEngine();
    const context = await engine.loadContext(path.join(fixturesRoot, 'n-plus-one'));
    const findings = await databaseQueryAnalyzer.analyze(context);

    const nPlusOne = findings.find((f) => f.title.includes('inside loop'));
    expect(nPlusOne).toBeDefined();
    expect(nPlusOne?.category).toBe('database');
    expect(nPlusOne?.severity).toBe('high');
    expect(nPlusOne?.file).toContain('users.ts');
    expect(nPlusOne?.line).toBeGreaterThan(0);
    expect(nPlusOne?.confidence).toBeGreaterThan(0);
    expect(nPlusOne?.recommendation.length).toBeGreaterThan(0);
    expect(nPlusOne?.evidence.kind).toBe('potential');
  });
});
