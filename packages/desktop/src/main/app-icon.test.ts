import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop app icon assets', () => {
  const resourcesDir = join(__dirname, '../../resources');
  const iconPng = join(resourcesDir, 'icon.png');
  const iconIcns = join(resourcesDir, 'icon.icns');

  it('provides icon.png and icon.icns in resources', () => {
    expect(existsSync(iconPng)).toBe(true);
    expect(existsSync(iconIcns)).toBe(true);
  });

  it('has substantial non-zero size for both files', () => {
    const pngStat = statSync(iconPng);
    const icnsStat = statSync(iconIcns);
    // 512x512 PNG should be > 20KB
    expect(pngStat.size).toBeGreaterThan(20_000);
    // macOS icns bundle with multiple mipmaps should be > 100KB
    expect(icnsStat.size).toBeGreaterThan(100_000);
  });
});
