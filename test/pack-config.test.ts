import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { addProjectPack, clearProjectPackOverride, removeProjectPack, setProjectPackOverride } from '../src/core/pack-config.js';
import { loadPackLock, writePackLock } from '../src/core/pack-lock.js';
import { type GitRunner } from '../src/core/parsers.js';
import type { PackLockFile, PackSpec } from '../src/core/types.js';

import { cleanupTmpDirs, makeTmp } from './helpers.js';

afterEach(cleanupTmpDirs);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a GitRunner that maps "args.join(' ')" → stdout string.
 * When a 'clone' command is received, creates .git and .rac/config.toml
 * in the target directory so ensureSharedPack can finish.
 * Any unrecognised command returns stdout: ''.
 * Exposes `calls` array for assertion.
 */
function makeRunner(
  stdouts: Record<string, string> = {},
  opts: { throwOnClone?: boolean; throwOnFetch?: boolean } = {},
): GitRunner & { calls: { args: string[]; cwd?: string }[] } {
  const calls: { args: string[]; cwd?: string }[] = [];
  const runner = vi.fn(async (args: string[], cwd?: string) => {
    calls.push({ args, cwd });

    if (args[0] === 'clone') {
      if (opts.throwOnClone) throw new Error('simulated clone failure');
      const target = args[2];
      await mkdir(path.join(target, '.git'), { recursive: true });
      await mkdir(path.join(target, '.rac'), { recursive: true });
      await writeFile(path.join(target, '.rac/config.toml'), '', 'utf8');
    }

    if (args[0] === 'fetch' && opts.throwOnFetch) {
      throw new Error('simulated fetch failure');
    }

    const key = args.join(' ');
    return { stdout: stdouts[key] ?? '' };
  }) as unknown as GitRunner & { calls: { args: string[]; cwd?: string }[] };
  (runner as unknown as { calls: typeof calls }).calls = calls;
  return runner;
}

/**
 * Create a minimal project directory with .rac/config.toml.
 * Returns the project cwd (parent of .rac/).
 */
async function makeProject(tomlContent = ''): Promise<string> {
  const cwd = await makeTmp();
  await mkdir(path.join(cwd, '.rac'), { recursive: true });
  await writeFile(path.join(cwd, '.rac', 'config.toml'), tomlContent, 'utf8');
  return cwd;
}

/**
 * Create a fake cache entry for a pack spec so ensureSharedPack does not attempt
 * a real clone (the .git dir check short-circuits clone when it already exists).
 */
async function seedFakeCache(cacheDir: string, repo: string, ref: string): Promise<string> {
  const key = `${repo}@${ref}`;
  const keyHash = Buffer.from(key).toString('base64url');
  const repoDir = path.join(cacheDir, 'packs', keyHash);
  await mkdir(path.join(repoDir, '.git'), { recursive: true });
  await mkdir(path.join(repoDir, '.rac'), { recursive: true });
  await writeFile(path.join(repoDir, '.rac/config.toml'), '', 'utf8');
  return repoDir;
}

const SPEC_X: PackSpec = { id: 'pack-x', repo: 'github:owner/pack-x', ref: 'main' };
const SPEC_Y: PackSpec = { id: 'pack-y', repo: 'github:owner/pack-y', ref: 'v1' };
const SHA_X = 'a'.repeat(40);
const SHA_Y = 'b'.repeat(40);

// ---------------------------------------------------------------------------
// addProjectPack
// ---------------------------------------------------------------------------

describe('addProjectPack writes lockfile entry on success', () => {
  it('creates rac-lock.json with the resolved SHA', async () => {
    const cwd = await makeProject();
    const cacheDir = await makeTmp();
    const origCache = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      const runner = makeRunner({ 'rev-parse HEAD': `${SHA_X}\n` });
      await addProjectPack(cwd, SPEC_X, { gitRunner: runner });

      // config.toml should contain the new pack
      const configContent = await readFile(path.join(cwd, '.rac', 'config.toml'), 'utf8');
      expect(configContent).toContain('pack-x');
      expect(configContent).toContain('github:owner/pack-x');

      // lockfile should exist with one entry
      const lock = await loadPackLock(path.join(cwd, '.rac'));
      expect(lock).not.toBeNull();
      expect(lock!.packs).toHaveLength(1);
      expect(lock!.packs[0]).toEqual({
        id: 'pack-x',
        repo: 'github:owner/pack-x',
        ref: 'main',
        resolved: SHA_X,
      });
    } finally {
      process.env.RAC_CACHE_DIR = origCache;
    }
  });
});

