import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { connectionPoolAnalyzer } from '../../src/analyzers/pooling/connectionPoolAnalyzer.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

async function analyzeFixture(name: string) {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(path.join(fixturesRoot, name));
  return connectionPoolAnalyzer.analyze(context);
}

describe('connectionPoolAnalyzer', () => {
  it('detects connection creation in request handlers', async () => {
    const findings = await analyzeFixture('connection-in-handler');
    const handlerFinding = findings.find((finding) => finding.title.includes('request handler'));
    expect(handlerFinding).toBeDefined();
    expect(handlerFinding?.category).toBe('pooling');
    expect(handlerFinding?.severity).toBe('critical');
    expect(handlerFinding?.file).toContain('server.ts');
    expect(handlerFinding?.evidence.kind).toBe('confirmed');
    expect(handlerFinding?.line).toBeGreaterThan(0);
  });

  it('does not flag module-scope or startup client construction', async () => {
    const findings = await analyzeFixture('valid-pooling-startup');
    expect(findings).toHaveLength(0);
  });
});
