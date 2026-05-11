import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PackLockEntry, PackLockFile, PackSpec } from './types.js';

export async function loadPackLock(projectRoot: string): Promise<PackLockFile | null> {
  const lockPath = path.join(projectRoot, 'rac-lock.json');
  let raw: string;
  try {
    raw = await readFile(lockPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`rac-lock.json is malformed: ${(err as Error).message}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.version !== 1) {
    throw new Error(`rac-lock.json is malformed: unsupported version ${String(obj.version)}`);
  }

  if (!Array.isArray(obj.packs)) {
    throw new Error('rac-lock.json is malformed: packs must be an array');
  }

  const packs: PackLockEntry[] = [];
  for (let i = 0; i < (obj.packs as unknown[]).length; i++) {
    const entry = (obj.packs as unknown[])[i] as Record<string, unknown>;
    for (const field of ['id', 'repo', 'ref', 'resolved'] as const) {
      const val = entry[field];
      if (typeof val !== 'string' || val === '') {
        throw new Error(`rac-lock.json is malformed: entry ${i} missing/invalid field ${field}`);
      }
    }
    packs.push({
      id: entry.id as string,
      repo: entry.repo as string,
      ref: entry.ref as string,
      resolved: entry.resolved as string,
    });
  }

  return { version: 1, packs };
}

export async function writePackLock(projectRoot: string, lock: PackLockFile): Promise<void> {
  const lockPath = path.join(projectRoot, 'rac-lock.json');
  const sorted = [...lock.packs].sort((a, b) => a.id.localeCompare(b.id));
  const content = JSON.stringify({ version: lock.version, packs: sorted }, null, 2) + '\n';
  await writeFile(lockPath, content, 'utf8');
}

export function findLockEntry(lock: PackLockFile | null, spec: PackSpec): PackLockEntry | undefined {
  if (lock === null) return undefined;
  return lock.packs.find(
    (entry) => entry.id === spec.id && entry.repo === spec.repo && entry.ref === spec.ref
  );
}