describe('addProjectPack preserves prior lockfile entries', () => {
  it('appends new entry without removing existing entries', async () => {
    const cwd = await makeProject(
      `[[packs]]\nid = "pack-x"\nrepo = "github:owner/pack-x"\nref = "main"\n`,
    );
    const cacheDir = await makeTmp();
    const origCache = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      // Pre-seed cache and lockfile for X
      await seedFakeCache(cacheDir, SPEC_X.repo, SPEC_X.ref);
      await writePackLock(path.join(cwd, '.rac'), {
        version: 1,
        packs: [{ id: SPEC_X.id, repo: SPEC_X.repo, ref: SPEC_X.ref, resolved: SHA_X }],
      });

      // Runner returns SHA_Y for pack-y (rev-parse HEAD)
      const runner = makeRunner({ 'rev-parse HEAD': `${SHA_Y}\n` });
      await addProjectPack(cwd, SPEC_Y, { gitRunner: runner });

      const lock = await loadPackLock(path.join(cwd, '.rac'));
      expect(lock).not.toBeNull();
      expect(lock!.packs).toHaveLength(2);
      const ids = lock!.packs.map((p) => p.id).sort();
      expect(ids).toEqual(['pack-x', 'pack-y']);
      expect(lock!.packs.find((p) => p.id === 'pack-x')?.resolved).toBe(SHA_X);
      expect(lock!.packs.find((p) => p.id === 'pack-y')?.resolved).toBe(SHA_Y);
    } finally {
      process.env.RAC_CACHE_DIR = origCache;
    }
  });
});

describe('addProjectPack failure leaves config mutated, lockfile unchanged', () => {
  it('config.toml has new entry, lockfile has no entry for it when clone fails', async () => {
    const cwd = await makeProject();
    const cacheDir = await makeTmp();
    const origCache = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      const runner = makeRunner({}, { throwOnClone: true });
      await expect(addProjectPack(cwd, SPEC_X, { gitRunner: runner })).rejects.toThrow(
        'simulated clone failure',
      );

      // config.toml MUST have the new pack entry
      const configContent = await readFile(path.join(cwd, '.rac', 'config.toml'), 'utf8');
      expect(configContent).toContain('pack-x');

      // lockfile must NOT have been created
      const lock = await loadPackLock(path.join(cwd, '.rac'));
      expect(lock).toBeNull();
    } finally {
      process.env.RAC_CACHE_DIR = origCache;
    }
  });

  it('pre-existing lockfile is unchanged when fetch fails', async () => {
    const cwd = await makeProject(
      `[[packs]]\nid = "pack-x"\nrepo = "github:owner/pack-x"\nref = "main"\n`,
    );
    const cacheDir = await makeTmp();
    const origCache = process.env.RAC_CACHE_DIR;
    process.env.RAC_CACHE_DIR = cacheDir;

    try {
      // Pre-seed cache and lockfile for X only
      await seedFakeCache(cacheDir, SPEC_X.repo, SPEC_X.ref);
      const priorLock: PackLockFile = {
        version: 1,
        packs: [{ id: SPEC_X.id, repo: SPEC_X.repo, ref: SPEC_X.ref, resolved: SHA_X }],
      };
      await writePackLock(path.join(cwd, '.rac'), priorLock);

      // Fake runner: clone creates dirs, but fetch throws
      const runner = makeRunner({}, { throwOnFetch: true });
      await expect(addProjectPack(cwd, SPEC_Y, { gitRunner: runner })).rejects.toThrow(
        'simulated fetch failure',
      );

      // config.toml MUST have pack-y (already written before resolve attempt)
      const configContent = await readFile(path.join(cwd, '.rac', 'config.toml'), 'utf8');
      expect(configContent).toContain('pack-y');

      // Lockfile must not have pack-y
      const lock = await loadPackLock(path.join(cwd, '.rac'));
      expect(lock).not.toBeNull();
      expect(lock!.packs.find((p) => p.id === 'pack-y')).toBeUndefined();
      // X still present
      expect(lock!.packs.find((p) => p.id === 'pack-x')?.resolved).toBe(SHA_X);
    } finally {
      process.env.RAC_CACHE_DIR = origCache;
    }
  });
});

// ---------------------------------------------------------------------------
// removeProjectPack
// ---------------------------------------------------------------------------

