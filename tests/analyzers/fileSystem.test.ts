import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertPathInsideRoot,
  collectSourceFiles,
  isPathInsideRoot,
  PathValidationError,
  readJsonFile,
  resolveProjectPath,
} from '../../src/utils/fileSystem.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '../fixtures/n-plus-one');

describe('fileSystem safety', () => {
  it('resolves valid project paths', async () => {
    const resolved = await resolveProjectPath(fixturesRoot);
    expect(resolved).toContain('n-plus-one');
  });

  it('rejects paths outside project root', () => {
    const root = path.resolve(fixturesRoot);
    const outside = path.resolve(fixturesRoot, '../../..');
    expect(isPathInsideRoot(root, outside)).toBe(false);
    expect(() => assertPathInsideRoot(root, outside)).toThrow(PathValidationError);
  });

  it('rejects non-existent project paths', async () => {
    await expect(resolveProjectPath('/tmp/does-not-exist-abc123')).rejects.toThrow(
      PathValidationError,
    );
  });

  it('does not read symlinks, ignored directories, or files past the scan cap', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'perf-mcp-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'perf-mcp-out-'));
    try {
      await mkdir(path.join(root, 'src'));
      await mkdir(path.join(root, 'node_modules'));
      await writeFile(path.join(root, 'src', 'ok.js'), 'export const ok = 1;\n');
      await writeFile(path.join(root, 'src', 'second.js'), 'export const second = 1;\n');
      await writeFile(path.join(root, 'node_modules', 'hidden.js'), 'export const hidden = 1;\n');
      await writeFile(path.join(outside, 'secret.js'), 'export const secret = 1;\n');
      await symlink(path.join(outside, 'secret.js'), path.join(root, 'src', 'secret.js'));
      await symlink(path.join(outside, 'secret.js'), path.join(root, 'package.json'));

      const full = await collectSourceFiles(root);
      expect(full.files.map((file) => file.relativePath).sort()).toEqual(['src/ok.js', 'src/second.js']);
      expect(full.scan.skippedSymlinks).toBeGreaterThan(0);
      expect(full.files.some((file) => file.content.includes('secret'))).toBe(false);

      const capped = await collectSourceFiles(root, { maxSourceFiles: 1 });
      expect(capped.files).toHaveLength(1);
      expect(capped.scan.truncated).toBe(true);

      const oversize = await collectSourceFiles(root, { maxFileSizeBytes: 4 });
      expect(oversize.files).toHaveLength(0);
      expect(oversize.scan.skippedOversize).toBe(2);

      expect(await readJsonFile(path.join(root, 'package.json'), root)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
