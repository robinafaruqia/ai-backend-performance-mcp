import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFinding } from '../../models/Finding.js';
import type { Analyzer, Finding, PackageJson, ProjectContext } from '../../types/index.js';
import { assertPathInsideRoot } from '../../utils/fileSystem.js';

interface LockfilePackage {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface ParsedLockfile {
  packages: Record<string, LockfilePackage>;
}

function getAllDeclaredDependencies(packageJson: PackageJson | null): {
  production: Set<string>;
  development: Set<string>;
} {
  return {
    production: new Set(Object.keys(packageJson?.dependencies ?? {})),
    development: new Set(Object.keys(packageJson?.devDependencies ?? {})),
  };
}

function collectImportedPackages(sourceFiles: ProjectContext['sourceFiles']): Set<string> {
  const imported = new Set<string>();
  const importPattern =
    /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|require\s*\(\s*)['"]([^./][^'"]*)['"]/g;

  for (const file of sourceFiles) {
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(file.content)) !== null) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }
      const pkgName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      if (pkgName) {
        imported.add(pkgName);
      }
    }
  }

  return imported;
}

async function parseNpmLockfile(lockfilePath: string, rootPath: string): Promise<ParsedLockfile | null> {
  assertPathInsideRoot(rootPath, lockfilePath);
  const content = await readFile(lockfilePath, 'utf8').catch(() => null);
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as { packages?: Record<string, LockfilePackage> };
    return { packages: parsed.packages ?? {} };
  } catch {
    return null;
  }
}

function countLockfilePackages(lockfile: ParsedLockfile | null): number {
  if (!lockfile) {
    return 0;
  }
  return Object.keys(lockfile.packages).filter((key) => key && key !== '').length;
}

function findDuplicateTopLevelPackages(lockfile: ParsedLockfile | null): string[] {
  if (!lockfile) {
    return [];
  }

  const versionsByName = new Map<string, Set<string>>();
  for (const [pkgPath, meta] of Object.entries(lockfile.packages)) {
    if (!pkgPath || !meta.dependencies) {
      continue;
    }
    const name = pkgPath.split('node_modules/').pop();
    if (!name) {
      continue;
    }
    const versions = versionsByName.get(name) ?? new Set<string>();
    for (const version of Object.values(meta.dependencies)) {
      versions.add(version);
    }
    versionsByName.set(name, versions);
  }

  return [...versionsByName.entries()]
    .filter(([, versions]) => versions.size > 1)
    .map(([name]) => name);
}

export class DependencyAnalyzer implements Analyzer {
  readonly name = 'dependency-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const packageJson = context.packageJson;

    if (!packageJson) {
      findings.push(
        createFinding({
          category: 'dependencies',
          severity: 'info',
          title: 'No package.json found',
          description: 'The project does not contain a readable package.json file.',
          evidence: {
            kind: 'confirmed',
            snippet: '',
            detail: `Searched in ${context.projectPath}`,
          },
          recommendation: 'Add a package.json if this is a Node.js project.',
          confidence: 1,
          estimatedImpact: 'Dependency analysis is limited without package metadata.',
        }),
      );
      return findings;
    }

    const declared = getAllDeclaredDependencies(packageJson);
    const imported = collectImportedPackages(context.sourceFiles);
    const lockfilePath = path.join(context.projectPath, 'package-lock.json');
    const lockfile = await parseNpmLockfile(lockfilePath, context.projectPath);
    const lockfileCount = countLockfilePackages(lockfile);

    const prodCount = declared.production.size;
    const devCount = declared.development.size;

    findings.push(
      createFinding({
        category: 'dependencies',
        severity: 'info',
        title: 'Dependency counts',
        description: `Production: ${prodCount}, development: ${devCount}, lockfile packages: ${lockfileCount}.`,
        evidence: {
          kind: 'confirmed',
          snippet: JSON.stringify(
            {
              production: prodCount,
              development: devCount,
              lockfilePackages: lockfileCount,
            },
            null,
            2,
          ),
        },
        recommendation: 'Review dependency footprint periodically and remove unused packages.',
        confidence: 1,
        estimatedImpact: 'Informational baseline for dependency hygiene.',
      }),
    );

