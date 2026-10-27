import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeAsyncPatterns } from '../tools/analyzeAsyncPatterns.js';
import { analyzeConnectionPooling } from '../tools/analyzeConnectionPooling.js';
import { analyzeDatabaseQueries } from '../tools/analyzeDatabaseQueries.js';
import { analyzeDependencies } from '../tools/analyzeDependencies.js';
import { analyzeIndexes } from '../tools/analyzeIndexes.js';
import { analyzeProject } from '../tools/analyzeProject.js';
import { explainPerformance } from '../tools/explainPerformance.js';
import { exportReport } from '../tools/exportReport.js';
import { investigatePerformance } from '../tools/investigatePerformance.js';
import { getLogger, type Logger } from '../utils/logger.js';

const projectPathSchema = z.object({
  projectPath: z.string().min(1).describe('Absolute or relative path to the Node.js project to analyze'),
  minSeverity: z
    .enum(['info', 'low', 'medium', 'high', 'critical'])
    .optional()
    .describe('Drop findings below this severity'),
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
    version: '0.3.0',
  });

  server.registerTool(
    'analyze_project',
    {
      description:
        'Analyze a Node.js backend project for performance issues across database, async, pooling, and dependencies.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath, minSeverity }) =>
      runAnalysisTool(logger, 'analyze_project', projectPath, (path) =>
        analyzeProject(path, undefined, { minSeverity }),
      ),
  );

  server.registerTool(
    'analyze_database_queries',
    {
      description:
        'Detect MongoDB/PostgreSQL query anti-patterns such as N+1 queries, unbounded finds, and sequential query calls.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath, minSeverity }) =>
      runAnalysisTool(logger, 'analyze_database_queries', projectPath, (path) =>
        analyzeDatabaseQueries(path, { minSeverity }),
      ),
  );

  server.registerTool(
    'analyze_indexes',
    {
      description:
        'Analyze MongoDB query patterns against createIndex definitions to surface potential missing indexes.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath, minSeverity }) =>
      runAnalysisTool(logger, 'analyze_indexes', projectPath, (path) => analyzeIndexes(path, { minSeverity })),
  );

  server.registerTool(
    'analyze_async_patterns',
    {
      description:
        'Detect async performance issues including await in loops, sequential awaits, and blocking operations.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath, minSeverity }) =>
      runAnalysisTool(logger, 'analyze_async_patterns', projectPath, (path) =>
        analyzeAsyncPatterns(path, { minSeverity }),
      ),
  );

  server.registerTool(
    'analyze_connection_pooling',
    {
      description:
        'Detect database client or pool creation inside request handlers, loops, or other hot paths.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath, minSeverity }) =>
      runAnalysisTool(logger, 'analyze_connection_pooling', projectPath, (path) =>
        analyzeConnectionPooling(path, { minSeverity }),
      ),
  );

  server.registerTool(
    'analyze_dependencies',
    {
      description:
        'Analyze package.json and lockfile for dependency hygiene issues including unused and misclassified packages.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath, minSeverity }) =>
      runAnalysisTool(logger, 'analyze_dependencies', projectPath, (path) =>
        analyzeDependencies(path, { minSeverity }),
      ),
  );

  server.registerTool(
    'investigate_performance',
    {
      description:
        'Run all analyzers and return enriched findings with code-path context, related issues, clusters, hotspots, and what to inspect next. Deterministic; does not call an LLM.',
      inputSchema: projectPathSchema.shape,
    },
    async ({ projectPath, minSeverity }) =>
      runAnalysisTool(logger, 'investigate_performance', projectPath, (path) =>
        investigatePerformance(path, undefined, { minSeverity }),
      ),
  );

  server.registerTool(
    'explain_performance',
    {
      description:
        'Retrieve rule cards and findings for a question, then answer from those passages. Calls an OpenAI-compatible LLM only when PERFORMANCE_MCP_LLM_BASE_URL and PERFORMANCE_MCP_LLM_API_KEY are set; otherwise returns a retrieved-only answer.',
      inputSchema: projectPathSchema
        .extend({
          question: z
            .string()
            .optional()
            .describe('Question to ground with retrieved findings and rule cards'),
        })
        .shape,
    },
    async ({ projectPath, minSeverity, question }) =>
      runAnalysisTool(logger, 'explain_performance', projectPath, (path) =>
        explainPerformance(path, { minSeverity, question, useEnv: true }),
      ),
  );

  server.registerTool(
    'export_report',
    {
      description: 'Return the analysis as JSON or SARIF 2.1.0. Does not write a file.',
      inputSchema: projectPathSchema
        .extend({
          format: z.enum(['json', 'sarif']).optional().describe('Report format. Defaults to json.'),
        })
        .shape,
    },
    async ({ projectPath, minSeverity, format }) =>
      runAnalysisTool(logger, 'export_report', projectPath, (path) =>
        exportReport(path, { minSeverity, format }),
      ),
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  getLogger('server').info('MCP server started on stdio');
}
