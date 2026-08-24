import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { connectionPoolAnalyzer } from '../../src/analyzers/pooling/connectionPoolAnalyzer.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

describe('connectionPoolAnalyzer', () => {
  it('detects connection creation in request handlers', async () => {
    const engine = createAnalysisEngine();
    const context = await engine.loadContext(path.join(fixturesRoot, 'connection-in-handler'));
    const findings = await connectionPoolAnalyzer.analyze(context);

    const handlerFinding = findings.find((f) =>
      f.title.includes('request handler'),
    );
    expect(handlerFinding).toBeDefined();
    expect(handlerFinding?.category).toBe('pooling');
    expect(handlerFinding?.severity).toBe('critical');
    expect(handlerFinding?.file).toContain('server.ts');
    expect(handlerFinding?.evidence.kind).toBe('confirmed');
  });
});
