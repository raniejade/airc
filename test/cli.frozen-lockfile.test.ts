import { afterAll, describe, expect, it } from 'vitest';

import { cleanupTmpDirs, makeTmp, runCliInProcess } from './helpers.js';

afterAll(cleanupTmpDirs);

describe('--frozen-lockfile CLI flag', () => {
  describe('rac install --help', () => {
    it('includes --frozen-lockfile in help output', async () => {
      const root = await makeTmp();
      const result = await runCliInProcess(root, ['install', '--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--frozen-lockfile');
    });
  });

  describe('rac diff --help', () => {
    it('includes --frozen-lockfile in help output', async () => {
      const root = await makeTmp();
      const result = await runCliInProcess(root, ['diff', '--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--frozen-lockfile');
    });
  });

  describe('rac install --frozen-lockfile --refresh-packs conflict', () => {
    it('exits with code 2 and stderr contains the conflict message', async () => {
      const root = await makeTmp();
      const result = await runCliInProcess(root, ['install', '--frozen-lockfile', '--refresh-packs']);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('cannot combine --refresh-packs with --frozen-lockfile');
    });
  });

  describe('rac diff --frozen-lockfile --refresh-packs conflict', () => {
    it('exits with code 2 and stderr contains the conflict message', async () => {
      const root = await makeTmp();
      const result = await runCliInProcess(root, ['diff', '--frozen-lockfile', '--refresh-packs']);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('cannot combine --refresh-packs with --frozen-lockfile');
    });
  });
});
