import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeAsyncPatterns } from '../tools/analyzeAsyncPatterns.js';
import { analyzeConnectionPooling } from '../tools/analyzeConnectionPooling.js';
import { analyzeDatabaseQueries } from '../tools/analyzeDatabaseQueries.js';
import { analyzeDependencies } from '../tools/analyzeDependencies.js';
import { analyzeIndexes } from '../tools/analyzeIndexes.js';
import { analyzeProject } from '../tools/analyzeProject.js';
import { investigatePerformance } from '../tools/investigatePerformance.js';
import { getLogger, type Logger } from '../utils/logger.js';

const projectPathSchema = z.object({
  projectPath: z.string().min(1).describe('Absolute or relative path to the Node.js project to analyze'),
});

export function formatToolError(error: unknown): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export async function runAnalysisTool<T>(
  logger: Logger,
  toolName: string,
  projectPath: string,
  analyze: (projectPath: string) => Promise<T>,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: true }> {
  try {
    logger.info(`Running ${toolName}`, { projectPath });
    const result = await analyze(projectPath);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    logger.error(`${toolName} failed`, {
      projectPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return formatToolError(error);
  }
}

export function createServer(): McpServer {
  const logger = getLogger('server');
  const server = new McpServer({
    name: 'ai-backend-performance-mcp',
    version: '0.2.1',
  });

  server.registerTool(
    'analyze_project',
    {
      description:
        'Analyze a Node.js backend project for performance issues across database, async, pooling, and dependencies.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) => runAnalysisTool(logger, 'analyze_project', projectPath, analyzeProject),
  );

  server.registerTool(
    'analyze_database_queries',
    {
      description:
        'Detect MongoDB/PostgreSQL query anti-patterns such as N+1 queries, unbounded finds, and sequential query calls.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) =>
      runAnalysisTool(logger, 'analyze_database_queries', projectPath, analyzeDatabaseQueries),
  );

  server.registerTool(
    'analyze_indexes',
    {
      description:
        'Analyze MongoDB query patterns against createIndex definitions to surface potential missing indexes.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) => runAnalysisTool(logger, 'analyze_indexes', projectPath, analyzeIndexes),
  );

  server.registerTool(
    'analyze_async_patterns',
    {
      description:
        'Detect async performance issues including await in loops, sequential awaits, and blocking operations.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) =>
      runAnalysisTool(logger, 'analyze_async_patterns', projectPath, analyzeAsyncPatterns),
  );

  server.registerTool(
    'analyze_connection_pooling',
    {
      description:
        'Detect database client or pool creation inside request handlers, loops, or other hot paths.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) =>
      runAnalysisTool(logger, 'analyze_connection_pooling', projectPath, analyzeConnectionPooling),
  );

  server.registerTool(
    'analyze_dependencies',
    {
      description:
        'Analyze package.json and lockfile for dependency hygiene issues including unused and misclassified packages.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) =>
      runAnalysisTool(logger, 'analyze_dependencies', projectPath, analyzeDependencies),
  );

  server.registerTool(
    'investigate_performance',
    {
      description:
        'Run all analyzers and return enriched findings with code-path context, related issues, clusters, hotspots, and what to inspect next. Deterministic; does not call an LLM.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) =>
      runAnalysisTool(logger, 'investigate_performance', projectPath, investigatePerformance),
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  getLogger('server').info('MCP server started on stdio');
}
