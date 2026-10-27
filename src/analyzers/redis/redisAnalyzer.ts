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
  isInsideNestedFunction,
  isRequestHandler,
  isStartupContext,
  looksLikeRedisSource,
  parseAllSourceFiles,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

const LOOP_COMMANDS = new Set(['get', 'set', 'hget', 'hset', 'del', 'incr', 'mget']);
const TTL_FLAGS = new Set(['EX', 'PX', 'EXAT', 'PXAT', 'KEEPTTL', 'expiration']);

function receiverText(node: ts.CallExpression | ts.NewExpression): string {
  return node.expression.getText();
}

function hasRedisReceiver(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const receiver = node.expression.expression.getText();
  if (receiver === 'Object') {
    return false;
  }
  return /redis|cache|client/i.test(receiver);
}

function isRedisKeysCall(node: ts.CallExpression): boolean {
  return hasRedisReceiver(node) && getCallExpressionName(node) === 'keys';
}

function isRedisClientConstruction(node: ts.Node): node is ts.CallExpression | ts.NewExpression {
  if (ts.isNewExpression(node)) {
    return /Redis$/.test(node.expression.getText());
  }
  if (!ts.isCallExpression(node)) {
    return false;
  }
  return /createClient$/.test(receiverText(node));
}

function setCallHasTtl(node: ts.CallExpression, method: string): boolean {
  if (method === 'setex' || method === 'psetex' || method === 'setEx') {
    return true;
  }
  for (const arg of node.arguments) {
    if (ts.isStringLiteral(arg) && TTL_FLAGS.has(arg.text)) {
      return true;
    }
    if (ts.isObjectLiteralExpression(arg)) {
      if (extractObjectKeys(arg).some((key) => TTL_FLAGS.has(key))) {
        return true;
      }
    }
  }
  return false;
}

function analyzeRedis(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (ts.isCallExpression(node) && isRedisKeysCall(node)) {
        const location = getNodeLocation(sourceFile, node);
        findings.push(
          createFinding({
            ruleId: 'redis.keys-command',
            category: 'redis',
            severity: 'high',
            title: 'Redis KEYS command',
            description:
              'KEYS walks the entire keyspace and blocks Redis until it finishes. SCAN is the non-blocking alternative.',
            file: info.relativePath,
            line: location.line,
            column: location.column,
            evidence: {
              kind: 'confirmed',
              snippet: getSnippet(sourceFile, node),
              detail: 'Call name is keys on a Redis-like receiver.',
            },
            recommendation: 'Use SCAN with a cursor, or maintain an index of keys you need.',
            confidence: Confidence.confirmedStrong,
            confidenceRationale: 'The KEYS command is visible on the client (confirmed-strong).',
            estimatedImpact: 'Latency spikes for every other client sharing the Redis server.',
          }),
        );
      }

      if (ts.isCallExpression(node) && hasRedisReceiver(node)) {
        const method = getCallExpressionName(node);
        if (method === 'set' || method === 'hset' || method === 'setnx') {
          const inHotPath = !isStartupContext(node);
          if (inHotPath && !setCallHasTtl(node, method)) {
            const location = getNodeLocation(sourceFile, node);
            findings.push(
              createFinding({
                ruleId: 'redis.set-without-ttl',
                category: 'redis',
                severity: 'medium',
                title: 'Redis SET without an expiry',
                description:
                  'A cache write has no EX, PX, EXAT, PXAT, or KEEPTTL argument. A later EXPIRE call is not paired by this rule.',
                file: info.relativePath,
                line: location.line,
                column: location.column,
                evidence: {
                  kind: 'potential',
                  snippet: getSnippet(sourceFile, node),
                  detail: 'No TTL flag in this call.',
                },
                recommendation: 'Pass an expiry when the value is a cache entry. Ignore durable keys that are meant to persist.',
                confidence: Confidence.potentialModerate,
                confidenceRationale:
                  'The call itself has no TTL (potential-moderate). A separate EXPIRE may still exist.',
                estimatedImpact: 'Unbounded keys increase Redis memory.',
              }),
            );
          }
        }

        if (method && LOOP_COMMANDS.has(method)) {
          const loop = enclosingLoop(node);
          if (loop && !isInsideNestedFunction(node, loop)) {
            const location = getNodeLocation(sourceFile, node);
            findings.push(
              createFinding({
                ruleId: 'redis.command-in-loop',
                category: 'redis',
                severity: 'high',
                title: 'Redis command inside a loop',
                description: 'A Redis read or write runs once per loop iteration.',
                file: info.relativePath,
                line: location.line,
                column: location.column,
                evidence: {
                  kind: 'potential',
                  snippet: getSnippet(sourceFile, node),
                  detail: `Command ${method} is inside an iteration construct.`,
                },
                recommendation: 'Pipeline the commands or use MGET/MSET when the keys are independent.',
                confidence: Confidence.potentialStrong,
                confidenceRationale: 'The command is syntactically inside the loop (potential-strong).',
                estimatedImpact: 'Round-trips grow with the number of iterations.',
              }),
            );
          }
        }
      }

      if (isRedisClientConstruction(node) && !isStartupContext(node) && isRequestHandler(node)) {
        const location = getNodeLocation(sourceFile, node);
        findings.push(
          createFinding({
            ruleId: 'redis.client-in-handler',
            category: 'redis',
            severity: 'critical',
            title: 'Redis client created in a request handler',
            description: 'A Redis client is constructed inside an HTTP route instead of at process startup.',
            file: info.relativePath,
            line: location.line,
            column: location.column,
            evidence: {
              kind: 'confirmed',
              snippet: getSnippet(sourceFile, node),
              detail: 'Construction is nested under a route registration.',
            },
            recommendation: 'Create one shared client during startup and reuse it.',
            confidence: Confidence.confirmedSyntactic,
            confidenceRationale: 'new Redis or createClient sits inside a route callback (confirmed-syntactic).',
            estimatedImpact: 'Connection storms against Redis under traffic.',
          }),
        );
      }
    });
  }

  return findings;
}

export class RedisAnalyzer implements Analyzer {
  readonly name = 'redis-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const parsed = parseAllSourceFiles(context.sourceFiles).filter((file) =>
      looksLikeRedisSource(file.info.content),
    );
    return analyzeRedis(parsed);
  }
}

export const redisAnalyzer = new RedisAnalyzer();
