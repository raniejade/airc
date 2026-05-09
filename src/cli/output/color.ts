import pc from 'picocolors';

export type ColorMode = { color: boolean };
export type Style = (s: string) => string;

/**
 * Detect whether color output should be enabled.
 *
 * Precedence (highest first):
 * 1. plainFlag === true  → color off
 * 2. FORCE_COLOR set and not '0' → color on
 * 3. NO_COLOR set (any non-empty value) → color off
 * 4. CI set and not '0'/'false'/'no' (case-insensitive) → color off
 * 5. !process.stdout.isTTY → color off
 * 6. else → color on
 */
export function detectColorMode(opts: { plainFlag: boolean }): ColorMode {
  if (opts.plainFlag) {
    return { color: false };
  }
  const forceColor = process.env.FORCE_COLOR;
  if (forceColor !== undefined && forceColor !== '0') {
    return { color: true };
  }
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') {
    return { color: false };
  }
  const ci = process.env.CI;
  if (ci !== undefined && ci !== '') {
    const lower = ci.toLowerCase();
    if (lower !== '0' && lower !== 'false' && lower !== 'no') {
      return { color: false };
    }
  }
  if (!process.stdout.isTTY) {
    return { color: false };
  }
  return { color: true };
}

const identity: Style = (s) => s;

/**
 * Return style functions. When color is disabled, all functions are identity.
 * picocolors is only used inside this module.
 */
export function styles(mode: ColorMode): {
  dim: Style;
  bold: Style;
  green: Style;
  yellow: Style;
  red: Style;
  cyan: Style;
  gray: Style;
} {
  if (!mode.color) {
    return {
      dim: identity,
      bold: identity,
      green: identity,
      yellow: identity,
      red: identity,
      cyan: identity,
      gray: identity,
    };
  }
  return {
    dim: pc.dim,
    bold: pc.bold,
    green: pc.green,
    yellow: pc.yellow,
    red: pc.red,
    cyan: pc.cyan,
    gray: pc.gray,
  };
}
