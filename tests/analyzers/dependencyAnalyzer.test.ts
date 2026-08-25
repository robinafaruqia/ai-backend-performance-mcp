import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dependencyAnalyzer } from '../../src/analyzers/dependencies/dependencyAnalyzer.js';
import { createAnalysisEngine } from '../../src/analysisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

describe('dependencyAnalyzer', () => {
  it('detects dependency hygiene issues', async () => {
    const engine = createAnalysisEngine();
    const context = await engine.loadContext(path.join(fixturesRoot, 'dependency-issues'));
    const findings = await dependencyAnalyzer.analyze(context);

    const unused = findings.find((f) => f.title.includes('unused production dependency'));
    expect(unused).toBeDefined();
    expect(unused?.category).toBe('dependencies');
    expect(unused?.evidence.kind).toBe('potential');

    const misclassified = findings.find((f) =>
      f.title.includes('Development dependency imported'),
    );
    expect(misclassified).toBeDefined();
    expect(misclassified?.severity).toBe('medium');

    const testTool = findings.find((f) => f.title.includes('Test tool listed'));
    expect(testTool).toBeDefined();
    expect(testTool?.evidence.kind).toBe('confirmed');
  });

  it('does not flag a tidy package.json with matching imports', async () => {
    const engine = createAnalysisEngine();
    const context = await engine.loadContext(path.join(fixturesRoot, 'valid-dependencies'));
    const findings = await dependencyAnalyzer.analyze(context);
    expect(findings).toHaveLength(0);
  });
});
