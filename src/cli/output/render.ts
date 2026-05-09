import path from 'node:path';

import { type ColorMode, styles } from './color.js';
import type { WarningSeverity } from './doctor.js';
import type { InstallAction } from './install.js';

export { type ColorMode };

/**
 * Return the action symbol colored appropriately.
 */
export function symbol(action: InstallAction, mode: ColorMode): string {
  const s = styles(mode);
  switch (action) {
    case 'create':
      return s.green('+');
    case 'update':
      return s.yellow('~');
    case 'delete':
      return s.red('-');
  }
}

/**
 * Return a severity badge, always 5 visible characters wide (with trailing space
 * where needed) so badges in different rows align vertically.
 */
export function badge(severity: WarningSeverity, mode: ColorMode): string {
  const s = styles(mode);
  switch (severity) {
    case 'error':
      return s.red(s.bold('ERROR'));
    case 'warn':
      return s.yellow('WARN ');
    case 'info':
      return s.cyan('INFO ');
  }
}

/**
 * Pad `s` to `width` characters using trailing spaces.
 * NOTE: call pad() on raw (unstyled) text. ANSI escape sequences inflate
 * string length without adding visible width, so padding after styling
 * would produce the wrong column alignment.
 */
export function pad(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

/**
 * Return a path relative to `cwd` when the result is actually contained
 * within `cwd` (i.e. does not start with `..` or `/`). Otherwise return
 * `absPath` unchanged.
 */
export function relPath(absPath: string, cwd: string): string {
  const rel = path.relative(cwd, absPath);
  if (rel.startsWith('..') || rel.startsWith('/')) {
    return absPath;
  }
  return rel;
}

/**
 * Render a two-column list. Each row: `<left>  <gray(right)>`.
 * Returns the full string including a trailing newline.
 */
export function renderList(rows: { left: string; right?: string }[], mode: ColorMode): string {
  const s = styles(mode);
  return rows.map((r) => (r.right !== undefined ? `${r.left}  ${s.gray(r.right)}` : r.left)).join('\n') + '\n';
}

/**
 * Render a single success line: `✓ <message>\n`.
 */
export function renderSuccess(message: string, mode: ColorMode): string {
  const s = styles(mode);
  return `${s.green('✓')} ${message}\n`;
}

/**
 * Render an empty-state message dimmed in gray: `<gray(message)>\n`.
 */
export function renderEmpty(message: string, mode: ColorMode): string {
  const s = styles(mode);
  return `${s.gray(message)}\n`;
}
