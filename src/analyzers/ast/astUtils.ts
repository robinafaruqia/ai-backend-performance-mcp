import ts from 'typescript';
import type { SourceFileInfo } from '../../types/index.js';

export interface ParsedSourceFile {
  info: SourceFileInfo;
  sourceFile: ts.SourceFile;
}

const parseCache = new WeakMap<SourceFileInfo[], ParsedSourceFile[]>();

const MONGO_QUERY_METHODS = new Set([
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'aggregate',
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'countDocuments',
  'distinct',
  'replaceOne',
  'bulkWrite',
]);

const MONGO_CURSOR_BOUNDING = new Set(['limit', 'skip', 'maxTimeMS']);
const ITERATION_CALLBACKS = new Set(['map', 'forEach', 'flatMap']);
const HTTP_ROUTE_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'all',
  'use',
  'route',
  'head',
  'options',
]);
const STARTUP_FUNCTION_NAMES = new Set([
  'main',
  'start',
  'boot',
  'bootstrap',
  'init',
  'initialize',
  'listen',
  'run',
  'createApp',
  'createServer',
  'connectDatabase',
  'connectDb',
  'connectDB',
  'startServer',
]);

export function parseSourceFile(info: SourceFileInfo): ParsedSourceFile {
  const kind = info.relativePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : info.relativePath.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : info.relativePath.endsWith('.js') ||
          info.relativePath.endsWith('.mjs') ||
          info.relativePath.endsWith('.cjs')
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
  const cached = parseCache.get(files);
  if (cached) {
    return cached;
  }
  const parsed = files.map(parseSourceFile);
  parseCache.set(files, parsed);
  return parsed;
}

export function getNodeLocation(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

export function getSnippet(sourceFile: ts.SourceFile, node: ts.Node, contextLines = 0): string {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(start);
  const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(end);
  const lines = sourceFile.text.split('\n');
  const from = Math.max(0, startLine - contextLines);
  const to = Math.min(lines.length - 1, endLine + contextLines);
  return lines.slice(from, to + 1).join('\n').trim();
}

export function visitNodes(node: ts.Node, visitor: (node: ts.Node) => void): void {
  const visit = (current: ts.Node): void => {
    visitor(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
}

export function getCallExpressionName(node: ts.CallExpression): string | null {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text;
  }
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text;
  }
  return null;
}

export function getFullCallExpressionName(node: ts.CallExpression | ts.NewExpression): string {
  return node.expression.getText();
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

export function isInsideNestedFunction(node: ts.Node, stopAt: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current && current !== stopAt) {
    if (isFunctionLike(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function isArrayFindCall(node: ts.CallExpression): boolean {
  if (getCallExpressionName(node) !== 'find') {
    return false;
  }
  const firstArg = node.arguments[0];
  return Boolean(firstArg && (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)));
}

export function isMongoQueryCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const method = node.expression.name.text;
  if (!MONGO_QUERY_METHODS.has(method)) {
    return false;
  }
  if (method === 'find' && isArrayFindCall(node)) {
    return false;
  }
  if (method === 'aggregate') {
    const firstArg = node.arguments[0];
    return !firstArg || ts.isArrayLiteralExpression(firstArg) || ts.isIdentifier(firstArg);
  }
  return true;
}

export function isMongoFindCall(node: ts.CallExpression): boolean {
  return isMongoQueryCall(node) && getCallExpressionName(node) === 'find';
}

export function isMongoFindOneCall(node: ts.CallExpression): boolean {
  const name = getCallExpressionName(node);
  return isMongoQueryCall(node) && name === 'findOne';
}

function looksLikeSql(node: ts.CallExpression): boolean {
  const arg = node.arguments[0];
  if (!arg) {
    return false;
  }
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) || ts.isTemplateExpression(arg)) {
    return /\b(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(arg.getText());
  }
  return false;
}

export function isPostgresQueryCall(node: ts.CallExpression): boolean {
  const fullName = getFullCallExpressionName(node);
  if (/\$queryRaw(Unsafe)?\b/.test(fullName) || /\$executeRaw(Unsafe)?\b/.test(fullName)) {
    return true;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const method = node.expression.name.text;
  if (!['query', 'execute', 'queryRaw'].includes(method)) {
    return false;
  }
  const receiver = node.expression.expression.getText();
  if (/\b(pool|client|db|knex|prisma)\b/i.test(receiver)) {
    return true;
  }
  return looksLikeSql(node);
}

export function getSqlText(node: ts.CallExpression): string | null {
  const arg = node.arguments[0];
  if (!arg) {
    return null;
  }
  if (ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'text') {
        return prop.initializer.getText();
      }
    }
  }
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) || ts.isTemplateExpression(arg)) {
    return arg.getText();
  }
  return null;
}

