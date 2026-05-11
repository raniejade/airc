import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultGitRunner, ensureSharedPack, type GitRunner } from '../src/core/parsers.js';

import { cleanupTmpDirs, makeTmp } from './helpers.js';

afterEach(cleanupTmpDirs);

describe('ensureSharedPack', () => {
  const validSpec = { id: 'mypkg', repo: 'github:owner/repo', ref: 'main' };

  it('invalid ref: surfaces fetch error verbatim', async () => {
    const cacheDir = await makeTmp();
    const originalCacheDir = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      const fetchError = new Error("git fetch --force --tags origin badref failed: fatal: couldn't find remote ref badref");
      const runner: GitRunner = vi.fn()
        .mockImplementationOnce(async () => ({ stdout: '' }) /* clone succeeds */)
        .mockImplementationOnce(async () => { throw fetchError; });

      await expect(
        ensureSharedPack({ ...validSpec, ref: 'badref' }, { gitRunner: runner })
      ).rejects.toThrow("git fetch --force --tags origin badref failed: fatal: couldn't find remote ref badref");
    } finally {
      process.env.RAC_CACHE_DIR = originalCacheDir;
    }
  });

  it('network unreachable: surfaces clone error', async () => {
    const cacheDir = await makeTmp();
    const originalCacheDir = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      const cloneError = new Error("git clone https://github.com/x/y.git … failed: fatal: unable to access …: Could not resolve host github.com");
      const runner: GitRunner = vi.fn()
        .mockImplementationOnce(async () => { throw cloneError; });

      await expect(
        ensureSharedPack({ id: 'mypkg', repo: 'github:x/y', ref: 'main' }, { gitRunner: runner })
      ).rejects.toThrow('Could not resolve host github.com');
    } finally {
      process.env.RAC_CACHE_DIR = originalCacheDir;
    }
  });

  it('private repo auth: surfaces authentication failure', async () => {
    const cacheDir = await makeTmp();
    const originalCacheDir = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      const authError = new Error("git clone ... failed: Authentication failed for 'https://github.com/priv/repo.git'");
      const runner: GitRunner = vi.fn()
        .mockImplementationOnce(async () => { throw authError; });

      await expect(
        ensureSharedPack({ id: 'mypkg', repo: 'github:priv/repo', ref: 'main' }, { gitRunner: runner })
      ).rejects.toThrow('Authentication failed');
    } finally {
      process.env.RAC_CACHE_DIR = originalCacheDir;
    }
  });

  it('refresh: true clears cache and triggers clone even when .git sentinel exists', async () => {
    const cacheDir = await makeTmp();
    const originalCacheDir = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      // Pre-create a fake cache dir with .git sentinel
      const { mkdir } = await import('node:fs/promises');
      const key = `github:owner/repo@main`;
      const keyHash = Buffer.from(key).toString('base64url');
      const repoDir = path.join(cacheDir, 'packs', keyHash);
      await mkdir(path.join(repoDir, '.git'), { recursive: true });

      const cloneCalls: string[][] = [];
      const runner: GitRunner = vi.fn().mockImplementation(async (args: string[]) => {
        if (args[0] === 'clone') {
          cloneCalls.push(args);
        }
        // All git calls succeed
        return { stdout: '' };
      });

      // With refresh: true, clone should be called even though .git exists
      // Note: it will fail at loadSharedPackConfig since there's no real rac config,
      // but we can verify clone was called
      try {
        await ensureSharedPack(validSpec, { refresh: true, gitRunner: runner });
      } catch {
        // expected to fail at loadSharedPackConfig stage
      }

      expect(cloneCalls.length).toBeGreaterThanOrEqual(1);
      expect(cloneCalls[0][0]).toBe('clone');
    } finally {
      process.env.RAC_CACHE_DIR = originalCacheDir;
    }
  });

  it('locked mode: fetches and checks out the given SHA, skips FETCH_HEAD', async () => {
    const cacheDir = await makeTmp();
    const originalCacheDir = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const key = `github:owner/repo@main`;
      const keyHash = Buffer.from(key).toString('base64url');
      const repoDir = path.join(cacheDir, 'packs', keyHash);
      await mkdir(path.join(repoDir, '.git'), { recursive: true });
      await mkdir(path.join(repoDir, '.rac'), { recursive: true });
      await writeFile(path.join(repoDir, '.rac/config.toml'), '', 'utf8');

      const lockedSha = 'a'.repeat(40);
      const calls: string[][] = [];
      const runner: GitRunner = vi.fn().mockImplementation(async (args: string[]) => {
        calls.push(args);
        return { stdout: '' };
      });

      const result = await ensureSharedPack(validSpec, { gitRunner: runner, lockedSha });

      // Should have called fetch with sha and checkout --detach sha
      const fetchCall = calls.find((a) => a[0] === 'fetch');
      expect(fetchCall).toEqual(['fetch', '--force', '--tags', 'origin', lockedSha]);

      const checkoutCall = calls.find((a) => a[0] === 'checkout');
      expect(checkoutCall).toEqual(['checkout', '--detach', lockedSha]);

      // No FETCH_HEAD calls
      const fetchHeadCall = calls.find((a) => a.includes('FETCH_HEAD'));
      expect(fetchHeadCall).toBeUndefined();

      // No rev-parse calls
      const revParseCall = calls.find((a) => a[0] === 'rev-parse');
      expect(revParseCall).toBeUndefined();

      // resolvedSha should be the lockedSha
      expect(result.resolvedSha).toBe(lockedSha);
    } finally {
      process.env.RAC_CACHE_DIR = originalCacheDir;
    }
  });

  it('resolving mode: captures SHA from rev-parse HEAD after FETCH_HEAD checkout', async () => {
    const cacheDir = await makeTmp();
    const originalCacheDir = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const key = `github:owner/repo@main`;
      const keyHash = Buffer.from(key).toString('base64url');
      const repoDir = path.join(cacheDir, 'packs', keyHash);
      await mkdir(path.join(repoDir, '.git'), { recursive: true });
      await mkdir(path.join(repoDir, '.rac'), { recursive: true });
      await writeFile(path.join(repoDir, '.rac/config.toml'), '', 'utf8');

      const expectedSha = 'b'.repeat(40);
      const calls: string[][] = [];
      const runner: GitRunner = vi.fn().mockImplementation(async (args: string[]) => {
        calls.push(args);
        if (args[0] === 'rev-parse') {
          return { stdout: `${expectedSha}\n` }; // trailing newline to verify trim
        }
        return { stdout: '' };
      });

      const result = await ensureSharedPack(validSpec, { gitRunner: runner });

      // Call order: fetch origin <ref> → checkout --detach FETCH_HEAD → rev-parse HEAD
      expect(calls[0]).toEqual(['fetch', '--force', '--tags', 'origin', 'main']);
      expect(calls[1]).toEqual(['checkout', '--detach', 'FETCH_HEAD']);
      expect(calls[2]).toEqual(['rev-parse', 'HEAD']);

      // resolvedSha should be trimmed
      expect(result.resolvedSha).toBe(expectedSha);
    } finally {
      process.env.RAC_CACHE_DIR = originalCacheDir;
    }
  });

  it('locked mode with refresh: true: wipes cache and fetches SHA, not FETCH_HEAD', async () => {
    const cacheDir = await makeTmp();
    const originalCacheDir = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const key = `github:owner/repo@main`;
      const keyHash = Buffer.from(key).toString('base64url');
      const repoDir = path.join(cacheDir, 'packs', keyHash);
      // Pre-populate the cache directory
      await mkdir(path.join(repoDir, '.git'), { recursive: true });
      await mkdir(path.join(repoDir, '.rac'), { recursive: true });
      await writeFile(path.join(repoDir, '.rac/config.toml'), '', 'utf8');

      const lockedSha = 'c'.repeat(40);
      const calls: string[][] = [];
      const runner: GitRunner = vi.fn().mockImplementation(async (args: string[]) => {
        calls.push(args);
        // When clone is called, recreate the pack directory structure (simulating a real clone)
        if (args[0] === 'clone') {
          const cloneTarget = args[2]; // clone <url> <target-dir>
          await mkdir(path.join(cloneTarget, '.git'), { recursive: true });
          await mkdir(path.join(cloneTarget, '.rac'), { recursive: true });
          await writeFile(path.join(cloneTarget, '.rac/config.toml'), '', 'utf8');
        }
        return { stdout: '' };
      });

      // With refresh: true and lockedSha, it wipes cache, clones, then uses locked sha
      const result = await ensureSharedPack(validSpec, { refresh: true, gitRunner: runner, lockedSha });

      // Clone must have happened (because refresh wiped the cache)
      const cloneCall = calls.find((a) => a[0] === 'clone');
      expect(cloneCall).toBeDefined();
      expect(cloneCall?.[0]).toBe('clone');

      // Fetch with sha (not ref)
      const fetchCall = calls.find((a) => a[0] === 'fetch');
      expect(fetchCall).toEqual(['fetch', '--force', '--tags', 'origin', lockedSha]);

      // Checkout with sha (not FETCH_HEAD)
      const checkoutCall = calls.find((a) => a[0] === 'checkout');
      expect(checkoutCall).toEqual(['checkout', '--detach', lockedSha]);

      // No FETCH_HEAD calls
      const fetchHeadCall = calls.find((a) => a.includes('FETCH_HEAD'));
      expect(fetchHeadCall).toBeUndefined();

      expect(result.resolvedSha).toBe(lockedSha);
    } finally {
      process.env.RAC_CACHE_DIR = originalCacheDir;
    }
  });
});

describe('defaultGitRunner', () => {
  it('rejects with PATH-not-found message when git binary is missing', async () => {
    const emptyDir = await makeTmp();
    const originalPath = process.env.PATH;
    process.env.PATH = emptyDir;

    try {
      const runner = defaultGitRunner();
      await expect(runner(['--version'])).rejects.toThrow(
        'git is required to resolve shared packs; install git and ensure it is on PATH'
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
