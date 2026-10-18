import { existsSync, readFileSync, statSync } from 'node:fs';
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

  // The Dock shows the launcher's Studio tile, not the plain crescent above — which stays as the base every
  // suite logo is drawn from (`apps/launcher/scripts/app-icons.cjs` writes icon-suite.icns).
  it('packs the launcher tile as the app icon', () => {
    const builder = readFileSync(join(__dirname, '../../electron-builder.yml'), 'utf8');
    expect(builder).toMatch(/^\s+icon: resources\/icon-suite\.icns$/m);
    const suite = join(resourcesDir, 'icon-suite.icns');
    expect(readFileSync(suite).subarray(0, 4).toString('ascii')).toBe('icns');
    expect(statSync(suite).size).toBeGreaterThan(100_000);
  });
});
