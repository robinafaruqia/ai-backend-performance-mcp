import type {
  Finding,
  FindingLocation,
  FindingTechnology,
  HotPath,
  ProjectContext,
} from '../types/index.js';
import {
  classifyHotPath,
  enclosingFunctionName,
  enclosingRoute,
  findInnermostNodeAt,
  looksLikeMongoSource,
  looksLikePostgresSource,
  parseAllSourceFiles,
  type ParsedSourceFile,
} from '../analyzers/ast/astUtils.js';
import { guidanceForRule } from './ruleGuidance.js';

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function ruleFamily(ruleId: string): string {
  const dot = ruleId.indexOf('.');
  return dot === -1 ? ruleId : ruleId.slice(0, dot);
}

function databasesFromRule(ruleId: string): string[] {
  if (ruleId.startsWith('db.mongo')) {
    return ['mongodb'];
  }
  if (ruleId.startsWith('db.pg')) {
    return ['postgresql'];
  }
  return [];
}

function looksLikeFramework(content: string, name: string): boolean {
  const pattern = new RegExp(
    String.raw`from\s+['"]${name}['"]|require\s*\(\s*['"]${name}['"]`,
  );
  return pattern.test(content);
}

function fileDatabases(content: string): string[] {
  const databases: string[] = [];
  if (looksLikeMongoSource(content)) {
    databases.push('mongodb');
    if (/mongoose/.test(content)) {
      databases.push('mongoose');
    }
  }
  if (looksLikePostgresSource(content)) {
    databases.push('postgresql');
    if (/prisma/.test(content)) {
      databases.push('prisma');
    }
  }
  return databases;
}

function fileFrameworks(content: string): string[] {
  return ['express', 'fastify', 'koa'].filter((name) => looksLikeFramework(content, name));
}

function uniquifyIds(findings: Finding[]): Finding[] {
  const seen = new Map<string, number>();
  return findings.map((finding) => {
    const count = seen.get(finding.id) ?? 0;
    seen.set(finding.id, count + 1);
    if (count === 0) {
      return finding;
    }
    return { ...finding, id: `${finding.id}#${count}` };
  });
}

function locationForFinding(
  finding: Finding,
  parsedByPath: Map<string, ParsedSourceFile>,
): FindingLocation {
  const file = finding.file ?? 'package.json';
  const parsed = finding.file ? parsedByPath.get(finding.file) : undefined;
  let enclosingFunction: string | undefined;
  let route: FindingLocation['route'];
  let hotPath: HotPath = 'unknown';

  if (parsed && finding.line !== undefined && finding.column !== undefined) {
    const node = findInnermostNodeAt(parsed.sourceFile, finding.line, finding.column);
    if (node) {
      enclosingFunction = enclosingFunctionName(node);
      route = enclosingRoute(node);
      hotPath = classifyHotPath(node);
    }
  } else if (!finding.file) {
    hotPath = 'module';
  }

  return {
    file,
    line: finding.line,
    column: finding.column,
    enclosingFunction,
    route,
    hotPath,
  };
}

function technologyForFinding(
  finding: Finding,
  context: ProjectContext,
  parsedByPath: Map<string, ParsedSourceFile>,
): FindingTechnology {
  const parsed = finding.file ? parsedByPath.get(finding.file) : undefined;
  const content = parsed?.info.content ?? '';
  return {
    databases: uniqueSorted([
      ...context.databases,
      ...fileDatabases(content),
      ...databasesFromRule(finding.ruleId),
    ]),
    frameworks: uniqueSorted([...context.frameworks, ...fileFrameworks(content)]),
    ruleFamily: ruleFamily(finding.ruleId),
  };
}

export function enrichFindings(context: ProjectContext, findings: Finding[]): Finding[] {
  const parsed = parseAllSourceFiles(context.sourceFiles);
  const parsedByPath = new Map(parsed.map((file) => [file.info.relativePath, file]));

  const enriched = findings.map((finding) => {
    const guidance = guidanceForRule(finding.ruleId);
    const location = locationForFinding(finding, parsedByPath);
    return {
      ...finding,
      location,
      technology: technologyForFinding(finding, context, parsedByPath),
      costWhy: guidance.costWhy,
      inspectNext: [...guidance.inspectNext],
      relatedFindingIds: finding.relatedFindingIds ?? [],
    };
  });

  return uniquifyIds(enriched);
}
