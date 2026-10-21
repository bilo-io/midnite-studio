import { describe, expect, it, vi } from 'vitest';

import { LAUNCHER_DATA_DIR_NAME } from '@midnite/studio-shared/launcher-data-dir';

import { applyDevIdentity, LAUNCHER_NAME, pinDataDir } from './identity';

const fakeApp = (isPackaged: boolean, withDock = true) => ({
  isPackaged,
  setName: vi.fn(),
  dock: withDock ? { setIcon: vi.fn() } : undefined,
});

describe('applyDevIdentity', () => {
  it('names the app and sets the launcher icon when run from source', () => {
    const app = fakeApp(false);
    expect(applyDevIdentity(app, '/repo/apps/launcher/dist')).toBe(true);
    expect(app.setName).toHaveBeenCalledWith(LAUNCHER_NAME);
    expect(LAUNCHER_NAME).toBe('Midnite Apps');
    expect(app.dock?.setIcon).toHaveBeenCalledWith('/repo/apps/launcher/resources/app-logos/launcher.png');
  });

  it('leaves a packaged build alone — electron-builder already set both', () => {
    const app = fakeApp(true);
    expect(applyDevIdentity(app, '/x/dist')).toBe(false);
    expect(app.setName).not.toHaveBeenCalled();
    expect(app.dock?.setIcon).not.toHaveBeenCalled();
  });

  it('tolerates a platform with no Dock', () => {
    const app = fakeApp(false, false);
    expect(() => applyDevIdentity(app, '/x/dist')).not.toThrow();
    expect(app.setName).toHaveBeenCalled();
  });
});

describe('pinDataDir', () => {
  const fakeDataApp = (isPackaged: boolean) => ({
    isPackaged,
    getPath: vi.fn(() => '/Users/u/Library/Application Support'),
    setPath: vi.fn(),
  });

  it('pins a packaged launcher to Midnite Apps — where the runtime reads installed.json', () => {
    const app = fakeDataApp(true);
    expect(pinDataDir(app)).toBe('/Users/u/Library/Application Support/Midnite Apps');
    expect(app.setPath).toHaveBeenCalledWith('userData', '/Users/u/Library/Application Support/Midnite Apps');
    expect(LAUNCHER_DATA_DIR_NAME).toBe(LAUNCHER_NAME);
  });

  it('gives a run from source its own directory, never the installed launcher\'s', () => {
    const app = fakeDataApp(false);
    expect(pinDataDir(app)).toBe('/Users/u/Library/Application Support/Midnite Apps Dev');
  });
});
