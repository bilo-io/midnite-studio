import { describe, expect, it } from 'vitest';

import {
  appIndexFromHash,
  appLogoHref,
  appsIn,
  FRAME_PARTS,
  SITE_APPS,
  spectrumVars,
} from './catalog';

/**
 * The logos that actually exist under `public/img/apps/`, by basename. Through
 * `import.meta.glob`, not `node:fs`, which the website's eslint boundary denies.
 */
const logoFiles = Object.keys(
  import.meta.glob('../../public/img/apps/*.png', { eager: true, query: '?url', import: 'default' }),
).map((path) => path.split('/').pop());

const HEX = /^#[0-9a-f]{6}$/i;

describe('SITE_APPS', () => {
  it('has unique, URL-safe ids, because each one is a published #fragment', () => {
    const ids = SITE_APPS.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('ships a logo for every app, and for the launcher', () => {
    for (const id of ['launcher', ...SITE_APPS.map((app) => app.id)]) {
      expect(logoFiles, `public/img/apps/${id}.png`).toContain(`${id}.png`);
    }
    expect(appLogoHref('coder')).toBe('/img/apps/coder.png');
  });

  it('gives every app a four-stop spectrum of hex colours', () => {
    for (const app of SITE_APPS) {
      expect(app.spectrum, app.id).toHaveLength(4);
      for (const stop of app.spectrum) expect(stop, app.id).toMatch(HEX);
    }
    expect(spectrumVars(SITE_APPS[0]!.spectrum)).toEqual({
      '--app-c1': SITE_APPS[0]!.spectrum[0],
      '--app-c2': SITE_APPS[0]!.spectrum[1],
      '--app-c3': SITE_APPS[0]!.spectrum[2],
      '--app-c4': SITE_APPS[0]!.spectrum[3],
    });
  });

  it('fills in every piece of copy a hero renders', () => {
    for (const app of SITE_APPS) {
      expect(app.tagline, app.id).not.toBe('');
      expect(app.vision, app.id).not.toBe('');
      expect(app.features.length, app.id).toBeGreaterThan(0);
    }
  });

  it('splits into the launcher’s two groups with nothing left over', () => {
    expect(appsIn('suite').length + appsIn('utilities').length).toBe(SITE_APPS.length);
    expect(appsIn('utilities').map((app) => app.id)).toEqual(['cleaner', 'vault', 'capture', 'monitor']);
  });

  it('lists the eight parts of the frame', () => {
    expect(FRAME_PARTS).toHaveLength(8);
  });
});

describe('appIndexFromHash', () => {
  it('finds an app by its fragment, and nothing for anything else', () => {
    expect(appIndexFromHash('#coder')).toBe(SITE_APPS.findIndex((app) => app.id === 'coder'));
    expect(appIndexFromHash('#nope')).toBeNull();
    expect(appIndexFromHash('')).toBeNull();
  });
});
