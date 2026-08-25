import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Analyzer, Finding, ProjectContext } from '../../types/index.js';
import {
  boundNamesFromAwaitStatement,
  collectReferencedIdentifiers,
  enclosingLoop,
  getNodeLocation,
  getSnippet,
  isBlockingSyncCall,
  isInsideNestedFunction,
  isRequestHandler,
  loopIsSequentialByConstruction,
  parseAllSourceFiles,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

function analyzeAwaitInLoops(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isAwaitExpression(node)) {
        return;
      }
      const loop = enclosingLoop(node);
      if (!loop || isInsideNestedFunction(node, loop)) {
        return;
      }
      if (loopIsSequentialByConstruction(loop)) {
        return;
      }

      const location = getNodeLocation(sourceFile, node);
      findings.push(
        createFinding({
          ruleId: 'async.await-in-loop',
          category: 'async',
          severity: 'high',
          title: 'await inside loop',
          description:
            'An await expression runs in a for/for-of/forEach/map body, so iterations wait on each other. This is a performance smell only when iterations are independent.',
          file: info.relativePath,
          line: location.line,
          column: location.column,
          evidence: {
            kind: 'confirmed',
            snippet: getSnippet(sourceFile, loop),
            detail: 'Await is executed by the loop body, not merely declared in a nested function.',
          },
          recommendation:
            'If items are independent, collect work and use Promise.all with bounded concurrency. If each iteration needs the previous result (pagination, retries, accumulators), keep the sequential await.',
          confidence: Confidence.confirmedStrong,
          confidenceRationale:
            'The await is syntactically in an iteration construct (confirmed-strong). Independence of items is not proven, so Promise.all is a suggestion, not a requirement.',
          estimatedImpact: 'Independent iterations serialize I/O and scale linearly with list size.',
        }),
      );
    });
  }

  return findings;
}

function analyzeSequentialAwaits(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isBlock(node)) {
        return;
      }

      const awaits: Array<{ awaitExpr: ts.AwaitExpression; boundNames: string[] }> = [];
      for (const statement of node.statements) {
        const parsed = boundNamesFromAwaitStatement(statement);
        if (parsed) {
          awaits.push(parsed);
        }
      }

      if (awaits.length < 2) {
        return;
      }

      const previousBounds = new Set<string>();
      let allIndependent = true;
      for (const item of awaits) {
        const used = collectReferencedIdentifiers(item.awaitExpr.expression);
        if (previousBounds.size > 0) {
          for (const name of used) {
            if (previousBounds.has(name)) {
              allIndependent = false;
              break;
            }
          }
        }
        for (const bound of item.boundNames) {
          previousBounds.add(bound);
        }
      }

      if (!allIndependent) {
        return;
      }

      const first = awaits[0];
      if (!first) {
        return;
      }
      const location = getNodeLocation(sourceFile, first.awaitExpr);
      findings.push(
        createFinding({
          ruleId: 'async.sequential-independent-awaits',
          category: 'async',
          severity: 'medium',
          title: 'Sequential independent awaits',
          description:
            'Adjacent top-level awaits in this block do not reference bindings from earlier awaits in the same block, so they may be independent.',
          file: info.relativePath,
          line: location.line,
          column: location.column,
          evidence: {
            kind: 'potential',
            snippet: getSnippet(sourceFile, node),
            detail: `${awaits.length} sequential await statements with no in-block data dependence.`,
          },
          recommendation:
            'If the operations are truly independent, run them with Promise.all. If they share hidden ordering (locks, rate limits, mutations), leave them sequential.',
          confidence: Confidence.potentialStrong,
          confidenceRationale:
            'No identifier from a prior await in this block is referenced (potential-strong). Side effects and cross-function state are not modeled.',
          estimatedImpact: 'Independent I/O that is serialized adds avoidable latency.',
        }),
      );
    });
  }

  return findings;
}

function analyzeBlockingOps(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) {
        return;
      }
      const blocking = isBlockingSyncCall(node);
      if (!blocking) {
        return;
      }
      if (!isRequestHandler(node) && !enclosingLoop(node)) {
        return;
      }

      const location = getNodeLocation(sourceFile, node);
      findings.push(
        createFinding({
          ruleId: 'async.blocking-sync-in-handler',
          category: 'async',
          severity: 'medium',
          title: 'Blocking sync I/O in request path',
          description: `Detected ${blocking.label} inside a request handler or loop. Module-level startup reads are not flagged.`,
          file: info.relativePath,
          line: location.line,
          column: location.column,
          evidence: {
            kind: 'confirmed',
            snippet: getSnippet(sourceFile, node),
          },
          recommendation: 'Use fs.promises or child_process.spawn on request paths.',
          confidence: Confidence.confirmedSyntactic,
          confidenceRationale:
            'Sync fs/child_process APIs in a handler or loop are unambiguous (confirmed-syntactic).',
          estimatedImpact: 'Event-loop blocking reduces throughput under concurrent load.',
        }),
      );
    });
  }

  return findings;
}

export class AsyncPatternAnalyzer implements Analyzer {
  readonly name = 'async-pattern-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const parsed = parseAllSourceFiles(context.sourceFiles);
    return [
      ...analyzeAwaitInLoops(parsed),
      ...analyzeSequentialAwaits(parsed),
      ...analyzeBlockingOps(parsed),
    ];
  }
}

export const asyncPatternAnalyzer = new AsyncPatternAnalyzer();
