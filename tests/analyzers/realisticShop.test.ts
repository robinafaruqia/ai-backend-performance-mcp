import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/tools/analyzeProject.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('realistic shop fixture', () => {
  it('reports the known hot-path issues and stays quiet on shared clients and covered queries', async () => {
    const result = await analyzeProject(path.join(__dirname, '../fixtures/realistic-shop'));
    const ruleIds = result.findings.map((finding) => finding.ruleId).sort();

    expect(ruleIds).toEqual([
      'async.await-in-loop',
      'db.mongo.index-not-in-source',
      'db.mongo.n-plus-one',
      'db.mongo.unbounded-find',
    ]);

    const indexFinding = result.findings.find((finding) => finding.ruleId === 'db.mongo.index-not-in-source');
    expect(indexFinding?.evidence.kind).toBe('potential');
    expect(indexFinding?.evidence.snippet).toContain('status');
    expect(indexFinding?.recommendation).toMatch(/not a missing-index verdict/i);
    expect(indexFinding?.evidence.snippet).not.toContain('limit(20)');

    expect(result.metadata.scanTruncated).toBe(false);
    expect(result.metadata.skippedSymlinks).toBe(0);
  });
});