import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Finding } from '../../types/index.js';
import {
  enclosingLoop,
  getMongoFilterFields,
  getNodeLocation,
  getSnippet,
  isBatchedQuery,
  isIdOnlyFilter,
  isInsideNestedFunction,
  isMongoFindCall,
  isMongoQueryCall,
  mongoCallHasPagination,
  queryUsesLoopBinding,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

export function analyzeMongoQueries(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !isMongoQueryCall(node)) {
        return;
      }

      const loop = enclosingLoop(node);
      if (loop && !isInsideNestedFunction(node, loop) && !isBatchedQuery(node)) {
        const usesBinding = queryUsesLoopBinding(node, loop);
        const location = getNodeLocation(sourceFile, node);
        findings.push(
          createFinding({
            ruleId: 'db.mongo.n-plus-one',
            category: 'database',
            severity: 'high',
            title: 'Database query inside loop (potential N+1)',
            description:
              'A MongoDB collection query runs inside a loop. When the filter uses the loop item, this is a common N+1 pattern.',
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
              'Load related documents with $in or an aggregation before iterating. Keep per-item queries only when each iteration must observe previous writes.',
            confidence: usesBinding ? Confidence.potentialStrong : Confidence.potentialModerate,
            confidenceRationale: usesBinding
              ? 'Loop binding flows into the query filter (potential-strong). Still potential: the loop may be intentionally sequential.'
              : 'In-loop query without proven per-item correlation (potential-moderate).',
            estimatedImpact: 'Round-trips grow linearly with list size under load.',
          }),
        );
      }

      if (!isMongoFindCall(node) || mongoCallHasPagination(node)) {
        return;
      }

      const filterFields = getMongoFilterFields(node);
      if (isIdOnlyFilter(filterFields)) {
        return;
      }

      const location = getNodeLocation(sourceFile, node);
      findings.push(
        createFinding({
          ruleId: 'db.mongo.unbounded-find',
          category: 'database',
          severity: 'medium',
          title: 'Potentially unbounded find query',
          description:
            'A MongoDB find() cursor is created without an in-source .limit() / skip() (or equivalent options). Collection size is unknown.',
          file: info.relativePath,
          line: location.line,
          column: location.column,
          evidence: {
            kind: 'potential',
            snippet: getSnippet(sourceFile, node),
            detail: 'No limit/skip/pagination detected on this find call or its chain.',
          },
          recommendation:
            'Add .limit() or cursor pagination when the result set can grow. Ignore if a helper already bounds the cursor.',
          confidence: Confidence.potentialModerate,
          confidenceRationale:
            'Call-chain heuristic only; wrapping helpers are not followed (potential-moderate).',
          estimatedImpact: 'Large collections can inflate memory and response time.',
        }),
      );
    });
  }

  return findings;
}
