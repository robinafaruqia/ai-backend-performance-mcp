import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Finding } from '../../types/index.js';
import {
  extractObjectKeys,
  getMongoFilterFields,
  getMongoSortFields,
  getNodeLocation,
  getSnippet,
  isCreateIndexCall,
  isIdOnlyFilter,
  isMongoQueryCall,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

interface IndexDefinition {
  fields: string[];
}

interface QueryPattern {
  filterFields: string[];
  sortFields: string[];
  file: string;
  line: number;
  column: number;
  snippet: string;
}

function collectIndexDefinitions(parsedFiles: ParsedSourceFile[]): IndexDefinition[] {
  const indexes: IndexDefinition[] = [];

  for (const { sourceFile } of parsedFiles) {
    visitNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !isCreateIndexCall(node)) {
        return;
      }
      const firstArg = node.arguments[0];
      if (!firstArg) {
        return;
      }
      const fields = ts.isObjectLiteralExpression(firstArg)
        ? extractObjectKeys(firstArg)
        : ts.isStringLiteral(firstArg)
          ? [firstArg.text]
          : [];
      if (fields.length === 0) {
        return;
      }
      indexes.push({ fields });
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
      const method = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : '';
      if (!['find', 'findOne', 'countDocuments', 'deleteMany', 'updateMany'].includes(method)) {
        return;
      }

      const filterFields = getMongoFilterFields(node);
      const sortFields = getMongoSortFields(node);
      if (filterFields.length === 0 && sortFields.length === 0) {
        return;
      }
      if (isIdOnlyFilter([...filterFields, ...sortFields])) {
        return;
      }

      const location = getNodeLocation(sourceFile, node);
      patterns.push({
        filterFields,
        sortFields,
        file: info.relativePath,
        line: location.line,
        column: location.column,
        snippet: getSnippet(sourceFile, node),
      });
    });
  }

  return patterns;
}

function indexCoversFields(indexFields: string[], requiredFields: string[]): boolean {
  if (requiredFields.length === 0) {
    return true;
  }
  const normalizedIndex = indexFields.map((field) => field.replace(/^\$/, ''));
  return requiredFields.every((field) => normalizedIndex.includes(field));
}

export function analyzeMongoIndexes(parsedFiles: ParsedSourceFile[]): Finding[] {
  const indexes = collectIndexDefinitions(parsedFiles);
  if (indexes.length === 0) {
    return [];
  }

  const findings: Finding[] = [];
  for (const query of collectQueryPatterns(parsedFiles)) {
    const requiredFields = [...query.filterFields, ...query.sortFields];
    const covered = indexes.some((index) => indexCoversFields(index.fields, requiredFields));
    if (covered || requiredFields.length === 0) {
      continue;
    }

    findings.push(
      createFinding({
        ruleId: 'db.mongo.index-not-in-source',
        category: 'database',
        severity: 'medium',
        title: 'Query fields not covered by in-repo createIndex (not a confirmed missing MongoDB index)',
        description:
          'A MongoDB query filters or sorts on fields that do not appear in any createIndex/ensureIndex call in the scanned source. This is not proof that the database is missing an index — Atlas, migrations, or ops-managed indexes are invisible here.',
        file: query.file,
        line: query.line,
        column: query.column,
        evidence: {
          kind: 'potential',
          snippet: query.snippet,
          detail: `Fields used: ${requiredFields.join(', ')}. In-repo index keys: ${indexes
            .map((index) => index.fields.join(', '))
            .join('; ')}`,
        },
        recommendation:
          'If indexes are defined in this repo, add a compound index covering filter and sort fields. If indexes are managed outside the repo, verify coverage in the database instead of treating this as a missing index.',
        confidence: Confidence.potentialModerate,
        confidenceRationale:
          'Compared only to createIndex/ensureIndex in source (potential-moderate). Database index state is unknown.',
        estimatedImpact: 'If no matching database index exists, queries may scan larger ranges.',
      }),
    );
  }

  return findings;
}
