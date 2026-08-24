import type { PackageJson, ProjectConfig, ProjectContext } from '../types/index.js';

export function createProjectContext(input: {
  projectPath: string;
  packageJson: PackageJson | null;
  sourceFiles: ProjectContext['sourceFiles'];
  detectedTechnologies: string[];
  config?: Partial<ProjectConfig>;
}): ProjectContext {
  return {
    projectPath: input.projectPath,
    packageJson: input.packageJson,
    sourceFiles: input.sourceFiles,
    detectedTechnologies: input.detectedTechnologies,
    config: {
      skipPatterns: input.config?.skipPatterns ?? [
        'node_modules',
        '.git',
        'dist',
        'build',
        'coverage',
      ],
      extensions: input.config?.extensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    },
  };
}
