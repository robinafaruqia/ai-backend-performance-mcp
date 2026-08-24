import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asyncPatternAnalyzer } from '../../src/analyzers/async/asyncPatternAnalyzer.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

describe('asyncPatternAnalyzer', () => {
  it('detects await inside loops', async () => {
    const engine = createAnalysisEngine();
    const context = await engine.loadContext(path.join(fixturesRoot, 'await-in-loop'));
    const findings = await asyncPatternAnalyzer.analyze(context);

    const awaitInLoop = findings.find((f) => f.title === 'await inside loop');
    expect(awaitInLoop).toBeDefined();
    expect(awaitInLoop?.category).toBe('async');
    expect(awaitInLoop?.severity).toBe('high');
    expect(awaitInLoop?.evidence.kind).toBe('confirmed');
    expect(awaitInLoop?.file).toContain('fetcher.ts');
  });

  it('detects sequential independent awaits', async () => {
    const engine = createAnalysisEngine();
    const context = await engine.loadContext(path.join(fixturesRoot, 'sequential-awaits'));
    const findings = await asyncPatternAnalyzer.analyze(context);

    const sequential = findings.find((f) => f.title === 'Sequential independent awaits');
    expect(sequential).toBeDefined();
    expect(sequential?.category).toBe('async');
    expect(sequential?.file).toContain('dashboard.ts');
    expect(sequential?.confidence).toBeGreaterThan(0);
  });
});
