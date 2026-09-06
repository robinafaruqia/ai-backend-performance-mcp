import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { investigatePerformance } from '../../src/tools/investigatePerformance.js';
import { analyzeProject } from '../../src/tools/analyzeProject.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');
const samplePath = path.join(__dirname, '../../examples/sample-node-api');

describe('investigate_performance', () => {
  it('returns enriched findings, clusters, hotspots, and inspectNext for sample-node-api', async () => {
    const result = await investigatePerformance(samplePath);

    expect(result.projectContext.packageName).toBe('sample-node-api');
    expect(result.projectContext.frameworks).toContain('express');
    expect(result.projectContext.databases).toContain('mongodb');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.inspectNext.length).toBeGreaterThan(0);
    expect(result.hotspots.length).toBe(result.findings.length);

    const pooling = result.findings.find((finding) => finding.ruleId === 'pooling.client-in-handler');
    expect(pooling?.location?.hotPath).toBe('request-handler');
    expect(pooling?.location?.route?.path).toBe('/users/:id/orders');
    expect(pooling?.costWhy).toMatch(/handshake/i);
    expect(pooling?.relatedFindingIds?.length).toBeGreaterThan(0);
    expect(pooling?.id).toMatch(/^pooling\.client-in-handler:/);

    expect(result.summary.clusterCount).toBe(result.clusters.length);
  });

  it('uses stable finding ids across runs', async () => {
    const first = await investigatePerformance(path.join(fixturesRoot, 'connection-in-handler'));
    const second = await investigatePerformance(path.join(fixturesRoot, 'connection-in-handler'));
    expect(first.findings.map((finding) => finding.id)).toEqual(second.findings.map((finding) => finding.id));
  });

  it('marks connection-in-handler as a request-handler hot path', async () => {
    const result = await investigatePerformance(path.join(fixturesRoot, 'connection-in-handler'));
    const pooling = result.findings.find((finding) => finding.ruleId === 'pooling.client-in-handler');
    expect(pooling?.location?.hotPath).toBe('request-handler');
    expect(pooling?.technology?.frameworks).toContain('express');
    expect(pooling?.technology?.ruleFamily).toBe('pooling');
  });
});

describe('analyze_project enrichment', () => {
  it('attaches location and guidance on existing tools', async () => {
    const result = await analyzeProject(path.join(fixturesRoot, 'n-plus-one'));
    const nPlusOne = result.findings.find((finding) => finding.ruleId === 'db.mongo.n-plus-one');
    expect(nPlusOne?.location?.hotPath).toBe('loop');
    expect(nPlusOne?.inspectNext?.length).toBeGreaterThan(0);
    expect(nPlusOne?.technology?.databases).toContain('mongodb');
  });
});