    const builtinModules = new Set([
      'fs',
      'path',
      'http',
      'https',
      'crypto',
      'util',
      'stream',
      'events',
      'os',
      'url',
      'node:fs',
      'node:path',
    ]);

    for (const dep of declared.production) {
      if (!imported.has(dep) && !dep.startsWith('@types/')) {
        findings.push(
          createFinding({
            category: 'dependencies',
            severity: 'low',
            title: 'Potentially unused production dependency',
            description: `Dependency "${dep}" is declared in dependencies but no import was found in scanned source files.`,
            evidence: {
              kind: 'potential',
              snippet: `"${dep}": "${packageJson.dependencies?.[dep] ?? ''}"`,
              detail: 'Static import scan only; dynamic requires are not detected.',
            },
            recommendation:
              'Confirm whether the package is used dynamically or by tooling before removing.',
            confidence: 0.5,
            estimatedImpact: 'Larger install size and attack surface if truly unused.',
          }),
        );
      }
    }

    for (const dep of declared.development) {
      if (imported.has(dep)) {
        findings.push(
          createFinding({
            category: 'dependencies',
            severity: 'medium',
            title: 'Development dependency imported in source',
            description: `Package "${dep}" is listed in devDependencies but appears imported in application source.`,
            evidence: {
              kind: 'potential',
              snippet: `"${dep}": "${packageJson.devDependencies?.[dep] ?? ''}"`,
              detail: 'May cause missing dependency errors in production installs.',
            },
            recommendation: 'Move runtime dependencies to dependencies, or remove imports from production code.',
            confidence: 0.65,
            estimatedImpact: 'Production runtime failures if devDependencies are omitted.',
          }),
        );
      }
    }

    const duplicates = findDuplicateTopLevelPackages(lockfile);
    for (const dup of duplicates.slice(0, 5)) {
      findings.push(
        createFinding({
          category: 'dependencies',
          severity: 'low',
          title: 'Duplicate dependency versions in lockfile',
          description: `Package "${dup}" appears with multiple versions in package-lock.json.`,
          evidence: {
            kind: 'potential',
            snippet: dup,
            detail: 'Dedupe with npm dedupe or align version ranges.',
          },
          recommendation: 'Align dependency versions to reduce bundle size and security surface.',
          confidence: 0.6,
          estimatedImpact: 'Increased install size and potential compatibility issues.',
        }),
      );
    }

    const testToolDeps = ['jest', 'vitest', 'mocha', 'chai', 'supertest'];
    for (const dep of testToolDeps) {
      if (declared.production.has(dep)) {
        findings.push(
          createFinding({
            category: 'dependencies',
            severity: 'medium',
            title: 'Test tool listed as production dependency',
            description: `"${dep}" is in dependencies but is typically a development-only package.`,
            evidence: {
              kind: 'confirmed',
              snippet: `"${dep}": "${packageJson.dependencies?.[dep] ?? ''}"`,
            },
            recommendation: `Move "${dep}" to devDependencies unless it is required at runtime.`,
            confidence: 0.85,
            estimatedImpact: 'Unnecessary packages deployed to production environments.',
          }),
        );
      }
    }

    for (const imp of imported) {
      if (builtinModules.has(imp)) {
        continue;
      }
      if (!declared.production.has(imp) && !declared.development.has(imp)) {
        findings.push(
          createFinding({
            category: 'dependencies',
            severity: 'low',
            title: 'Imported package not declared in package.json',
            description: `Source imports "${imp}" but it is not listed in dependencies or devDependencies.`,
            evidence: {
              kind: 'potential',
              snippet: imp,
              detail: 'May be provided transitively or via monorepo workspace references.',
            },
            recommendation: 'Declare direct dependencies explicitly in package.json.',
            confidence: 0.55,
            estimatedImpact: 'Fragile installs if transitive dependency resolution changes.',
          }),
        );
      }
    }

    return findings;
  }
}

export const dependencyAnalyzer = new DependencyAnalyzer();
