import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, type FileHandle } from 'node:fs/promises';
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
  'bower_components',
  'jspm_packages',
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
export const DEFAULT_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

const NOFOLLOW_FLAG = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;

export interface ScanStats {
  truncated: boolean;
  skippedSymlinks: number;
  skippedOversize: number;
  skippedUnreadable: number;
  totalBytesRead: number;
}

export interface SourceScanResult {
  files: Array<{ absolutePath: string; relativePath: string; content: string }>;
  scan: ScanStats;
}

export function emptyScanStats(): ScanStats {
  return {
    truncated: false,
    skippedSymlinks: 0,
    skippedOversize: 0,
    skippedUnreadable: 0,
    totalBytesRead: 0,
  };
}

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathValidationError';
  }
}

export async function resolveProjectPath(projectPath: string): Promise<string> {
  const resolved = path.resolve(projectPath);
  const stats = await lstat(resolved).catch(() => {
    throw new PathValidationError(`Project path does not exist: ${projectPath}`);
  });
  if (stats.isSymbolicLink()) {
    const real = await realpath(resolved).catch(() => {
      throw new PathValidationError(`Project path does not exist: ${projectPath}`);
    });
    const realStats = await lstat(real).catch(() => {
      throw new PathValidationError(`Project path does not exist: ${projectPath}`);
    });
    if (!realStats.isDirectory()) {
      throw new PathValidationError(`Project path is not a directory: ${projectPath}`);
    }
    return real;
  }
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
  if (name.startsWith('.') && name !== '.') {
    return true;
  }
  return skipPatterns.has(name.toLowerCase());
}

function shouldSkipFile(relativePath: string, extensions: string[]): boolean {
  const ext = path.extname(relativePath);
  if (!extensions.includes(ext)) {
    return true;
  }
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

async function readRegularFile(absolutePath: string): Promise<{ content: string } | 'symlink' | 'unreadable'> {
  let handle: FileHandle | undefined;
  try {
    const linkStats = await lstat(absolutePath);
    if (linkStats.isSymbolicLink()) {
      return 'symlink';
    }
    if (!linkStats.isFile()) {
      return 'unreadable';
    }
    handle = await open(absolutePath, constants.O_RDONLY | NOFOLLOW_FLAG);
    const stats = await handle.stat();
    if (!stats.isFile()) {
      return 'unreadable';
    }
    const content = await handle.readFile({ encoding: 'utf8' });
    return { content };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP') {
      return 'symlink';
    }
    return 'unreadable';
  } finally {
    await handle?.close();
  }
}

export async function collectSourceFiles(
  projectPath: string,
  options: {
    extensions?: string[];
    skipPatterns?: string[];
    maxFileSizeBytes?: number;
    maxSourceFiles?: number;
    maxTotalBytes?: number;
  } = {},
): Promise<SourceScanResult> {
  const extensions = options.extensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  const skipPatterns = new Set((options.skipPatterns ?? [...DEFAULT_SKIP_DIRS]).map((name) => name.toLowerCase()));
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const maxSourceFiles = options.maxSourceFiles ?? DEFAULT_MAX_SOURCE_FILES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  const resolvedRoot = await resolveProjectPath(projectPath);
  const files: SourceScanResult['files'] = [];
  const scan = emptyScanStats();

  async function walk(currentDir: string): Promise<void> {
    if (files.length >= maxSourceFiles || scan.totalBytesRead >= maxTotalBytes) {
      scan.truncated = true;
      return;
    }

    assertPathInsideRoot(resolvedRoot, currentDir);
    const dirStats = await lstat(currentDir).catch(() => null);
    if (!dirStats || dirStats.isSymbolicLink() || !dirStats.isDirectory()) {
      if (dirStats?.isSymbolicLink()) {
        scan.skippedSymlinks += 1;
      }
      return;
    }

    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => null);
    if (!entries) {
      scan.skippedUnreadable += 1;
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxSourceFiles || scan.totalBytesRead >= maxTotalBytes) {
        scan.truncated = true;
        return;
      }

      const absolutePath = path.join(currentDir, entry.name);
      assertPathInsideRoot(resolvedRoot, absolutePath);

      if (entry.isSymbolicLink()) {
        scan.skippedSymlinks += 1;
        continue;
      }

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, skipPatterns)) {
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

      const entryStats = await lstat(absolutePath).catch(() => null);
      if (!entryStats) {
        scan.skippedUnreadable += 1;
        continue;
      }
      if (entryStats.isSymbolicLink()) {
        scan.skippedSymlinks += 1;
        continue;
      }
      if (!entryStats.isFile()) {
        continue;
      }
      if (entryStats.size > maxFileSizeBytes) {
        scan.skippedOversize += 1;
        continue;
      }
      if (scan.totalBytesRead + entryStats.size > maxTotalBytes) {
        scan.truncated = true;
        return;
      }

      const read = await readRegularFile(absolutePath);
      if (read === 'symlink') {
        scan.skippedSymlinks += 1;
        continue;
      }
      if (read === 'unreadable') {
        scan.skippedUnreadable += 1;
        continue;
      }
      scan.totalBytesRead += Buffer.byteLength(read.content);
      files.push({ absolutePath, relativePath, content: read.content });
    }
  }

  await walk(resolvedRoot);
  return { files, scan };
}

/** Size and mtime of every eligible source file, ignoring read caps. Used to invalidate the project cache. */
export async function fingerprintSourceTree(
  projectPath: string,
  options: {
    extensions?: string[];
    skipPatterns?: string[];
    maxFileSizeBytes?: number;
  } = {},
): Promise<string> {
  const extensions = options.extensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  const skipPatterns = new Set((options.skipPatterns ?? [...DEFAULT_SKIP_DIRS]).map((name) => name.toLowerCase()));
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const resolvedRoot = await resolveProjectPath(projectPath);
  const parts: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    assertPathInsideRoot(resolvedRoot, currentDir);
    const dirStats = await lstat(currentDir).catch(() => null);
    if (!dirStats || dirStats.isSymbolicLink() || !dirStats.isDirectory()) {
      return;
    }
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => null);
    if (!entries) {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      assertPathInsideRoot(resolvedRoot, absolutePath);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, skipPatterns)) {
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
      const entryStats = await lstat(absolutePath).catch(() => null);
      if (!entryStats || entryStats.isSymbolicLink() || !entryStats.isFile()) {
        continue;
      }
      if (entryStats.size > maxFileSizeBytes) {
        continue;
      }
      parts.push(`${relativePath}:${entryStats.size}:${entryStats.mtimeMs}`);
    }
  }

  await walk(resolvedRoot);
  parts.sort();
  return parts.join('\n');
}

export async function readJsonFile<T>(filePath: string, rootPath: string): Promise<T | null> {
  assertPathInsideRoot(rootPath, filePath);
  const read = await readRegularFile(filePath);
  if (read === 'symlink' || read === 'unreadable' || !read.content) {
    return null;
  }
  try {
    return JSON.parse(read.content) as T;
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await lstat(filePath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}
