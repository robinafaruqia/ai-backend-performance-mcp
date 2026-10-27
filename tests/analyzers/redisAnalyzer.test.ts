import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createAnalysisEngine } from '../../src/analysisEngine.js';
import { redisAnalyzer } from '../../src/analyzers/redis/redisAnalyzer.js';

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

async function rules(name: string) {
  const engine = createAnalysisEngine();
  const context = await engine.loadContext(path.join(fixturesRoot, name));
  const findings = await redisAnalyzer.analyze(context);
  return findings.map((finding) => finding.ruleId).sort();
}

describe('redisAnalyzer', () => {
  it('flags KEYS, missing TTL, per-request clients, and commands in loops', async () => {
    expect(await rules('redis-issues')).toEqual([
      'redis.client-in-handler',
      'redis.command-in-loop',
      'redis.keys-command',
      'redis.set-without-ttl',
    ]);
  });

  it('does not flag a shared client or a SET with EX', async () => {
    expect(await rules('valid-redis')).toEqual([]);
  });
});
