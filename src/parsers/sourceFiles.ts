import type { SourceFileInfo } from '../types/index.js';
import { collectSourceFiles } from '../utils/fileSystem.js';

export async function loadSourceFiles(
  projectPath: string,
  options?: {
    extensions?: string[];
    skipPatterns?: string[];
    maxFileSizeBytes?: number;
    maxSourceFiles?: number;
  },
): Promise<SourceFileInfo[]> {
  return collectSourceFiles(projectPath, options);
}
