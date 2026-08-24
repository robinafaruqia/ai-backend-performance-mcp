import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indexAnalyzer } from '../../src/analyzers/mongodb/indexAnalyzerRunner.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

async function analyzeFixture(name: string) {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(path.join(fixturesRoot, name));
  return indexAnalyzer.analyze(context);
}

describe('indexAnalyzer', () => {
  it('detects query fields not covered by in-repo createIndex', async () => {
    const findings = await analyzeFixture('index-mismatch');
    const missingIndex = findings.find((finding) => finding.title.includes('missing MongoDB index'));
    expect(missingIndex).toBeDefined();
    expect(missingIndex?.category).toBe('database');
    expect(missingIndex?.file).toContain('orders.ts');
    expect(missingIndex?.recommendation).toContain('index');
    expect(missingIndex?.evidence.kind).toBe('potential');
    expect(missingIndex?.confidence).toBeLessThan(0.7);
    expect(missingIndex?.line).toBeGreaterThan(0);
    expect(missingIndex?.column).toBeGreaterThan(0);
  });

  it('does not flag queries covered by in-repo indexes or _id lookups', async () => {
    const findings = await analyzeFixture('index-covered');
    expect(findings).toHaveLength(0);
  });

  it('does not claim indexes are missing when the repo has no createIndex calls', async () => {
    const findings = await analyzeFixture('index-atlas-only');
    expect(findings).toHaveLength(0);
  });
});
