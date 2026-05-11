import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findLockEntry, loadPackLock, writePackLock } from '../src/core/pack-lock.js';
import type { PackLockFile, PackSpec } from '../src/core/types.js';

import { cleanupTmpDirs, makeTmp } from './helpers.js';

afterEach(cleanupTmpDirs);

async function makeProjectRoot(): Promise<string> {
  const tmp = await makeTmp();
  const racDir = path.join(tmp, '.rac');
  await mkdir(racDir, { recursive: true });
  return racDir;
}

const sampleEntry = {
  id: 'alpha',
  repo: 'github:org/alpha',
  ref: 'main',
  resolved: 'a'.repeat(40),
};

const sampleLock: PackLockFile = {
  version: 1,
  packs: [sampleEntry],
};

describe('loadPackLock', () => {
  it('missing file returns null', async () => {
    const projectRoot = await makeProjectRoot();
    const result = await loadPackLock(projectRoot);
    expect(result).toBeNull();
  });

  it('malformed JSON throws with rac-lock.json is malformed: prefix', async () => {
    const projectRoot = await makeProjectRoot();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(projectRoot, 'rac-lock.json'), '{ bad json', 'utf8');
    await expect(loadPackLock(projectRoot)).rejects.toThrow(/^rac-lock\.json is malformed:/);
  });

  it('version 2 throws with unsupported version', async () => {
    const projectRoot = await makeProjectRoot();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      path.join(projectRoot, 'rac-lock.json'),
      JSON.stringify({ version: 2, packs: [] }) + '\n',
      'utf8'
    );
    await expect(loadPackLock(projectRoot)).rejects.toThrow('unsupported version');
  });

  it('missing packs array throws', async () => {
    const projectRoot = await makeProjectRoot();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      path.join(projectRoot, 'rac-lock.json'),
      JSON.stringify({ version: 1 }) + '\n',
      'utf8'
    );
    await expect(loadPackLock(projectRoot)).rejects.toThrow('packs must be an array');
  });

  it('entry missing resolved throws naming the field', async () => {
    const projectRoot = await makeProjectRoot();
    const { writeFile } = await import('node:fs/promises');
    const lock = {
      version: 1,
      packs: [{ id: 'alpha', repo: 'github:org/alpha', ref: 'main' }],
    };
    await writeFile(path.join(projectRoot, 'rac-lock.json'), JSON.stringify(lock) + '\n', 'utf8');
    await expect(loadPackLock(projectRoot)).rejects.toThrow('field resolved');
  });

  it('round-trip: write then load returns identical structure', async () => {
    const projectRoot = await makeProjectRoot();
    await writePackLock(projectRoot, sampleLock);
    const result = await loadPackLock(projectRoot);
    expect(result).toEqual(sampleLock);
  });
});

describe('writePackLock', () => {
  it('sorts packs alphabetically by id regardless of input order', async () => {
    const projectRoot = await makeProjectRoot();
    const lock: PackLockFile = {
      version: 1,
      packs: [
        { id: 'zeta', repo: 'github:org/zeta', ref: 'main', resolved: 'z'.repeat(40) },
        { id: 'alpha', repo: 'github:org/alpha', ref: 'main', resolved: 'a'.repeat(40) },
        { id: 'beta', repo: 'github:org/beta', ref: 'main', resolved: 'b'.repeat(40) },
      ],
    };
    await writePackLock(projectRoot, lock);
    const raw = await readFile(path.join(projectRoot, 'rac-lock.json'), 'utf8');
    const alphaPos = raw.indexOf('"alpha"');
    const betaPos = raw.indexOf('"beta"');
    const zetaPos = raw.indexOf('"zeta"');
    expect(alphaPos).toBeLessThan(betaPos);
    expect(betaPos).toBeLessThan(zetaPos);
  });

  it('does not mutate the input lock', async () => {
    const projectRoot = await makeProjectRoot();
    const lock: PackLockFile = {
      version: 1,
      packs: [
        { id: 'zeta', repo: 'github:org/zeta', ref: 'main', resolved: 'z'.repeat(40) },
        { id: 'alpha', repo: 'github:org/alpha', ref: 'main', resolved: 'a'.repeat(40) },
      ],
    };
    const originalOrder = lock.packs.map((p) => p.id);
    await writePackLock(projectRoot, lock);
    expect(lock.packs.map((p) => p.id)).toEqual(originalOrder);
  });

  it('outputs trailing newline', async () => {
    const projectRoot = await makeProjectRoot();
    await writePackLock(projectRoot, sampleLock);
    const raw = await readFile(path.join(projectRoot, 'rac-lock.json'), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('findLockEntry', () => {
  it('returns undefined when lock is null', () => {
    const spec: PackSpec = { id: 'alpha', repo: 'github:org/alpha', ref: 'main' };
    expect(findLockEntry(null, spec)).toBeUndefined();
  });

  it('matches on (id, repo, ref)', () => {
    const spec: PackSpec = { id: 'alpha', repo: 'github:org/alpha', ref: 'main' };
    const result = findLockEntry(sampleLock, spec);
    expect(result).toEqual(sampleEntry);
  });

  it('mismatched ref is a miss', () => {
    const spec: PackSpec = { id: 'alpha', repo: 'github:org/alpha', ref: 'v2' };
    expect(findLockEntry(sampleLock, spec)).toBeUndefined();
  });

  it('mismatched repo is a miss', () => {
    const spec: PackSpec = { id: 'alpha', repo: 'github:org/other', ref: 'main' };
    expect(findLockEntry(sampleLock, spec)).toBeUndefined();
  });

  it('mismatched id is a miss', () => {
    const spec: PackSpec = { id: 'beta', repo: 'github:org/alpha', ref: 'main' };
    expect(findLockEntry(sampleLock, spec)).toBeUndefined();
  });
});
