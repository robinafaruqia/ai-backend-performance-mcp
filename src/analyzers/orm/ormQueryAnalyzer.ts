import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Analyzer, Finding, ProjectContext } from '../../types/index.js';
import {
  enclosingLoop,
  extractObjectKeys,
  getCallExpressionName,
  getNodeLocation,
  getSnippet,
  isArrayFindCall,
  isInsideNestedFunction,
  looksLikePrismaSource,
  looksLikeTypeormSource,
  parseAllSourceFiles,
  queryUsesLoopBinding,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

const PRISMA_READS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'findUniqueOrThrow',
  'findFirstOrThrow',
]);

const TYPEORM_READS = new Set(['find', 'findAndCount', 'findBy', 'findOne', 'findOneBy', 'getMany', 'getRawMany']);

function objectHasKey(node: ts.CallExpression, keys: string[]): boolean {
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    return false;
  }
  const present = new Set(extractObjectKeys(arg));
  return keys.some((key) => present.has(key));
}

function chainHasBound(node: ts.CallExpression): boolean {
  const names: string[] = [];
  let current: ts.Node = node;
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    names.push(current.expression.name.text);
    const inner = current.expression.expression;
    if (!ts.isCallExpression(inner)) {
      break;
    }
    current = inner;
  }
  return names.some((name) => name === 'take' || name === 'limit' || name === 'offset');
}

function pushLoopFinding(
  findings: Finding[],
  sourceFile: ts.SourceFile,
  file: string,
  node: ts.CallExpression,
  ruleId: 'orm.prisma.n-plus-one' | 'orm.typeorm.n-plus-one',
  title: string,
): void {
  const loop = enclosingLoop(node);
  if (!loop || isInsideNestedFunction(node, loop)) {
    return;
  }
  const usesBinding = queryUsesLoopBinding(node, loop);
  const location = getNodeLocation(sourceFile, node);
  findings.push(
    createFinding({
      ruleId,
      category: 'database',
      severity: 'high',
      title,
      description: 'An ORM read runs inside a loop. When the loop item is in the query, this is an N+1 pattern.',
      file,
      line: location.line,
      column: location.column,
      evidence: {
        kind: 'potential',
        snippet: getSnippet(sourceFile, node),
        detail: usesBinding
          ? 'Query arguments reference the loop binding.'
          : 'Query sits in a loop without a proven per-item correlation.',
      },
      recommendation: 'Load the related rows in one query, then index them in memory.',
      confidence: usesBinding ? Confidence.potentialStrong : Confidence.potentialModerate,
      confidenceRationale: usesBinding
        ? 'Loop binding flows into the ORM call (potential-strong).'
        : 'In-loop ORM call without proven correlation (potential-moderate).',
      estimatedImpact: 'SQL round-trips grow with the list size.',
    }),
  );
}

function analyzeOrm(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    const prisma = looksLikePrismaSource(info.content);
    const typeorm = looksLikeTypeormSource(info.content);
    if (!prisma && !typeorm) {
      continue;
    }

    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || isArrayFindCall(node)) {
        return;
      }
      const method = getCallExpressionName(node);
      if (!method) {
        return;
      }

      if (prisma && PRISMA_READS.has(method)) {
        pushLoopFinding(
          findings,
          sourceFile,
          info.relativePath,
          node,
          'orm.prisma.n-plus-one',
          'Prisma query inside a loop (potential N+1)',
        );
        if (method === 'findMany' && !objectHasKey(node, ['take', 'cursor'])) {
          const location = getNodeLocation(sourceFile, node);
          findings.push(
            createFinding({
              ruleId: 'orm.prisma.unbounded-find',
              category: 'database',
              severity: 'medium',
              title: 'Prisma findMany without take',
              description:
                'findMany has no take or cursor in the object argument. A variable argument may still set take at runtime.',
              file: info.relativePath,
              line: location.line,
              column: location.column,
              evidence: {
                kind: 'potential',
                snippet: getSnippet(sourceFile, node),
                detail: 'No take/cursor property on the call argument.',
              },
              recommendation: 'Pass take (and a cursor or skip) when the table can grow.',
              confidence: node.arguments[0] && !ts.isObjectLiteralExpression(node.arguments[0])
                ? Confidence.potentialWeak
                : Confidence.potentialModerate,
              confidenceRationale:
                'take is absent from a static argument (potential). Dynamic args are a weaker signal.',
              estimatedImpact: 'Large tables can exhaust memory in the API process.',
            }),
          );
        }
      }

      if (typeorm && TYPEORM_READS.has(method)) {
        pushLoopFinding(
          findings,
          sourceFile,
          info.relativePath,
          node,
          'orm.typeorm.n-plus-one',
          'TypeORM query inside a loop (potential N+1)',
        );
        const bounded = objectHasKey(node, ['take', 'skip']) || chainHasBound(node);
        const isList = method === 'find' || method === 'findAndCount' || method === 'findBy' || method === 'getMany' || method === 'getRawMany';
        if (isList && !bounded) {
          const location = getNodeLocation(sourceFile, node);
          findings.push(
            createFinding({
              ruleId: 'orm.typeorm.unbounded-find',
              category: 'database',
              severity: 'medium',
              title: 'TypeORM read without take or limit',
              description: 'A TypeORM list query has no take, skip, or limit in source.',
              file: info.relativePath,
              line: location.line,
              column: location.column,
              evidence: {
                kind: 'potential',
                snippet: getSnippet(sourceFile, node),
                detail: 'No take/limit/skip on the call or its chain.',
              },
              recommendation: 'Add take on find options or limit on the query builder.',
              confidence: Confidence.potentialModerate,
              confidenceRationale: 'No bound is visible on this call chain (potential-moderate).',
              estimatedImpact: 'Unbounded reads transfer more rows than the handler needs.',
            }),
          );
        }
      }
    });
  }

  return findings;
}

export class OrmQueryAnalyzer implements Analyzer {
  readonly name = 'orm-query-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const parsed = parseAllSourceFiles(context.sourceFiles);
    return analyzeOrm(parsed);
  }
}

export const ormQueryAnalyzer = new OrmQueryAnalyzer();
