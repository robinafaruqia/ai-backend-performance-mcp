import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Finding } from '../../types/index.js';
import {
  getMongoFilterShape,
  getMongoSortShape,
  getNodeLocation,
  getSnippet,
  isCreateIndexCall,
  isIdOnlyFilter,
  isMongoQueryCall,
  readObjectShape,
  type IndexDirection,
  type OrderedField,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

interface IndexDefinition {
  keys: OrderedField[];
  /** True when the key spec is dynamic (variable, spread, or computed). */
  opaque: boolean;
}

interface QueryPattern {
  equalityFields: string[];
  rangeFields: string[];
  sortKeys: OrderedField[];
  uncertain: boolean;
  file: string;
  line: number;
  column: number;
  snippet: string;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function keysFromSpec(expression: ts.Expression | undefined): IndexDefinition | null {
  if (!expression) {
    return { keys: [], opaque: true };
  }
  const value = unwrapExpression(expression);
  if (ts.isStringLiteral(value)) {
    return { keys: [{ name: value.text, direction: 1 }], opaque: false };
  }
  if (!ts.isObjectLiteralExpression(value)) {
    return { keys: [], opaque: true };
  }
  const shape = readObjectShape(value);
  if (shape.opaque) {
    return { keys: shape.fields, opaque: true };
  }
  if (shape.fields.length === 0 || shape.fields.some((field) => field.direction === null)) {
    return { keys: [], opaque: true };
  }
  return { keys: shape.fields, opaque: false };
}

function propertyNamed(node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue;
    }
    const propName = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    if (propName === name) {
      return prop.initializer;
    }
  }
  return undefined;
}

function collectIndexDefinitions(parsedFiles: ParsedSourceFile[]): IndexDefinition[] {
  const indexes: IndexDefinition[] = [];

  for (const { sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !isCreateIndexCall(node)) {
        return;
      }
      const callName = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      const firstArg = node.arguments[0];

      if (callName === 'createIndexes') {
        const list = firstArg ? unwrapExpression(firstArg) : undefined;
        if (!list || !ts.isArrayLiteralExpression(list)) {
          indexes.push({ keys: [], opaque: true });
          return;
        }
        for (const element of list.elements) {
          if (!ts.isObjectLiteralExpression(element)) {
            indexes.push({ keys: [], opaque: true });
            continue;
          }
          const parsed = keysFromSpec(propertyNamed(element, 'key'));
          if (parsed) {
            indexes.push(parsed);
          }
        }
        return;
      }

      const parsed = keysFromSpec(firstArg);
      if (parsed) {
        indexes.push(parsed);
      }
    });
  }

  return indexes;
}

function collectQueryPatterns(parsedFiles: ParsedSourceFile[]): QueryPattern[] {
  const patterns: QueryPattern[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !isMongoQueryCall(node)) {
        return;
      }
      const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      if (!['find', 'findOne', 'countDocuments', 'deleteMany', 'updateMany'].includes(method)) {
        return;
      }

      const filter = getMongoFilterShape(node);
      const sort = getMongoSortShape(node);
      const equalityFields = filter.equalityFields;
      const rangeFields = filter.rangeFields;
      if (equalityFields.length === 0 && rangeFields.length === 0 && sort.fields.length === 0) {
        return;
      }
      if (isIdOnlyFilter([...equalityFields, ...rangeFields, ...sort.fields.map((field) => field.name)])) {
        return;
      }

      const uncertain =
        filter.opaque || sort.opaque || sort.fields.some((field) => field.direction === null);
      const location = getNodeLocation(sourceFile, node);
      patterns.push({
        equalityFields,
        rangeFields,
        sortKeys: sort.fields,
        uncertain,
        file: info.relativePath,
        line: location.line,
        column: location.column,
        snippet: getSnippet(sourceFile, node),
      });
    });
  }

  return patterns;
}

function directionMatches(indexDirection: IndexDirection, queryDirection: IndexDirection, flipped: boolean): boolean {
  const expected = flipped ? ((-indexDirection) as IndexDirection) : indexDirection;
  return expected === queryDirection;
}

/**
 * MongoDB can use a compound index when equality fields are a prefix (any order
 * among those keys), at most one range predicate is the next key, and sort keys
 * continue in index order. A reverse index scan flips every sort direction.
 * Extra keys after the used prefix are allowed. This does not know the live index set.
 */
