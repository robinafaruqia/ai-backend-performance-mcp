import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/tools/analyzeProject.js';
import { analyzeDatabaseQueries } from '../../src/tools/analyzeDatabaseQueries.js';
import { analyzeAsyncPatterns } from '../../src/tools/analyzeAsyncPatterns.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

describe('MCP tool wrappers', () => {
  it('analyze_project returns structured output', async () => {
    const result = await analyzeProject(path.join(fixturesRoot, 'n-plus-one'));

    expect(result.projectPath).toContain('n-plus-one');
    expect(result.metadata.sourceFileCount).toBeGreaterThan(0);
    expect(result.summary.totalFindings).toBeGreaterThan(0);
    expect(result.groupedFindings.byCategory.database?.length).toBeGreaterThan(0);
  });

  it('analyze_database_queries returns findings with summary', async () => {
    const result = await analyzeDatabaseQueries(path.join(fixturesRoot, 'n-plus-one'));
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.summary.bySeverity.high).toBeGreaterThan(0);
  });

  it('analyze_async_patterns returns async findings', async () => {
    const result = await analyzeAsyncPatterns(path.join(fixturesRoot, 'await-in-loop'));
    expect(result.findings.some((f) => f.category === 'async')).toBe(true);
  });
});
