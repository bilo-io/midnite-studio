import { describe, expect, it } from 'vitest';

import {
  installCommand,
  installerUrl,
  MIDNITE_INSTALL_COMMAND,
  MIDNITE_SITE_ORIGIN,
} from './install-command';

describe('install command', () => {
  it('curls the live site root by default', () => {
    expect(installCommand()).toBe(
      'curl -fsSL https://midnite-apps.vercel.app/install.sh | sh',
    );
    expect(installerUrl()).toBe(`${MIDNITE_SITE_ORIGIN}/install.sh`);
  });

  it('keeps the in-app Studio update on the Studio installer', () => {
    expect(MIDNITE_INSTALL_COMMAND).toBe(
      'curl -fsSL https://midnite-apps.vercel.app/install-studio.sh | sh',
    );
  });

  it('builds against another site root without a double slash', () => {
    expect(installerUrl('https://example.test/midnite-apps/midnite-studio/')).toBe(
      'https://example.test/midnite-apps/midnite-studio/install.sh',
    );
    expect(installCommand('https://example.test')).toBe(
      'curl -fsSL https://example.test/install.sh | sh',
    );
  });
});
