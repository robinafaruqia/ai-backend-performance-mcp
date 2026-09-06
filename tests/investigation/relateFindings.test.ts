import { describe, expect, it } from 'vitest';
import { createFinding } from '../../src/models/Finding.js';
import { findingsRelated } from '../../src/investigation/relateFindings.js';
import { Confidence } from '../../src/models/confidence.js';

function finding(ruleId: string, file: string, extras: Record<string, unknown> = {}) {
  return {
    ...createFinding({
      ruleId,
      category: 'database',
      severity: 'high',
      title: ruleId,
      description: ruleId,
      file,
      line: 1,
      column: 1,
      evidence: { kind: 'potential', snippet: 'x' },
      recommendation: 'fix',
      confidence: Confidence.potentialStrong,
      estimatedImpact: 'latency',
    }),
    ...extras,
  };
}

describe('findingsRelated', () => {
  it('links findings in the same file', () => {
    const a = finding('db.mongo.n-plus-one', 'src/users.ts');
    const b = finding('async.await-in-loop', 'src/users.ts');
    expect(findingsRelated(a, b)).toBe(true);
  });

  it('links complementary pooling and N+1 across files', () => {
    const a = finding('pooling.client-in-handler', 'src/server.ts');
    const b = finding('db.mongo.n-plus-one', 'src/users.ts');
    expect(findingsRelated(a, b)).toBe(true);
  });

  it('links complementary pooling and await-in-loop across files', () => {
    const a = finding('pooling.client-in-handler', 'src/server.ts');
    const b = finding('async.await-in-loop', 'src/users.ts');
    expect(findingsRelated(a, b)).toBe(true);
  });

  it('does not link unrelated findings in different files', () => {
    const a = finding('deps.unused-production', 'package.json');
    a.file = undefined;
    const b = finding('async.sequential-independent-awaits', 'src/dashboard.ts');
    expect(findingsRelated(a, b)).toBe(false);
  });
});
