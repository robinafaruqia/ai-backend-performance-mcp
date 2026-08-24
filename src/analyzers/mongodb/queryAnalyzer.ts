import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import type { Finding } from '../../types/index.js';
import {
  getCallExpressionName,
  getFullCallExpressionName,
  getLineAndColumn,
  getSnippet,
  hasLimitOrPagination,
  isDatabaseCall,
  isInsideLoop,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

export function analyzeMongoQueries(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) {
        return;
      }

      const callName = getCallExpressionName(node) ?? '';
      const fullName = getFullCallExpressionName(node);

      if (!isDatabaseCall(callName, fullName)) {
        return;
      }

      const { line, column } = getLineAndColumn(sourceFile, node.getStart());
      const snippet = getSnippet(sourceFile, node);

      if (isInsideLoop(node)) {
        findings.push(
          createFinding({
            category: 'database',
            severity: 'high',
            title: 'Database query inside loop (potential N+1)',
            description:
              'A MongoDB-style query appears inside a loop or array iteration, which may cause N+1 query behavior.',
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'potential',
              snippet,
              detail: 'Query detected within loop or iteration callback.',
            },
            recommendation:
              'Batch queries with $in filters, use aggregation pipelines, or prefetch related data before the loop.',
            confidence: 0.75,
            estimatedImpact: 'High latency and database load under concurrent traffic.',
          }),
        );
      }

      if (!hasLimitOrPagination(node) && /\bfind\s*\(/.test(fullName)) {
        findings.push(
          createFinding({
            category: 'database',
            severity: 'medium',
            title: 'Potentially unbounded find query',
            description:
              'A find-style query was detected without an obvious limit, skip, or pagination parameter.',
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'potential',
              snippet,
              detail: 'No limit/skip/pagination detected in call arguments.',
            },
            recommendation:
              'Add .limit() and pagination, or use cursor-based pagination for large result sets.',
            confidence: 0.6,
            estimatedImpact: 'Memory pressure and slow responses for large collections.',
          }),
        );
      }
    });
  }

  return findings;
}
