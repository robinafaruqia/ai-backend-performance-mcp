import type { SourceFileInfo } from '../types/index.js';
import { collectSourceFiles } from '../utils/fileSystem.js';

export async function loadSourceFiles(projectPath: string): Promise<SourceFileInfo[]> {
  return collectSourceFiles(projectPath);
}
