import { describe, expect, it } from 'vitest';

import { migrateAppsToWebApps } from './migrate-web-apps';

describe('migrateAppsToWebApps', () => {
  it('moves every renamed field and keeps its value', () => {
    const out = migrateAppsToWebApps({
      enabledApps: ['spotify', 'youtube'],
      appDiscardIdle: { spotify: true, 'google-calendar': false, youtube: false },
      lastOpenedAppId: 'youtube',
      detachedApps: ['spotify'],
    });
    expect(out).toEqual({
      enabledWebApps: ['spotify', 'youtube'],
      webAppDiscardIdle: { spotify: true, 'google-calendar': false, youtube: false },
      lastOpenedWebAppId: 'youtube',
      detachedWebApps: ['spotify'],
    });
  });

  it('sends the Settings page id apps to web-apps and leaves other pages alone', () => {
    expect(migrateAppsToWebApps({ settingsPage: 'apps' }).settingsPage).toBe('web-apps');
    expect(migrateAppsToWebApps({ settingsPage: 'mcp' }).settingsPage).toBe('mcp');
  });

  it('keeps a value already under the new name', () => {
    const out = migrateAppsToWebApps({ enabledApps: ['spotify'], enabledWebApps: ['youtube'] });
    expect(out.enabledWebApps).toEqual(['youtube']);
    expect('enabledApps' in out).toBe(false);
  });

  it('is a no-op on a blob with none of the old names', () => {
    expect(migrateAppsToWebApps({ layout: {} })).toEqual({ layout: {} });
  });
});
