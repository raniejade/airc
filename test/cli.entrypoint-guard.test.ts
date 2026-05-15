import { chmodSync, symlinkSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

import pkg from '../package.json' with { type: 'json' };

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const distCliPath = resolve(repoRoot, 'dist/cli.js');
const distProgramPath = resolve(repoRoot, 'dist/cli-program.js');

describe('CLI entrypoint split', () => {
  beforeAll(async () => {
    await execFileAsync('npm', ['run', 'build'], { cwd: repoRoot });
  });

  it('importing the program module is safe', async () => {
    const mod = await import(pathToFileURL(distProgramPath).href);
    expect(typeof mod.createProgram).toBe('function');
  });

  it('executes built dist/cli.js --version', async () => {
    const result = await execFileAsync('node', [distCliPath, '--version']);
    expect(result.stdout.trim()).toBe(pkg.version);
    expect(result.stderr.trim()).toBe('');
  });

  it('executes symlink named rac to built dist/cli.js --version', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'rac-entrypoint-symlink-'));
    const symlinkPath = join(tempDir, 'rac');
    symlinkSync(distCliPath, symlinkPath);

    const result = await execFileAsync('node', [symlinkPath, '--version']);
    expect(result.stdout.trim()).toBe(pkg.version);
    expect(result.stderr.trim()).toBe('');
  });

  it('importing program module from a temp script named rac does not run CLI', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'rac-program-import-'));
    const importerPath = join(tempDir, 'rac');

    await writeFile(
      importerPath,
      `import { createProgram } from ${JSON.stringify(pathToFileURL(distProgramPath).href)};\nvoid createProgram;\nprocess.stdout.write('imported-marker\\n');\n`,
      'utf8',
    );
    chmodSync(importerPath, 0o755);

    const result = await execFileAsync('node', [importerPath, '--version']);
    expect(result.stdout.trim()).toBe('imported-marker');
    expect(result.stderr.trim()).toBe('');
  });
});
