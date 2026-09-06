import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createServer, formatToolError, runAnalysisTool } from '../../src/server/createServer.js';
import { analyzeProject } from '../../src/tools/analyzeProject.js';
import type { Logger } from '../../src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures');

function silentLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => silentLogger(),
  };
}

describe('createServer', () => {
  it('creates an MCP server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(server.isConnected()).toBe(false);
  });
});

describe('runAnalysisTool', () => {
  it('returns JSON content for a valid project path', async () => {
    const result = await runAnalysisTool(
      silentLogger(),
      'analyze_project',
      path.join(fixturesRoot, 'n-plus-one'),
      analyzeProject,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.type).toBe('text');
    const parsed = JSON.parse(result.content[0].text) as { summary: { totalFindings: number } };
    expect(parsed.summary.totalFindings).toBeGreaterThan(0);
  });

  it('returns isError for a missing project path without throwing', async () => {
    const result = await runAnalysisTool(
      silentLogger(),
      'analyze_project',
      path.join(fixturesRoot, 'does-not-exist'),
      analyzeProject,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/does not exist/i);
  });

  it('returns isError when the path is a file instead of a directory', async () => {
    const result = await runAnalysisTool(
      silentLogger(),
      'analyze_project',
      path.join(fixturesRoot, 'n-plus-one', 'package.json'),
      analyzeProject,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not a directory/i);
  });
});

describe('formatToolError', () => {
  it('uses Error.message when available', () => {
    const result = formatToolError(new Error('Path traversal detected: /etc/passwd'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Path traversal detected: /etc/passwd');
  });
});
