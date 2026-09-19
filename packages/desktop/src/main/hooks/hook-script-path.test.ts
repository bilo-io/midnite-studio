import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

/** Same `vi.mock('electron', …)` pattern as `template-path.test.ts`. */
const electronApp = vi.hoisted(() => ({ isPackaged: false }));
vi.mock('electron', () => ({ app: electronApp }));

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: existsSyncMock }));

Object.defineProperty(process, 'resourcesPath', {
  value: '/Applications/App.app/Contents/Resources',
  configurable: true,
});

afterEach(() => {
  electronApp.isPackaged = false;
  existsSyncMock.mockReset();
});

describe('hookScriptPath', () => {
  it('resolves under process.resourcesPath when packaged', async () => {
    electronApp.isPackaged = true;

    const { hookScriptPath } = await import('./hook-script-path');
    expect(hookScriptPath()).toBe(join(process.resourcesPath, 'hooks', 'prepare-commit-msg.sh'));
  });

  it('resolves to the desktop package source when unpackaged and the packaged path does not exist', async () => {
    electronApp.isPackaged = false;
    existsSyncMock.mockReturnValue(false);

    const { hookScriptPath } = await import('./hook-script-path');
    expect(hookScriptPath()).toBe(
      join(__dirname, '..', '..', 'src', 'main', 'hooks', 'prepare-commit-msg.sh'),
    );
  });

  it('prefers the packaged path when it happens to exist, even unpackaged', async () => {
    electronApp.isPackaged = false;
    existsSyncMock.mockReturnValue(true);

    const { hookScriptPath } = await import('./hook-script-path');
    expect(hookScriptPath()).toBe(join(process.resourcesPath, 'hooks', 'prepare-commit-msg.sh'));
  });
});