export function compoundIndexCovers(
  indexKeys: OrderedField[],
  query: { equalityFields: string[]; rangeFields: string[]; sortKeys: OrderedField[] },
): boolean {
  if (indexKeys.length === 0 || indexKeys.some((key) => key.direction === null)) {
    return false;
  }
  if (query.sortKeys.some((key) => key.direction === null)) {
    return false;
  }

  const equality = new Set(query.equalityFields);
  if (equality.size !== query.equalityFields.length) {
    return false;
  }
  if (equality.size > indexKeys.length) {
    return false;
  }
  const prefix = indexKeys.slice(0, equality.size);
  if (!prefix.every((key) => equality.has(key.name))) {
    return false;
  }

  let cursor = equality.size;
  if (query.rangeFields.length > 1) {
    return false;
  }
  if (query.rangeFields.length === 1) {
    const rangeField = query.rangeFields[0];
    const next = indexKeys[cursor];
    if (!rangeField || !next || next.name !== rangeField || next.direction === null) {
      return false;
    }
    cursor += 1;
    const sortRemaining = query.sortKeys.filter((key) => !equality.has(key.name) && key.name !== rangeField);
    if (sortRemaining.length > 0) {
      return false;
    }
    const rangeSort = query.sortKeys.find((key) => key.name === rangeField);
    if (!rangeSort || rangeSort.direction === null) {
      return true;
    }
    return (
      directionMatches(next.direction, rangeSort.direction, false) ||
      directionMatches(next.direction, rangeSort.direction, true)
    );
  }

  const sortRemaining = query.sortKeys.filter((key) => !equality.has(key.name));
  if (sortRemaining.length === 0) {
    return true;
  }
  if (cursor + sortRemaining.length > indexKeys.length) {
    return false;
  }

  const matches = (flipped: boolean): boolean =>
    sortRemaining.every((key, index) => {
      const indexKey = indexKeys[cursor + index];
      if (!indexKey || indexKey.name !== key.name || indexKey.direction === null || key.direction === null) {
        return false;
      }
      return directionMatches(indexKey.direction, key.direction, flipped);
    });

  return matches(false) || matches(true);
}

function formatKeys(keys: OrderedField[]): string {
  return keys.map((key) => `${key.name}:${key.direction ?? '?'}`).join(', ');
}

function formatQuery(query: QueryPattern): string {
  const parts = [
    `equality [${query.equalityFields.join(', ') || 'none'}]`,
    `range [${query.rangeFields.join(', ') || 'none'}]`,
    `sort [${formatKeys(query.sortKeys) || 'none'}]`,
  ];
  return parts.join('; ');
}

export function analyzeMongoIndexes(parsedFiles: ParsedSourceFile[]): Finding[] {
  const indexes = collectIndexDefinitions(parsedFiles);
  if (indexes.length === 0 || indexes.some((index) => index.opaque)) {
    return [];
  }

  const concrete = indexes.filter((index) => index.keys.length > 0);
  if (concrete.length === 0) {
    return [];
  }

  const findings: Finding[] = [];
  for (const query of collectQueryPatterns(parsedFiles)) {
    if (query.uncertain) {
      continue;
    }
    const covered = concrete.some((index) => compoundIndexCovers(index.keys, query));
    if (covered) {
      continue;
    }

    const required = [...query.equalityFields, ...query.rangeFields, ...query.sortKeys.map((key) => key.name)];
    findings.push(
      createFinding({
        ruleId: 'db.mongo.index-not-in-source',
        category: 'database',
        severity: 'medium',
        title: 'Query fields not covered by in-repo createIndex (not a confirmed missing MongoDB index)',
        description:
          'A MongoDB query does not match any in-repo createIndex/ensureIndex/createIndexes key as a compound prefix. Equality fields must be a prefix, at most one range field may follow, and sort direction must match that order or its full reverse. This is not proof that the database is missing an index — Atlas, migrations, and ops-managed indexes are invisible here.',
        file: query.file,
        line: query.line,
        column: query.column,
        evidence: {
          kind: 'potential',
          snippet: query.snippet,
          detail: `Query ${formatQuery(query)}. Fields used: ${required.join(', ') || 'none'}. In-repo index keys: ${concrete
            .map((index) => formatKeys(index.keys))
            .join(' | ')}`,
        },
        recommendation:
          'Treat this as a hint, not a missing-index verdict. If this repo owns indexes, add a createIndex whose key order and sort direction match the query prefix. If indexes live in Atlas or migrations, compare those definitions instead of adding one from this finding alone.',
        confidence: Confidence.potentialModerate,
        confidenceRationale:
          'Prefix and sort-direction check against in-repo createIndex only (potential-moderate). Live index state, partial indexes, and collation are unknown.',
        estimatedImpact: 'If no matching database index exists, the query may scan a larger range.',
      }),
    );
  }

  return findings;
}
