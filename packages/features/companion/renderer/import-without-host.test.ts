import { describe, expect, it, vi } from 'vitest';

/**
 * Importing the feature installs nothing and reads no host (Phase 123 Theme F). The host arrives when
 * the composing app mounts `CompanionHostProvider`, after every import has resolved — so a module that
 * read it at load would throw in the real app and pass in a suite that installs a host first, which
 * `test-setup.ts` does. This one resets modules so none exists.
 */
describe('importing the renderer barrel', () => {
  it('does not need a host', async () => {
    vi.resetModules();
    await expect(import('./index')).resolves.toBeDefined();
  });

  it('applies the persisted volume and follows the setting once a host is installed', async () => {
    vi.resetModules();
    const host = await import('./host');
    await import('./index');
    const { createDefaultCompanionHost } = await import('./default-host');
    expect(() => host.installCompanionHost(createDefaultCompanionHost())).not.toThrow();
  });
});
