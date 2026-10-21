import { splitTechnologies } from '../parsers/packageJson.js';
import type { PackageJson, ProjectConfig, ProjectContext, ProjectScanStats } from '../types/index.js';
import { DEFAULT_MAX_TOTAL_BYTES } from '../utils/fileSystem.js';

const EMPTY_SCAN: ProjectScanStats = {
  truncated: false,
  skippedSymlinks: 0,
  skippedOversize: 0,
  skippedUnreadable: 0,
  totalBytesRead: 0,
};

export function createProjectContext(input: {
  projectPath: string;
  packageJson: PackageJson | null;
  sourceFiles: ProjectContext['sourceFiles'];
  detectedTechnologies: string[];
  config?: Partial<ProjectConfig>;
  scan?: ProjectScanStats;
}): ProjectContext {
  const { databases, frameworks } = splitTechnologies(input.detectedTechnologies);
  return {
    projectPath: input.projectPath,
    packageJson: input.packageJson,
    sourceFiles: input.sourceFiles,
    detectedTechnologies: input.detectedTechnologies,
    databases,
    frameworks,
    scan: input.scan ?? EMPTY_SCAN,
    config: {
      skipPatterns: input.config?.skipPatterns ?? [
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
      ],
      extensions: input.config?.extensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      maxFileSizeBytes: input.config?.maxFileSizeBytes ?? 512 * 1024,
      maxSourceFiles: input.config?.maxSourceFiles ?? 4000,
      maxTotalBytes: input.config?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    },
  };
}
