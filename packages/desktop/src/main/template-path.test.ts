import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `vi.mock('electron', …)` pattern `browser-service.test.ts` and
 * `menu.test.ts` already use. `app` is a plain mutable object rather than a
 * getter, so a test can flip `isPackaged` between cases.
 */
const electronApp = vi.hoisted(() => ({ isPackaged: false }));
vi.mock('electron', () => ({ app: electronApp }));

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: existsSyncMock }));

// `process.resourcesPath` only exists inside a real Electron process — plain
// vitest has no such property, but `templateRoot()` reads it unconditionally
// (to build the packaged candidate path it checks even on the unpackaged
// branch), so every case here needs it defined.
Object.defineProperty(process, 'resourcesPath', {
  value: '/Applications/App.app/Contents/Resources',
  configurable: true,
});

afterEach(() => {
  electronApp.isPackaged = false;
  existsSyncMock.mockReset();
});

describe('templateRoot', () => {
  it('resolves under process.resourcesPath when packaged', async () => {
    electronApp.isPackaged = true;

    const { templateRoot } = await import('./template-path');
    expect(templateRoot()).toBe(join(process.resourcesPath, 'templates', 'midnite'));
  });

  it('resolves to the repo root when unpackaged and the packaged path does not exist', async () => {
    electronApp.isPackaged = false;
    existsSyncMock.mockReturnValue(false);

    const { templateRoot } = await import('./template-path');
    expect(templateRoot()).toBe(join(__dirname, '..', '..', '..', '..', 'templates', 'midnite'));
  });

  it('prefers the packaged path when it happens to exist, even unpackaged', async () => {
    // `window.ts`'s `rendererEntry()` has this same escape hatch — running a
    // production build via `electron .` without packaging first.
    electronApp.isPackaged = false;
    existsSyncMock.mockReturnValue(true);

    const { templateRoot } = await import('./template-path');
    expect(templateRoot()).toBe(join(process.resourcesPath, 'templates', 'midnite'));
  });
});
