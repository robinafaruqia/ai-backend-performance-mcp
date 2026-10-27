import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clearProjectContextCache, createAnalysisEngine } from '../../src/analysisEngine.js';
import { llmConfigFromEnv, createOpenAiCompatibleClient } from '../../src/llm/client.js';
import { LLM_SYSTEM_PROMPT } from '../../src/llm/explain.js';
import { ruleCatalogChunks } from '../../src/rag/buildChunks.js';
import { retrieveChunks } from '../../src/rag/retrieve.js';
import { analyzeProject } from '../../src/tools/analyzeProject.js';
import { explainPerformance } from '../../src/tools/explainPerformance.js';
import { exportReport } from '../../src/tools/exportReport.js';

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

describe('severity, cache, SARIF, and RAG', () => {
  it('drops findings below the requested severity', async () => {
    const project = path.join(fixturesRoot, 'n-plus-one');
    const high = await analyzeProject(project, undefined, { minSeverity: 'high' });
    const critical = await analyzeProject(project, undefined, { minSeverity: 'critical' });
    expect(high.findings.length).toBeGreaterThan(0);
    expect(high.findings.every((finding) => finding.severity === 'high' || finding.severity === 'critical')).toBe(
      true,
    );
    expect(critical.findings).toHaveLength(0);
  });

  it('reuses a project context until a source file changes', async () => {
    clearProjectContextCache();
    const root = await mkdtemp(path.join(tmpdir(), 'perf-mcp-cache-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'package.json'), '{"name":"cache-fixture","version":"1.0.0"}\n');
    await writeFile(path.join(root, 'src', 'app.js'), 'export const value = 1;\n');

    const engine = createAnalysisEngine();
    const first = await engine.loadContext(root);
    const second = await engine.loadContext(root);
    expect(second.sourceFiles).toBe(first.sourceFiles);

    await writeFile(path.join(root, 'src', 'app.js'), 'export const value = 1;\nexport const extra = 2;\n');
    const third = await engine.loadContext(root);
    expect(third.sourceFiles).not.toBe(first.sourceFiles);
    expect(third.sourceFiles[0]?.content).toContain('extra');
  });

  it('exports SARIF 2.1.0 and JSON without writing a file', async () => {
    const project = path.join(fixturesRoot, 'n-plus-one');
    const sarif = await exportReport(project, { format: 'sarif' });
    expect(sarif.format).toBe('sarif');
    if (sarif.format !== 'sarif') {
      return;
    }
    expect(sarif.report.version).toBe('2.1.0');
    expect(sarif.report.runs[0]?.results.some((result) => result.ruleId === 'db.mongo.n-plus-one')).toBe(true);

    const json = await exportReport(project, { format: 'json' });
    expect(json.format).toBe('json');
    if (json.format !== 'json') {
      return;
    }
    expect(json.report.summary.totalFindings).toBeGreaterThan(0);
  });

  it('retrieves the Redis KEYS rule card for a KEYS question', () => {
    const hits = retrieveChunks(ruleCatalogChunks(), 'Redis KEYS blocks the server', 3);
    expect(hits[0]?.ruleId).toBe('redis.keys-command');
  });

  it('answers from retrieval when no model is configured and from the LLM when one is injected', async () => {
    const project = path.join(fixturesRoot, 'redis-issues');
    const retrieved = await explainPerformance(project, {
      question: 'Why is Redis KEYS a problem here?',
      llm: null,
    });
    expect(retrieved.mode).toBe('retrieved-only');
    expect(retrieved.answer).toMatch(/without calling a model/i);
    expect(retrieved.retrieval.some((passage) => passage.ruleId === 'redis.keys-command')).toBe(true);

    let prompt = '';
    const explained = await explainPerformance(project, {
      question: 'Why is Redis KEYS a problem here?',
      llm: {
        async complete(messages) {
          prompt = messages.map((message) => message.content).join('\n');
          return 'Use SCAN instead of KEYS on the cache route.';
        },
      },
    });
    expect(explained.mode).toBe('llm');
    expect(explained.answer).toMatch(/SCAN/);
    expect(prompt).toContain(LLM_SYSTEM_PROMPT);
    expect(prompt).toContain('untrusted passage start');
  });

  it('builds an OpenAI-compatible client and ignores incomplete configuration', async () => {
    expect(llmConfigFromEnv({})).toBeNull();
    expect(llmConfigFromEnv({ PERFORMANCE_MCP_LLM_API_KEY: 'secret', PERFORMANCE_MCP_LLM_BASE_URL: 'file:///tmp' })).toBeNull();

    const client = createOpenAiCompatibleClient(
      { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'demo' },
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'grounded' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(client.complete([{ role: 'user', content: 'hi' }])).resolves.toBe('grounded');
  });
});
