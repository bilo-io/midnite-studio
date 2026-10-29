// vitest/jsdom: no browser capability needed. The PNGs are read as inlined data URLs through Vite's
// glob (the renderer may not import node builtins), so equal strings mean byte-identical files.
import { SUITE_APP_IDS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { appLogoUrl } from './app-logo';

const FRAME = import.meta.glob<string>('./app-logos/*.png', { eager: true, query: '?inline', import: 'default' });
const LAUNCHER = import.meta.glob<string>('../../../../apps/launcher/src/renderer/assets/app-logos/*.png', {
  eager: true,
  query: '?inline',
  import: 'default',
});
const launcherLogo = (id: string): string | undefined =>
  LAUNCHER[`../../../../apps/launcher/src/renderer/assets/app-logos/${id}.png`];

describe('app logos', () => {
  it('finds the launcher’s logos at all (guards the glob path)', () => {
    expect(Object.keys(LAUNCHER).length).toBeGreaterThanOrEqual(SUITE_APP_IDS.length);
  });

  it.each(SUITE_APP_IDS)('%s has a logo that is byte-identical to the launcher’s', (id) => {
    expect(typeof appLogoUrl(id)).toBe('string');
    const mine = FRAME[`./app-logos/${id}.png`];
    expect(mine).toBeTruthy();
    expect(mine).toBe(launcherLogo(id));
  });

  it('has no logo beyond the suite ids', () => {
    expect(Object.keys(FRAME)).toHaveLength(SUITE_APP_IDS.length);
  });

  it('throws for an id with no file', () => {
    expect(() => appLogoUrl('nope' as never)).toThrow(/No logo/);
  });
});