export function sqlLooksUnbounded(sql: string): boolean {
  if (!/\bSELECT\b/i.test(sql)) {
    return false;
  }
  return !/\bLIMIT\b/i.test(sql) && !/\bFETCH\s+FIRST\b/i.test(sql);
}

export function isBatchedQuery(node: ts.CallExpression): boolean {
  const text = node.getText();
  return /\$in\b/.test(text) || /\bANY\s*\(/i.test(text) || /\bIN\s*\(/i.test(text);
}

function walkCallChainMethods(node: ts.CallExpression): string[] {
  const methods: string[] = [];
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      methods.push(current.expression.name.text);
    }
    current = current.parent;
  }
  return methods;
}

export function mongoCallHasPagination(node: ts.CallExpression): boolean {
  const chain = walkCallChainMethods(node);
  if (chain.some((method) => MONGO_CURSOR_BOUNDING.has(method))) {
    return true;
  }
  const optionsArg = node.arguments[1];
  if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
    const keys = extractObjectKeys(optionsArg);
    if (keys.some((key) => ['limit', 'skip', 'batchSize'].includes(key))) {
      return true;
    }
  }
  return false;
}

export function extractObjectKeys(node: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = [];
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isIdentifier(prop.name)) {
        keys.push(prop.name.text);
      } else if (ts.isStringLiteral(prop.name) || ts.isNumericLiteral(prop.name)) {
        keys.push(prop.name.text);
      }
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      keys.push(prop.name.text);
    }
  }
  return keys;
}

export function getMongoFilterFields(node: ts.CallExpression): string[] {
  const filterArg = node.arguments[0];
  if (filterArg && ts.isObjectLiteralExpression(filterArg)) {
    return extractObjectKeys(filterArg);
  }
  return [];
}

export function getMongoSortFields(node: ts.CallExpression): string[] {
  const optionsArg = node.arguments[1];
  if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
    for (const prop of optionsArg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ((ts.isIdentifier(prop.name) && prop.name.text === 'sort') ||
          (ts.isStringLiteral(prop.name) && prop.name.text === 'sort')) &&
        ts.isObjectLiteralExpression(prop.initializer)
      ) {
        return extractObjectKeys(prop.initializer);
      }
    }
  }

  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      if (current.expression.name.text === 'sort') {
        const sortArg = current.arguments[0];
        if (sortArg && ts.isObjectLiteralExpression(sortArg)) {
          return extractObjectKeys(sortArg);
        }
      }
    }
    current = current.parent;
  }
  return [];
}

export function isIdOnlyFilter(fields: string[]): boolean {
  return fields.length > 0 && fields.every((field) => field === '_id' || field === 'id');
}

export function enclosingLoop(node: ts.Node): ts.Node | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)) {
      return current;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (
        ts.isCallExpression(parent) &&
        ts.isPropertyAccessExpression(parent.expression) &&
        ITERATION_CALLBACKS.has(parent.expression.name.text)
      ) {
        return parent;
      }
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

export function getLoopBindingNames(loop: ts.Node): Set<string> {
  const names = new Set<string>();
  if (ts.isForOfStatement(loop) || ts.isForInStatement(loop)) {
    if (ts.isVariableDeclarationList(loop.initializer)) {
      for (const decl of loop.initializer.declarations) {
        if (ts.isIdentifier(decl.name)) {
          names.add(decl.name.text);
        }
      }
    }
  }
  if (ts.isForStatement(loop) && loop.initializer && ts.isVariableDeclarationList(loop.initializer)) {
    for (const decl of loop.initializer.declarations) {
      if (ts.isIdentifier(decl.name)) {
        names.add(decl.name.text);
      }
    }
  }
  if (ts.isCallExpression(loop)) {
    const callback = loop.arguments[0];
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
      const firstParam = callback.parameters[0];
      if (firstParam && ts.isIdentifier(firstParam.name)) {
        names.add(firstParam.name.text);
      }
    }
  }
  return names;
}

