import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import type { Analyzer, Finding, ProjectContext } from '../../types/index.js';
import {
  getCallExpressionName,
  getFullCallExpressionName,
  getLineAndColumn,
  getSnippet,
  isConnectionCreation,
  isInsideLoop,
  isRequestHandler,
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

      let callName = '';
      let fullName = '';

      if (ts.isCallExpression(node)) {
        callName = getCallExpressionName(node) ?? '';
        fullName = getFullCallExpressionName(node);
      } else if (ts.isNewExpression(node)) {
        fullName = node.expression.getText();
        callName = fullName.split('.').pop() ?? fullName;
      }

      if (!isConnectionCreation(callName, fullName)) {
        return;
      }

      const { line, column } = getLineAndColumn(sourceFile, node.getStart());
      const snippet = getSnippet(sourceFile, node);

      if (isRequestHandler(node)) {
        findings.push(
          createFinding({
            category: 'pooling',
            severity: 'critical',
            title: 'Connection or client created in request handler',
            description:
              'Database client or pool creation appears inside a request handler, which can exhaust connections.',
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'confirmed',
              snippet,
              detail: 'Connection creation nested under route/handler registration.',
            },
            recommendation:
              'Create a shared client/pool at module scope or application startup and reuse it across requests.',
            confidence: 0.9,
            estimatedImpact: 'Connection storms, memory leaks, and database saturation.',
          }),
        );
      }

      if (isInsideLoop(node)) {
        findings.push(
          createFinding({
            category: 'pooling',
            severity: 'high',
            title: 'Connection or client created inside loop',
            description:
              'Database client or pool creation appears inside a loop, causing repeated initialization.',
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'confirmed',
              snippet,
              detail: 'Connection creation nested inside loop or iteration.',
            },
            recommendation: 'Initialize the client once outside the loop and reuse it.',
            confidence: 0.85,
            estimatedImpact: 'Repeated connection setup adds latency and resource churn.',
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
