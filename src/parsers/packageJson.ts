import path from 'node:path';
import type { PackageJson } from '../types/index.js';
import { readJsonFile } from '../utils/fileSystem.js';

export async function parsePackageJson(
  projectPath: string,
): Promise<{ packageJson: PackageJson | null; path: string | null }> {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageJson = await readJsonFile<PackageJson>(packageJsonPath, projectPath);
  return {
    packageJson,
    path: packageJson ? packageJsonPath : null,
  };
}

export function detectTechnologies(packageJson: PackageJson | null): string[] {
  const technologies = new Set<string>();
  const allDeps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
    ...packageJson?.peerDependencies,
    ...packageJson?.optionalDependencies,
  };

  const depMap: Record<string, string> = {
    express: 'express',
    fastify: 'fastify',
    koa: 'koa',
    mongodb: 'mongodb',
    mongoose: 'mongoose',
    pg: 'postgresql',
    'pg-pool': 'postgresql',
    prisma: 'prisma',
    typeorm: 'typeorm',
    sequelize: 'sequelize',
    redis: 'redis',
    ioredis: 'redis',
    bull: 'bull',
    bullmq: 'bullmq',
    '@prisma/client': 'prisma',
  };

  for (const [dep, label] of Object.entries(depMap)) {
    if (allDeps[dep]) {
      technologies.add(label);
    }
  }

  if (technologies.size === 0) {
    technologies.add('nodejs');
  }

  return [...technologies].sort();
}

const DATABASE_TECH = new Set([
  'mongodb',
  'mongoose',
  'postgresql',
  'prisma',
  'typeorm',
  'sequelize',
  'redis',
]);

const FRAMEWORK_TECH = new Set(['express', 'fastify', 'koa']);

export function splitTechnologies(detectedTechnologies: string[]): {
  databases: string[];
  frameworks: string[];
} {
  const databases = detectedTechnologies.filter((tech) => DATABASE_TECH.has(tech)).sort();
  const frameworks = detectedTechnologies.filter((tech) => FRAMEWORK_TECH.has(tech)).sort();
  return { databases, frameworks };
}
