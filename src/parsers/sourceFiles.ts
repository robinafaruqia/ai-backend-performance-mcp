import type { ProjectScanStats, SourceFileInfo } from '../types/index.js';
import { collectSourceFiles } from '../utils/fileSystem.js';

export async function loadSourceFiles(
  projectPath: string,
  options?: {
    extensions?: string[];
    skipPatterns?: string[];
    maxFileSizeBytes?: number;
    maxSourceFiles?: number;
    maxTotalBytes?: number;
  },
): Promise<{ files: SourceFileInfo[]; scan: ProjectScanStats }> {
  return collectSourceFiles(projectPath, options);
}
