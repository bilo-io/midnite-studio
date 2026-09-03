import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { hasMidniteDir, hasPackagedBuild, isMidniteStudioCheckout } from './repo-capability';

function installBridge(overrides: {
  listDir?: (req: unknown) => unknown;
  readFile?: (req: unknown) => unknown;
} = {}) {
  const listDir = vi.fn(overrides.listDir ?? (() => ({ ok: true, entries: [] })));
  const readFile = vi.fn(overrides.readFile ?? (() => ({ kind: 'missing' })));
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    fs: { listDir, readFile } as unknown as MidniteStudioBridge['fs'],
  } as Partial<MidniteStudioBridge>;
  return { listDir, readFile };
}

describe('hasMidniteDir', () => {
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('is true when the checkout root lists a .midnite entry', async () => {
    installBridge({ listDir: () => ({ ok: true, entries: [{ name: '.midnite' }, { name: 'src' }] }) });
    expect(await hasMidniteDir('r1')).toBe(true);
  });

  it('is false when there is no .midnite entry', async () => {
    installBridge({ listDir: () => ({ ok: true, entries: [{ name: 'src' }] }) });
    expect(await hasMidniteDir('r1')).toBe(false);
  });

  it('is false when the listing itself fails', async () => {
    installBridge({ listDir: () => ({ ok: false }) });
    expect(await hasMidniteDir('r1')).toBe(false);
  });

  it('is false with no bridge at all', async () => {
    expect(await hasMidniteDir('r1')).toBe(false);
  });
});

describe('isMidniteStudioCheckout', () => {
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('is true when install-local.mjs reads as text', async () => {
    installBridge({ readFile: () => ({ kind: 'text', content: '// script' }) });
    expect(await isMidniteStudioCheckout('r1')).toBe(true);
  });

  it('is false when the file is missing', async () => {
    installBridge({ readFile: () => ({ kind: 'missing' }) });
    expect(await isMidniteStudioCheckout('r1')).toBe(false);
  });
});

describe('hasPackagedBuild', () => {
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('is true when the .app bundle is listed', async () => {
    installBridge({
      listDir: () => ({ ok: true, entries: [{ name: 'Midnite Studio.app' }] }),
    });
    expect(await hasPackagedBuild('r1')).toBe(true);
  });

  it('is false when the release directory does not exist', async () => {
    installBridge({ listDir: () => ({ ok: false }) });
    expect(await hasPackagedBuild('r1')).toBe(false);
  });
});
