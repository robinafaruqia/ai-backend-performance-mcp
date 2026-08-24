import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indexAnalyzer } from '../../src/analyzers/mongodb/indexAnalyzerRunner.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

describe('indexAnalyzer', () => {
  it('detects potential missing MongoDB indexes', async () => {
    const engine = createAnalysisEngine();
    const context = await engine.loadContext(path.join(fixturesRoot, 'index-mismatch'));
    const findings = await indexAnalyzer.analyze(context);

    const missingIndex = findings.find((f) => f.title.includes('missing MongoDB index'));
    expect(missingIndex).toBeDefined();
    expect(missingIndex?.category).toBe('database');
    expect(missingIndex?.file).toContain('orders.ts');
    expect(missingIndex?.recommendation).toContain('index');
    expect(missingIndex?.evidence.kind).toBe('potential');
  });
});
