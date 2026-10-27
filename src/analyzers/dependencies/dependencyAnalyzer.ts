import path from 'node:path';
import { createFinding } from '../../models/Finding.js';
import { Confidence } from '../../models/confidence.js';
import type { Analyzer, Finding, PackageJson, ProjectContext } from '../../types/index.js';
import { readJsonFile } from '../../utils/fileSystem.js';

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

interface LockPackage {
  name?: string;
  version?: string;
  dependencies?: Record<string, LockPackage>;
}

function packageNameFromLockPath(pkgPath: string): string | null {
  const parts = pkgPath.split('node_modules/');
  const last = parts[parts.length - 1];
  if (!last || pkgPath === '') {
    return null;
  }
  return last.endsWith('/') ? last.slice(0, -1) : last;
}

export function duplicateLockfileVersions(lock: unknown): Array<{ name: string; versions: string[] }> {
  const versions = new Map<string, Set<string>>();
  const add = (name: string | undefined, version: string | undefined): void => {
    if (!name || !version) {
      return;
    }
    const set = versions.get(name) ?? new Set<string>();
    set.add(version);
    versions.set(name, set);
  };

  if (!lock || typeof lock !== 'object') {
    return [];
  }

  const record = lock as {
    packages?: Record<string, { name?: string; version?: string }>;
    dependencies?: Record<string, LockPackage>;
  };

  if (record.packages) {
    for (const [pkgPath, meta] of Object.entries(record.packages)) {
      if (pkgPath === '' || !meta) {
        continue;
      }
      add(meta.name ?? packageNameFromLockPath(pkgPath) ?? undefined, meta.version);
    }
  } else if (record.dependencies) {
    const walk = (deps: Record<string, LockPackage>): void => {
      for (const [name, meta] of Object.entries(deps)) {
        add(name, meta?.version);
        if (meta?.dependencies) {
          walk(meta.dependencies);
        }
      }
    };
    walk(record.dependencies);
  }

  return [...versions.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => ({ name, versions: [...set].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readPackageLock(projectPath: string): Promise<unknown | null> {
  return readJsonFile<unknown>(path.join(projectPath, 'package-lock.json'), projectPath);
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
    const lockfile = await readPackageLock(context.projectPath);
    for (const duplicate of duplicateLockfileVersions(lockfile)) {
      findings.push(
        createFinding({
          ruleId: 'deps.lockfile-duplicate-version',
          category: 'dependencies',
          severity: 'low',
          title: 'Lockfile resolves more than one version of a package',
          description: `package-lock.json resolves "${duplicate.name}" at ${duplicate.versions.join(' and ')}.`,
          file: 'package-lock.json',
          evidence: {
            kind: 'potential',
            snippet: `${duplicate.name}@${duplicate.versions.join(', ')}`,
            detail:
              'npm nests multiple versions when ranges conflict. This is evidence of duplication, not proof it is accidental.',
          },
          recommendation:
            'Inspect the lockfile tree before deduping. Keep multiple versions when dependents require incompatible ranges; they still add install size.',
          confidence: Confidence.potentialWeak,
          confidenceRationale:
            'The lockfile lists more than one resolved version (potential-weak). Yarn and pnpm lockfiles are not parsed.',
          estimatedImpact: 'Duplicate copies increase install size and can hide which version a require() binds.',
        }),
      );
    }

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
