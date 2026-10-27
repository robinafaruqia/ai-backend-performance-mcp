import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indexAnalyzer } from '../../src/analyzers/mongodb/indexAnalyzerRunner.js';
import { compoundIndexCovers } from '../../src/analyzers/mongodb/indexAnalyzer.js';
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

  it('flags non-prefix fields and sort directions a reverse scan cannot serve', async () => {
    const findings = await analyzeFixture('index-compound');
    expect(findings).toHaveLength(2);
    expect(findings.every((finding) => finding.evidence.kind === 'potential')).toBe(true);
    expect(findings.every((finding) => finding.confidence < 0.7)).toBe(true);
    const details = findings.map((finding) => finding.evidence.detail ?? '').join('\n');
    expect(details).toContain('email');
    expect(details).toContain('name:1');
    expect(details).not.toContain('equality [status]; range [none]; sort [createdAt:-1]');
    expect(findings[0]?.recommendation).toMatch(/not a missing-index verdict/i);
  });

  it('stays silent when createIndex arguments are dynamic', async () => {
    const findings = await analyzeFixture('index-dynamic');
    expect(findings).toHaveLength(0);
  });
});

describe('compoundIndexCovers', () => {
  const statusCreated = [
    { name: 'status', direction: 1 as const },
    { name: 'createdAt', direction: -1 as const },
  ];

  it('accepts an equality prefix and the same or fully reversed sort', () => {
    expect(
      compoundIndexCovers(statusCreated, {
        equalityFields: ['status'],
        rangeFields: [],
        sortKeys: [{ name: 'createdAt', direction: -1 }],
      }),
    ).toBe(true);
    expect(
      compoundIndexCovers(statusCreated, {
        equalityFields: ['status'],
        rangeFields: [],
        sortKeys: [{ name: 'createdAt', direction: 1 }],
      }),
    ).toBe(true);
  });

  it('rejects a sort whose directions are not a full reverse', () => {
    expect(
      compoundIndexCovers(
        [
          { name: 'status', direction: 1 },
          { name: 'createdAt', direction: -1 },
          { name: 'name', direction: 1 },
        ],
        {
          equalityFields: ['status'],
          rangeFields: [],
          sortKeys: [
            { name: 'createdAt', direction: 1 },
            { name: 'name', direction: 1 },
          ],
        },
      ),
    ).toBe(false);
  });
});