describe('removeProjectPack drops lockfile entry', () => {
  it('removes Y from config and lockfile while preserving X', async () => {
    const cwd = await makeProject(
      `[[packs]]\nid = "pack-x"\nrepo = "github:owner/pack-x"\nref = "main"\n\n[[packs]]\nid = "pack-y"\nrepo = "github:owner/pack-y"\nref = "v1"\n`,
    );
    await writePackLock(path.join(cwd, '.rac'), {
      version: 1,
      packs: [
        { id: SPEC_X.id, repo: SPEC_X.repo, ref: SPEC_X.ref, resolved: SHA_X },
        { id: SPEC_Y.id, repo: SPEC_Y.repo, ref: SPEC_Y.ref, resolved: SHA_Y },
      ],
    });

    await removeProjectPack(cwd, 'pack-y');

    // config.toml should no longer have pack-y
    const configContent = await readFile(path.join(cwd, '.rac', 'config.toml'), 'utf8');
    expect(configContent).not.toContain('pack-y');
    expect(configContent).toContain('pack-x');

    // Lockfile should have only X
    const lock = await loadPackLock(path.join(cwd, '.rac'));
    expect(lock).not.toBeNull();
    expect(lock!.packs).toHaveLength(1);
    expect(lock!.packs[0].id).toBe('pack-x');
    expect(lock!.packs[0].resolved).toBe(SHA_X);
  });
});

describe('removeProjectPack with no lockfile is a no-op', () => {
  it('does not create rac-lock.json if it did not exist', async () => {
    const cwd = await makeProject(
      `[[packs]]\nid = "pack-x"\nrepo = "github:owner/pack-x"\nref = "main"\n`,
    );

    await removeProjectPack(cwd, 'pack-x');

    // lockfile must not have been created
    const lock = await loadPackLock(path.join(cwd, '.rac'));
    expect(lock).toBeNull();
  });
});

describe('removeProjectPack does not modify lockfile when id absent from lockfile', () => {
  it('lockfile is unchanged (same mtime) when removed pack was not in lockfile', async () => {
    const cwd = await makeProject(
      `[[packs]]\nid = "pack-x"\nrepo = "github:owner/pack-x"\nref = "main"\n\n[[packs]]\nid = "pack-y"\nrepo = "github:owner/pack-y"\nref = "v1"\n`,
    );
    // Lockfile only has X, not Y
    await writePackLock(path.join(cwd, '.rac'), {
      version: 1,
      packs: [{ id: SPEC_X.id, repo: SPEC_X.repo, ref: SPEC_X.ref, resolved: SHA_X }],
    });

    const lockMtimeBefore = (await stat(path.join(cwd, '.rac', 'rac-lock.json'))).mtimeMs;

    await removeProjectPack(cwd, 'pack-y');

    const lockMtimeAfter = (await stat(path.join(cwd, '.rac', 'rac-lock.json'))).mtimeMs;
    expect(lockMtimeAfter).toBe(lockMtimeBefore);

    // Lockfile content unchanged
    const lock = await loadPackLock(path.join(cwd, '.rac'));
    expect(lock!.packs).toHaveLength(1);
    expect(lock!.packs[0].id).toBe('pack-x');
  });
});

// ---------------------------------------------------------------------------
// setProjectPackOverride / clearProjectPackOverride do not touch lockfile
// ---------------------------------------------------------------------------

describe('setProjectPackOverride and clearProjectPackOverride do not modify lockfile', () => {
  it('lockfile is unchanged across set-override and clear-override ops', async () => {
    // Create a project with pack-x configured
    const cwd = await makeProject(
      `[[packs]]\nid = "pack-x"\nrepo = "github:owner/pack-x"\nref = "main"\n`,
    );

    // Create a local pack dir to use as override target
    const localPackDir = await makeTmp();
    await mkdir(path.join(localPackDir, '.rac'), { recursive: true });
    await writeFile(path.join(localPackDir, '.rac', 'config.toml'), '', 'utf8');

    // Seed the lockfile
    const priorLock: PackLockFile = {
      version: 1,
      packs: [{ id: SPEC_X.id, repo: SPEC_X.repo, ref: SPEC_X.ref, resolved: SHA_X }],
    };
    await writePackLock(path.join(cwd, '.rac'), priorLock);

    const lockContentBefore = await readFile(path.join(cwd, '.rac', 'rac-lock.json'), 'utf8');

    // Set override
    await setProjectPackOverride(cwd, 'pack-x', localPackDir);

    const lockContentAfterSet = await readFile(path.join(cwd, '.rac', 'rac-lock.json'), 'utf8');
    expect(lockContentAfterSet).toBe(lockContentBefore);

    // Clear override
    await clearProjectPackOverride(cwd, 'pack-x');

    const lockContentAfterClear = await readFile(path.join(cwd, '.rac', 'rac-lock.json'), 'utf8');
    expect(lockContentAfterClear).toBe(lockContentBefore);
  });
});
