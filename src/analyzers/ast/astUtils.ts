import ts from 'typescript';
import type { SourceFileInfo } from '../../types/index.js';

export interface ParsedSourceFile {
  info: SourceFileInfo;
  sourceFile: ts.SourceFile;
}

export function parseSourceFile(info: SourceFileInfo): ParsedSourceFile {
  const kind = info.relativePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : info.relativePath.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : info.relativePath.endsWith('.js') || info.relativePath.endsWith('.mjs')
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(
    info.relativePath,
    info.content,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );

  return { info, sourceFile };
}

export function parseAllSourceFiles(files: SourceFileInfo[]): ParsedSourceFile[] {
  return files.map(parseSourceFile);
}

export function getLineAndColumn(
  sourceFile: ts.SourceFile,
  position: number,
): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: line + 1, column: character + 1 };
}

export function getSnippet(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  contextLines = 0,
): string {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(start);
  const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(end);

  const lines = sourceFile.text.split('\n');
  const from = Math.max(0, startLine - contextLines);
  const to = Math.min(lines.length - 1, endLine + contextLines);
  return lines.slice(from, to + 1).join('\n').trim();
}

export function visitNodes(
  node: ts.Node,
  visitor: (node: ts.Node) => void,
): void {
  const visit = (current: ts.Node): void => {
    visitor(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
}

export function isInsideLoop(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isForStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isWhileStatement(current) ||
      ts.isDoStatement(current)
    ) {
      return true;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (
        ts.isCallExpression(parent) &&
        ts.isPropertyAccessExpression(parent.expression) &&
        ['map', 'forEach', 'filter', 'reduce', 'flatMap'].includes(parent.expression.name.text)
      ) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

export function isRequestHandler(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (ts.isCallExpression(parent)) {
        const calleeText = parent.expression.getText();
        if (
          /(get|post|put|patch|delete|use|route|handler|onRequest|onCall)/i.test(calleeText)
        ) {
          return true;
        }
      }
    }
    current = current.parent;
  }
  return false;
}

export function getCallExpressionName(node: ts.CallExpression): string | null {
  const expr = node.expression;
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text;
  }
  return null;
}

export function getFullCallExpressionName(node: ts.CallExpression): string {
  return node.expression.getText();
}

export function isAwaitExpression(node: ts.Node): node is ts.AwaitExpression {
  return ts.isAwaitExpression(node);
}

export function isDatabaseCall(callName: string, fullName: string): boolean {
  const patterns = [
    /\bfind\b/i,
    /\bfindOne\b/i,
    /\bfindMany\b/i,
    /\baggregate\b/i,
    /\bquery\b/i,
    /\bexecute\b/i,
    /\binsertOne\b/i,
    /\binsertMany\b/i,
    /\bupdateOne\b/i,
    /\bupdateMany\b/i,
    /\bdeleteOne\b/i,
    /\bdeleteMany\b/i,
    /\bcollection\s*\(/i,
    /\bdb\s*\./i,
  ];
  return patterns.some((pattern) => pattern.test(callName) || pattern.test(fullName));
}

export function isConnectionCreation(callName: string, fullName: string): boolean {
  const patterns = [
    /MongoClient/i,
    /\.connect\s*\(/i,
    /createPool/i,
    /new\s+Pool/i,
    /createConnection/i,
  ];
  return patterns.some((pattern) => pattern.test(callName) || pattern.test(fullName));
}

export function hasLimitOrPagination(node: ts.CallExpression): boolean {
  const text = node.getText();
  return /\b(limit|skip|take|offset|page|perPage|pagination)\b/i.test(text);
}

export function isPromiseAll(callName: string, fullName: string): boolean {
  return callName === 'all' && /Promise\.all/.test(fullName);
}
