import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertPathInsideRoot,
  isPathInsideRoot,
  PathValidationError,
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
});
