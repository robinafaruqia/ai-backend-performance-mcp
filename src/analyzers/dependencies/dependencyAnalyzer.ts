import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Analyzer, Finding, PackageJson, ProjectContext } from '../../types/index.js';
import { assertPathInsideRoot } from '../../utils/fileSystem.js';

const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dgram',
  'dns',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'querystring',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
]);

const TEST_TOOLS = new Set(['jest', 'vitest', 'mocha', 'chai', 'supertest']);

function declaredDependencies(packageJson: PackageJson): {
  production: Set<string>;
  development: Set<string>;
} {
  return {
    production: new Set(Object.keys(packageJson.dependencies ?? {})),
    development: new Set(Object.keys(packageJson.devDependencies ?? {})),
  };
}

function packageNameFromSpecifier(specifier: string): string | null {
  if (specifier.startsWith('node:')) {
    return null;
  }
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return null;
  }
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0] ?? null;
}

function collectImportedPackages(sourceFiles: ProjectContext['sourceFiles']): Set<string> {
  const imported = new Set<string>();
  const importPattern =
    /(?:import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

  for (const file of sourceFiles) {
    importPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(file.content)) !== null) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }
      const pkgName = packageNameFromSpecifier(specifier);
      if (pkgName && !NODE_BUILTINS.has(pkgName)) {
        imported.add(pkgName);
      }
    }
  }

  return imported;
}

async function lockfileExists(projectPath: string): Promise<boolean> {
  const lockfilePath = path.join(projectPath, 'package-lock.json');
  assertPathInsideRoot(projectPath, lockfilePath);
  const content = await readFile(lockfilePath, 'utf8').catch(() => null);
  return content !== null;
}

export class DependencyAnalyzer implements Analyzer {
  readonly name = 'dependency-analyzer';

  async analyze(context: ProjectContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const packageJson = context.packageJson;

    if (!packageJson) {
      return findings;
    }

    const declared = declaredDependencies(packageJson);
    const imported = collectImportedPackages(context.sourceFiles);
    await lockfileExists(context.projectPath);

    for (const dep of declared.production) {
      if (imported.has(dep) || dep.startsWith('@types/')) {
        continue;
      }
      findings.push(
        createFinding({
          ruleId: 'deps.unused-production',
          category: 'dependencies',
          severity: 'low',
          title: 'Potentially unused production dependency',
          description: `Dependency "${dep}" is declared in dependencies but no static import/require was found.`,
          evidence: {
            kind: 'potential',
            snippet: `"${dep}": "${packageJson.dependencies?.[dep] ?? ''}"`,
            detail: 'Does not detect CLI binaries, config plugins, or dynamic requires.',
          },
          recommendation:
            'Remove the package only after confirming it is unused by scripts, native addons, or runtime loaders.',
          confidence: Confidence.potentialWeak,
          confidenceRationale:
            'Import scan only; binaries and dynamic loads are invisible (potential-weak).',
          estimatedImpact: 'Unused packages increase install size and audit noise if truly unused.',
        }),
      );
    }

    for (const dep of declared.development) {
      if (!imported.has(dep)) {
        continue;
      }
      findings.push(
        createFinding({
          ruleId: 'deps.dev-imported-in-source',
          category: 'dependencies',
          severity: 'medium',
          title: 'Development dependency imported in source',
          description: `Package "${dep}" is listed in devDependencies but is imported in application source.`,
          evidence: {
            kind: 'potential',
            snippet: `"${dep}": "${packageJson.devDependencies?.[dep] ?? ''}"`,
            detail: 'May fail in production installs that omit devDependencies.',
          },
          recommendation:
            'Move runtime packages to dependencies, or keep the import out of production code.',
          confidence: Confidence.potentialStrong,
          confidenceRationale:
            'A static import of a devDependency is visible (potential-strong); test files are not classified.',
          estimatedImpact: 'Missing module errors when NODE_ENV production omits devDependencies.',
        }),
      );
    }

    for (const dep of TEST_TOOLS) {
      if (!declared.production.has(dep)) {
        continue;
      }
      findings.push(
        createFinding({
          ruleId: 'deps.test-tool-in-production',
          category: 'dependencies',
          severity: 'medium',
          title: 'Test tool listed as production dependency',
          description: `"${dep}" is in dependencies but is typically a development-only package.`,
          evidence: {
            kind: 'confirmed',
            snippet: `"${dep}": "${packageJson.dependencies?.[dep] ?? ''}"`,
          },
          recommendation: `Move "${dep}" to devDependencies unless the runtime actually requires it.`,
          confidence: Confidence.confirmedStrong,
          confidenceRationale: 'Known test runner listed under dependencies (confirmed-strong).',
          estimatedImpact: 'Unnecessary packages shipped to production.',
        }),
      );
    }

    for (const importedName of imported) {
      if (declared.production.has(importedName) || declared.development.has(importedName)) {
        continue;
      }
      findings.push(
        createFinding({
          ruleId: 'deps.undeclared-import',
          category: 'dependencies',
          severity: 'low',
          title: 'Imported package not declared in package.json',
          description: `Source imports "${importedName}" but it is not listed in dependencies or devDependencies.`,
          evidence: {
            kind: 'potential',
            snippet: importedName,
            detail: 'May be a workspace package or transitive dependency.',
          },
          recommendation: 'Declare direct dependencies explicitly in package.json.',
          confidence: Confidence.potentialModerate,
          confidenceRationale:
            'Specifier is not in this package.json (potential-moderate); workspaces are not resolved.',
          estimatedImpact: 'Installs break if a transitive dependency is hoisted away.',
        }),
      );
    }

    return findings;
  }
}

export const dependencyAnalyzer = new DependencyAnalyzer();
