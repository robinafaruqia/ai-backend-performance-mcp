import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  'vendor',
  '.cache',
  'out',
  '.nuxt',
  'tmp',
  'temp',
  '.output',
]);

const GENERATED_FILE_PATTERNS = [
  /\.d\.ts$/,
  /\.min\.js$/,
  /\.bundle\./,
  /\.generated\./,
  /-lock\.json$/,
];

export const DEFAULT_MAX_FILE_SIZE_BYTES = 512 * 1024;
export const DEFAULT_MAX_SOURCE_FILES = 4000;

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathValidationError';
  }
}

export async function resolveProjectPath(projectPath: string): Promise<string> {
  const resolved = path.resolve(projectPath);
  const stats = await stat(resolved).catch(() => {
    throw new PathValidationError(`Project path does not exist: ${projectPath}`);
  });
  if (!stats.isDirectory()) {
    throw new PathValidationError(`Project path is not a directory: ${projectPath}`);
  }
  return resolved;
}

export function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function assertPathInsideRoot(rootPath: string, targetPath: string): void {
  if (!isPathInsideRoot(rootPath, targetPath)) {
    throw new PathValidationError(`Path traversal detected: ${targetPath}`);
  }
}

function shouldSkipDirectory(name: string, skipPatterns: Set<string>): boolean {
  return skipPatterns.has(name) || (name.startsWith('.') && name !== '.');
}

function shouldSkipFile(relativePath: string, extensions: string[]): boolean {
  const ext = path.extname(relativePath);
  if (!extensions.includes(ext)) {
    return true;
  }
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

export async function collectSourceFiles(
  projectPath: string,
  options: {
    extensions?: string[];
    skipPatterns?: string[];
    maxFileSizeBytes?: number;
    maxSourceFiles?: number;
  } = {},
): Promise<Array<{ absolutePath: string; relativePath: string; content: string }>> {
  const extensions = options.extensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  const skipPatterns = options.skipPatterns ?? [...DEFAULT_SKIP_DIRS];
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const maxSourceFiles = options.maxSourceFiles ?? DEFAULT_MAX_SOURCE_FILES;

  const resolvedRoot = await resolveProjectPath(projectPath);
  const skipSet = new Set(skipPatterns);
  const files: Array<{ absolutePath: string; relativePath: string; content: string }> = [];

  async function walk(currentDir: string): Promise<void> {
    if (files.length >= maxSourceFiles) {
      return;
    }

    assertPathInsideRoot(resolvedRoot, currentDir);
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= maxSourceFiles) {
        return;
      }

      const absolutePath = path.join(currentDir, entry.name);
      assertPathInsideRoot(resolvedRoot, absolutePath);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, skipSet)) {
          await walk(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(resolvedRoot, absolutePath);
      if (shouldSkipFile(relativePath, extensions)) {
        continue;
      }

      const fileStats = await stat(absolutePath).catch(() => null);
      if (!fileStats || fileStats.size > maxFileSizeBytes) {
        continue;
      }

      const content = await readFile(absolutePath, 'utf8');
      files.push({ absolutePath, relativePath, content });
    }
  }

  await walk(resolvedRoot);
  return files;
}

export async function readJsonFile<T>(filePath: string, rootPath: string): Promise<T | null> {
  assertPathInsideRoot(rootPath, filePath);
  const content = await readFile(filePath, 'utf8').catch(() => null);
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
