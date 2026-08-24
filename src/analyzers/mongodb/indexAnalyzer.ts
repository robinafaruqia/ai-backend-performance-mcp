import ts from 'typescript';
import { createFinding } from '../../models/Finding.js';
import type { Finding } from '../../types/index.js';
import {
  getLineAndColumn,
  getSnippet,
  type ParsedSourceFile,
  visitNodes,
} from '../ast/astUtils.js';

interface IndexDefinition {
  fields: string[];
  line: number;
  snippet: string;
}

interface QueryPattern {
  filterFields: string[];
  sortFields: string[];
  line: number;
  snippet: string;
}

function extractObjectKeys(node: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = [];
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      keys.push(prop.name.text);
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      keys.push(prop.name.text);
    }
  }
  return keys;
}

function extractIndexFields(node: ts.Node): string[] {
  if (ts.isObjectLiteralExpression(node)) {
    return extractObjectKeys(node);
  }
  if (ts.isStringLiteral(node)) {
    return [node.text];
  }
  return [];
}

function collectIndexDefinitions(sourceFile: ts.SourceFile): IndexDefinition[] {
  const indexes: IndexDefinition[] = [];

  visitNodes(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) {
      return;
    }

    const fullName = node.expression.getText();
    if (!/createIndex|ensureIndex/.test(fullName)) {
      return;
    }

    const firstArg = node.arguments[0];
    if (!firstArg) {
      return;
    }

    const fields = extractIndexFields(firstArg);
    if (fields.length === 0) {
      return;
    }

    const { line } = getLineAndColumn(sourceFile, node.getStart());
    indexes.push({
      fields,
      line,
      snippet: getSnippet(sourceFile, node),
    });
  });

  return indexes;
}

function collectQueryPatterns(sourceFile: ts.SourceFile): QueryPattern[] {
  const patterns: QueryPattern[] = [];

  visitNodes(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) {
      return;
    }

    const fullName = node.expression.getText();
    if (!/\.(find|findOne|countDocuments|deleteMany|updateMany)\s*\(/.test(fullName)) {
      return;
    }

    const filterArg = node.arguments[0];
    const filterFields =
      filterArg && ts.isObjectLiteralExpression(filterArg) ? extractObjectKeys(filterArg) : [];

    let sortFields: string[] = [];
    const optionsArg = node.arguments[1];
    if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
      for (const prop of optionsArg.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'sort' &&
          ts.isObjectLiteralExpression(prop.initializer)
        ) {
          sortFields = extractObjectKeys(prop.initializer);
        }
      }
    }

    if (filterFields.length === 0 && sortFields.length === 0) {
      return;
    }

    const { line } = getLineAndColumn(sourceFile, node.getStart());
    patterns.push({
      filterFields,
      sortFields,
      line,
      snippet: getSnippet(sourceFile, node),
    });
  });

  return patterns;
}

function indexCoversFields(indexFields: string[], requiredFields: string[]): boolean {
  if (requiredFields.length === 0) {
    return true;
  }
  const normalizedIndex = indexFields.map((f) => f.replace(/^\$/, ''));
  return requiredFields.every((field) => normalizedIndex.includes(field));
}

export function analyzeMongoIndexes(parsedFiles: ParsedSourceFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { info, sourceFile } of parsedFiles) {
    const indexes = collectIndexDefinitions(sourceFile);
    const queries = collectQueryPatterns(sourceFile);

    for (const query of queries) {
      const requiredFields = [...query.filterFields, ...query.sortFields];
      const covered = indexes.some((index) => indexCoversFields(index.fields, requiredFields));

      if (!covered && requiredFields.length > 0) {
        const { line, column } = getLineAndColumn(
          sourceFile,
          sourceFile.getPositionOfLineAndCharacter(query.line - 1, 0),
        );

        findings.push(
          createFinding({
            category: 'database',
            severity: 'medium',
            title: 'Potential missing MongoDB index',
            description:
              'A query uses filter or sort fields that are not covered by any createIndex definition found in the project.',
            file: info.relativePath,
            line,
            column,
            evidence: {
              kind: 'potential',
              snippet: query.snippet,
              detail: `Fields used: ${requiredFields.join(', ')}. Indexes found: ${
                indexes.length > 0
                  ? indexes.map((i) => i.fields.join(', ')).join('; ')
                  : 'none'
              }`,
            },
            recommendation:
              'Add a compound index covering filter and sort fields, or verify indexes are managed externally.',
            confidence: 0.65,
            estimatedImpact: 'Collection scans may increase query latency at scale.',
          }),
        );
      }
    }
  }

  return findings;
}
