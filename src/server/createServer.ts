import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeAsyncPatterns } from '../tools/analyzeAsyncPatterns.js';
import { analyzeConnectionPooling } from '../tools/analyzeConnectionPooling.js';
import { analyzeDatabaseQueries } from '../tools/analyzeDatabaseQueries.js';
import { analyzeDependencies } from '../tools/analyzeDependencies.js';
import { analyzeIndexes } from '../tools/analyzeIndexes.js';
import { analyzeProject } from '../tools/analyzeProject.js';
import { getLogger } from '../utils/logger.js';

const projectPathSchema = z.object({
  projectPath: z.string().min(1).describe('Absolute or relative path to the Node.js project to analyze'),
});

export function createServer(): McpServer {
  const logger = getLogger('server');
  const server = new McpServer({
    name: 'ai-backend-performance-mcp',
    version: '0.1.0',
  });

  server.registerTool(
    'analyze_project',
    {
      description:
        'Analyze a Node.js backend project for performance issues across database, async, pooling, and dependencies.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) => {
      logger.info('Running analyze_project', { projectPath });
      const result = await analyzeProject(projectPath);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'analyze_database_queries',
    {
      description:
        'Detect MongoDB/PostgreSQL query anti-patterns such as N+1 queries, unbounded finds, and sequential query calls.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) => {
      logger.info('Running analyze_database_queries', { projectPath });
      const result = await analyzeDatabaseQueries(projectPath);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'analyze_indexes',
    {
      description:
        'Analyze MongoDB query patterns against createIndex definitions to surface potential missing indexes.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) => {
      logger.info('Running analyze_indexes', { projectPath });
      const result = await analyzeIndexes(projectPath);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'analyze_async_patterns',
    {
      description:
        'Detect async performance issues including await in loops, sequential awaits, and blocking operations.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) => {
      logger.info('Running analyze_async_patterns', { projectPath });
      const result = await analyzeAsyncPatterns(projectPath);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'analyze_connection_pooling',
    {
      description:
        'Detect database client or pool creation inside request handlers, loops, or other hot paths.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) => {
      logger.info('Running analyze_connection_pooling', { projectPath });
      const result = await analyzeConnectionPooling(projectPath);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'analyze_dependencies',
    {
      description:
        'Analyze package.json and lockfile for dependency hygiene issues including unused and misclassified packages.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath }) => {
      logger.info('Running analyze_dependencies', { projectPath });
      const result = await analyzeDependencies(projectPath);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  getLogger('server').info('MCP server started on stdio');
}
