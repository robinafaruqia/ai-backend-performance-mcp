import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Finding } from '../../types/index.js';
import {
  enclosingLoop,
  getNodeLocation,
  getSnippet,
  getSqlText,
  isBatchedQuery,
  isInsideNestedFunction,
  isPostgresQueryCall,
  queryUsesLoopBinding,
  sqlLooksUnbounded,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

export function analyzePostgresQueries(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !isPostgresQueryCall(node)) {
        return;
      }

      const loop = enclosingLoop(node);
      if (loop && !isInsideNestedFunction(node, loop) && !isBatchedQuery(node)) {
        const usesBinding = queryUsesLoopBinding(node, loop);
        const location = getNodeLocation(sourceFile, node);
        findings.push(
          createFinding({
            ruleId: 'db.pg.n-plus-one',
            category: 'database',
            severity: 'high',
            title: 'SQL query inside loop (potential N+1)',
            description:
              'A PostgreSQL-style query runs inside a loop. When SQL is parameterized with the loop item, this is a common N+1 pattern.',
            file: info.relativePath,
            line: location.line,
            column: location.column,
            evidence: {
              kind: 'potential',
              snippet: getSnippet(sourceFile, node),
              detail: usesBinding
                ? 'Query arguments reference the loop binding.'
                : 'Query sits in a loop body without a clear loop-variable data flow.',
            },
            recommendation:
              'Prefer a JOIN, WHERE id = ANY($1), or prefetching. Do not flatten retry or pagination loops into Promise.all.',
            confidence: usesBinding ? Confidence.potentialStrong : Confidence.potentialModerate,
            confidenceRationale: usesBinding
              ? 'Loop binding appears in the query (potential-strong).'
              : 'In-loop SQL without proven per-item correlation (potential-moderate).',
            estimatedImpact: 'Round-trips scale with iteration count.',
          }),
        );
      }

      const sql = getSqlText(node);
      if (sql && sqlLooksUnbounded(sql)) {
        const location = getNodeLocation(sourceFile, node);
        findings.push(
          createFinding({
            ruleId: 'db.pg.unbounded-select',
            category: 'database',
            severity: 'medium',
            title: 'Potentially unbounded SQL SELECT',
            description:
              'A SELECT string in source has no LIMIT/OFFSET/FETCH clause. Helpers or views may still bound results at runtime.',
            file: info.relativePath,
            line: location.line,
            column: location.column,
            evidence: {
              kind: 'potential',
              snippet: getSnippet(sourceFile, node),
              detail: 'Static SQL text lacks LIMIT/OFFSET/FETCH.',
            },
            recommendation:
              'Add LIMIT/OFFSET or keyset pagination when the table can grow. Ignore for singleton lookups.',
            confidence: Confidence.potentialWeak,
            confidenceRationale:
              'SQL text heuristic only; bound views and dynamic SQL are not resolved (potential-weak).',
            estimatedImpact: 'Unbounded result sets can increase memory and latency.',
          }),
        );
      }
    });
  }

  return findings;
}
