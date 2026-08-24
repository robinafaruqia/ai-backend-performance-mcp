import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Analyzer, Finding, ProjectContext } from '../../types/index.js';
import {
  enclosingLoop,
  getNodeLocation,
  getSnippet,
  isConnectionConstruction,
  isRequestHandler,
  isStartupContext,
  parseAllSourceFiles,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

function analyzeConnectionPooling(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) {
        return;
      }
      if (!isConnectionConstruction(node)) {
        return;
      }
      if (isStartupContext(node)) {
        return;
      }

      const location = getNodeLocation(sourceFile, node);
      const snippet = getSnippet(sourceFile, node);

      if (isRequestHandler(node)) {
        findings.push(
          createFinding({
            ruleId: 'pooling.client-in-handler',
            category: 'pooling',
            severity: 'critical',
            title: 'Connection or client created in request handler',
            description:
              'A MongoClient, Pool, or equivalent is constructed inside an HTTP route handler rather than at process startup.',
            file: info.relativePath,
            line: location.line,
            column: location.column,
            evidence: {
              kind: 'confirmed',
              snippet,
              detail: 'Construction is nested under app/router route registration.',
            },
            recommendation:
              'Create one shared client/pool at module scope or in main()/bootstrap and reuse it across requests.',
            confidence: Confidence.confirmedSyntactic,
            confidenceRationale:
              'new MongoClient / MongoClient.connect / new Pool / createPool inside a route callback (confirmed-syntactic).',
            estimatedImpact: 'Per-request connect storms, FD leaks, and database saturation.',
          }),
        );
      }

      const loop = enclosingLoop(node);
      if (loop) {
        findings.push(
          createFinding({
            ruleId: 'pooling.client-in-loop',
            category: 'pooling',
            severity: 'high',
            title: 'Connection or client created inside loop',
            description: 'A database client or pool is constructed inside a loop.',
            file: info.relativePath,
            line: location.line,
            column: location.column,
            evidence: {
              kind: 'confirmed',
              snippet,
              detail: 'Construction nested inside an iteration construct.',
            },
            recommendation: 'Create the client once outside the loop and reuse it.',
            confidence: Confidence.confirmedStrong,
            confidenceRationale: 'Construction is nested in a loop (confirmed-strong).',
            estimatedImpact: 'Repeated handshake cost and connection churn.',
          }),
        );
      }
    });
  }

  return findings;
}

export class ConnectionPoolAnalyzer implements Analyzer {
  readonly name = 'connection-pool-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const parsed = parseAllSourceFiles(context.sourceFiles);
    return analyzeConnectionPooling(parsed);
  }
}

export const connectionPoolAnalyzer = new ConnectionPoolAnalyzer();
