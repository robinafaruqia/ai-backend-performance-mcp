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

export function analyzePostgresQueries(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) {
        return;
      }

      const callName = getCallExpressionName(node) ?? '';
      const fullName = getFullCallExpressionName(node);

      const isPgCall =
        isDatabaseCall(callName, fullName) ||
        /\b(pool|client)\.(query|execute)\b/i.test(fullName) ||
        /\$queryRaw\b/.test(fullName);

      if (!isPgCall) {
        return;
      }

      const { line, column } = getLineAndColumn(sourceFile, node.getStart());
      const snippet = getSnippet(sourceFile, node);

      if (isInsideLoop(node)) {
        findings.push(
          createFinding({
            category: 'database',
            severity: 'high',
            title: 'SQL query inside loop (potential N+1)',
            description:
              'A PostgreSQL-style query appears inside a loop, which may execute one query per iteration.',
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'potential',
              snippet,
              detail: 'Query detected within loop or iteration callback.',
            },
            recommendation:
              'Use JOINs, batch queries with ANY($1::int[]), or prefetch data before iterating.',
            confidence: 0.75,
            estimatedImpact: 'High database round-trips and degraded throughput.',
          }),
        );
      }

      if (!hasLimitOrPagination(node) && /\bquery\s*\(/.test(fullName)) {
        findings.push(
          createFinding({
            category: 'database',
            severity: 'medium',
            title: 'Potentially unbounded SQL query',
            description:
              'A query call was detected without an obvious LIMIT or pagination clause in the call text.',
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'potential',
              snippet,
              detail: 'No LIMIT/OFFSET/pagination detected in call arguments.',
            },
            recommendation: 'Add LIMIT/OFFSET or keyset pagination to bound result sets.',
            confidence: 0.55,
            estimatedImpact: 'Large result sets may increase memory usage and response time.',
          }),
        );
      }
    });
  }

  return findings;
}