function isReferencedIdentifier(id: ts.Identifier): boolean {
  const parent = id.parent;
  if (!parent) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) {
    return false;
  }
  if (ts.isPropertyAssignment(parent) && parent.name === id) {
    return false;
  }
  if (ts.isMethodDeclaration(parent) && parent.name === id) {
    return false;
  }
  if (ts.isFunctionDeclaration(parent) && parent.name === id) {
    return false;
  }
  if (ts.isParameter(parent) && parent.name === id) {
    return false;
  }
  if (ts.isVariableDeclaration(parent) && parent.name === id) {
    return false;
  }
  return true;
}

export function collectReferencedIdentifiers(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (current: ts.Node): void => {
    if (ts.isIdentifier(current) && isReferencedIdentifier(current)) {
      names.add(current.text);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return names;
}

export function queryUsesLoopBinding(query: ts.CallExpression, loop: ts.Node): boolean {
  const bindings = getLoopBindingNames(loop);
  if (bindings.size === 0) {
    return false;
  }
  const used = collectReferencedIdentifiers(query);
  for (const name of bindings) {
    if (used.has(name)) {
      return true;
    }
  }
  return false;
}

export function isInsideLoop(node: ts.Node): boolean {
  return enclosingLoop(node) !== undefined;
}

function functionName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  return undefined;
}

export function isStartupContext(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  let sawFunction = false;
  while (current) {
    if (isFunctionLike(current)) {
      sawFunction = true;
      const name = functionName(current);
      if (name && STARTUP_FUNCTION_NAMES.has(name)) {
        return true;
      }
    }
    if (ts.isSourceFile(current)) {
      return !sawFunction;
    }
    current = current.parent;
  }
  return false;
}

function isHttpRouteRegistration(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return false;
  }
  if (!HTTP_ROUTE_METHODS.has(call.expression.name.text)) {
    return false;
  }
  return /\b(app|router|route|server|fastify|http)\b/i.test(call.expression.expression.getText());
}

export function isRequestHandler(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (ts.isCallExpression(parent) && isHttpRouteRegistration(parent)) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

export function isConnectionConstruction(node: ts.CallExpression | ts.NewExpression): boolean {
  if (ts.isNewExpression(node)) {
    const name = node.expression.getText();
    return /MongoClient$/.test(name) || /(^|\.)Pool$/.test(name);
  }
  const fullName = getFullCallExpressionName(node);
  return (
    /MongoClient\.connect$/.test(fullName) ||
    /mongoose\.connect$/.test(fullName) ||
    /createPool$/.test(fullName) ||
    /createConnection$/.test(fullName)
  );
}

export function looksLikeMongoSource(content: string): boolean {
  return /from\s+['"]mongodb['"]|from\s+['"]mongoose['"]|require\s*\(\s*['"]mongodb['"]|require\s*\(\s*['"]mongoose['"]/.test(
    content,
  );
}

export function looksLikePostgresSource(content: string): boolean {
  return /from\s+['"]pg['"]|from\s+['"]pg-pool['"]|from\s+['"]@prisma\/client['"]|from\s+['"]postgres['"]|require\s*\(\s*['"]pg['"]/.test(
    content,
  );
}

export function isCreateIndexCall(node: ts.CallExpression): boolean {
  return /\b(createIndex|ensureIndex|createIndexes)\b/.test(getFullCallExpressionName(node));
}

export function boundNamesFromAwaitStatement(statement: ts.Statement): {
  awaitExpr: ts.AwaitExpression;
  boundNames: string[];
} | null {
  if (ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression)) {
    return { awaitExpr: statement.expression, boundNames: [] };
  }
  if (ts.isVariableStatement(statement)) {
    for (const decl of statement.declarationList.declarations) {
      if (decl.initializer && ts.isAwaitExpression(decl.initializer) && ts.isIdentifier(decl.name)) {
        return { awaitExpr: decl.initializer, boundNames: [decl.name.text] };
      }
    }
  }
  return null;
}

export function isBlockingSyncCall(node: ts.CallExpression): { label: string } | null {
  const fullName = node.expression.getText();
  if (/readFileSync|writeFileSync|appendFileSync/.test(fullName)) {
    return { label: 'synchronous filesystem operation' };
  }
  if (/execSync|spawnSync|execFileSync/.test(fullName)) {
    return { label: 'synchronous child process execution' };
  }
  return null;
}

export function loopIsSequentialByConstruction(loop: ts.Node): boolean {
  return ts.isWhileStatement(loop) || ts.isDoStatement(loop);
}

