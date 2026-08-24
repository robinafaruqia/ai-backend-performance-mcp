import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import type { Analyzer, Finding, ProjectContext } from '../../types/index.js';
import {
  getLineAndColumn,
  getSnippet,
  isPromiseAll,
  parseAllSourceFiles,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

function analyzeAwaitInLoops(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isForStatement(node) && !ts.isForOfStatement(node) && !ts.isForInStatement(node)) {
        return;
      }

      let hasAwaitInBody = false;
      let awaitNode: ts.Node | undefined;

      const checkBody = (body: ts.Node): void => {
        visitNodes(body, (child) => {
          if (ts.isAwaitExpression(child)) {
            hasAwaitInBody = true;
            awaitNode = child;
          }
        });
      };

      if (node.statement) {
        checkBody(node.statement);
      }

      if (hasAwaitInBody && awaitNode) {
        const { line, column } = getLineAndColumn(sourceFile, awaitNode.getStart());
        findings.push(
          createFinding({
            category: 'async',
            severity: 'high',
            title: 'await inside loop',
            description:
              'An await expression appears inside a loop, causing sequential asynchronous work.',
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'confirmed',
              snippet: getSnippet(sourceFile, node),
              detail: 'Await detected in loop body.',
            },
            recommendation:
              'Collect promises and use Promise.all(), or refactor to process items concurrently with bounded concurrency.',
            confidence: 0.9,
            estimatedImpact: 'Linear slowdown proportional to iteration count.',
          }),
        );
      }
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

      const awaitExpressions: ts.AwaitExpression[] = [];
      for (const statement of node.statements) {
        if (ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression)) {
          awaitExpressions.push(statement.expression);
        }
        if (ts.isVariableStatement(statement)) {
          for (const decl of statement.declarationList.declarations) {
            if (decl.initializer && ts.isAwaitExpression(decl.initializer)) {
              awaitExpressions.push(decl.initializer);
            }
          }
        }
      }

      if (awaitExpressions.length < 2) {
        return;
      }

      const independent = awaitExpressions.every((expr) => {
        const text = expr.expression.getText();
        return !/\bawait\b/.test(text);
      });

      if (!independent) {
        return;
      }

      const first = awaitExpressions[0];
      if (!first) {
        return;
      }

      const { line, column } = getLineAndColumn(sourceFile, first.getStart());
      findings.push(
        createFinding({
          category: 'async',
          severity: 'medium',
          title: 'Sequential independent awaits',
          description:
            'Multiple top-level await expressions in the same block may run sequentially when they appear independent.',
          file: info.relativePath,
          line,
          column,
          evidence: {
            kind: 'potential',
            snippet: getSnippet(sourceFile, node),
            detail: `${awaitExpressions.length} sequential await statements detected.`,
          },
          recommendation: 'Use Promise.all([...]) to run independent async operations concurrently.',
          confidence: 0.7,
          estimatedImpact: 'Added latency from unnecessary serialization of I/O.',
        }),
      );
    });
  }

  return findings;
}

function analyzeBlockingOps(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];
  const blockingPatterns = [
    { pattern: /readFileSync|writeFileSync|appendFileSync/, label: 'synchronous filesystem operation' },
    { pattern: /execSync|spawnSync/, label: 'synchronous child process execution' },
    { pattern: /JSON\.parse\s*\(|JSON\.stringify\s*\(/, label: 'potentially large synchronous JSON operation' },
  ];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) {
        return;
      }

      const fullName = node.expression.getText();
      for (const { pattern, label } of blockingPatterns) {
        if (!pattern.test(fullName)) {
          continue;
        }

        const { line, column } = getLineAndColumn(sourceFile, node.getStart());
        findings.push(
          createFinding({
            category: 'async',
            severity: 'medium',
            title: 'Blocking operation in async code path',
            description: `Detected ${label}, which blocks the event loop.`,
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'confirmed',
              snippet: getSnippet(sourceFile, node),
            },
            recommendation: 'Prefer async alternatives (fs.promises, child_process.spawn) in request paths.',
            confidence: fullName.includes('Sync') ? 0.95 : 0.6,
            estimatedImpact: 'Event loop blocking reduces throughput under load.',
          }),
        );
      }
    });
  }

  return findings;
}

function analyzePromiseAllOpportunities(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) {
        return;
      }

      const callName = node.expression.getText();
      if (!isPromiseAll('', callName)) {
        return;
      }

      const { line, column } = getLineAndColumn(sourceFile, node.getStart());
      findings.push(
        createFinding({
          category: 'async',
          severity: 'info',
          title: 'Promise.all usage detected',
          description: 'Concurrent async execution via Promise.all is present.',
          file: info.relativePath,
          line,
          column,
          evidence: {
            kind: 'confirmed',
            snippet: getSnippet(sourceFile, node),
          },
          recommendation: 'Ensure error handling and consider bounded concurrency for large arrays.',
          confidence: 1,
          estimatedImpact: 'Positive pattern for parallel I/O when used appropriately.',
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
      ...analyzePromiseAllOpportunities(parsed),
    ];
  }
}

export const asyncPatternAnalyzer = new AsyncPatternAnalyzer();
