import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asyncPatternAnalyzer } from '../../src/analyzers/async/asyncPatternAnalyzer.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

async function analyzeFixture(name: string) {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(path.join(fixturesRoot, name));
  return asyncPatternAnalyzer.analyze(context);
}

describe('asyncPatternAnalyzer', () => {
  it('detects await inside loops', async () => {
    const findings = await analyzeFixture('await-in-loop');
    const awaitInLoop = findings.find((finding) => finding.title === 'await inside loop');
    expect(awaitInLoop).toBeDefined();
    expect(awaitInLoop?.category).toBe('async');
    expect(awaitInLoop?.severity).toBe('high');
    expect(awaitInLoop?.evidence.kind).toBe('confirmed');
    expect(awaitInLoop?.file).toContain('fetcher.ts');
    expect(awaitInLoop?.recommendation).not.toMatch(/always use Promise\.all/i);
  });

  it('detects sequential independent awaits', async () => {
    const findings = await analyzeFixture('sequential-awaits');
    const sequential = findings.find((finding) => finding.title === 'Sequential independent awaits');
    expect(sequential).toBeDefined();
    expect(sequential?.category).toBe('async');
    expect(sequential?.file).toContain('dashboard.ts');
    expect(sequential?.confidence).toBeGreaterThan(0);
  });

  it('does not recommend Promise.all when awaits are data-dependent or paginated', async () => {
    const findings = await analyzeFixture('dependent-awaits');
    expect(findings.filter((finding) => finding.title === 'Sequential independent awaits')).toHaveLength(
      0,
    );
    expect(findings.filter((finding) => finding.title === 'await inside loop')).toHaveLength(0);
  });

  it('flags sync I/O in handlers but not module-scope startup reads', async () => {
    const findings = await analyzeFixture('blocking-in-handler');
    const blocking = findings.filter((finding) => finding.ruleId === 'async.blocking-sync-in-handler');
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.every((finding) => finding.file?.includes('server.ts'))).toBe(true);
  });
});
