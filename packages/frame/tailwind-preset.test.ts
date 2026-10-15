// vitest: path arithmetic only.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { frameContent, frameTailwindPreset } from './tailwind-preset';

const cleanerDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/cleaner');
const globDir = (g: string) => g.slice(0, g.indexOf('/**'));

describe('frameContent', () => {
  const globs = frameContent(cleanerDir, ['optimizer']);

  it('scans the app, the frame and the optimizer renderer', () => {
    expect(globs.some((g) => g.includes('/apps/cleaner/src/'))).toBe(true);
    expect(globs.some((g) => g.includes('/packages/frame/src/'))).toBe(true);
    expect(globs.some((g) => g.includes('/packages/features/optimizer/renderer/'))).toBe(true);
  });

  it('every glob directory exists', () => {
    for (const g of globs.filter((x) => !x.includes('node_modules'))) {
      expect(existsSync(globDir(g)), g).toBe(true);
    }
  });
});

describe('frameTailwindPreset', () => {
  it('carries the z-index ladder and token colours', () => {
    expect(frameTailwindPreset.theme.extend.zIndex.dialog).toBe('90');
    expect(frameTailwindPreset.theme.extend.colors.popover.DEFAULT).toBe('hsl(var(--popover))');
  });
});
