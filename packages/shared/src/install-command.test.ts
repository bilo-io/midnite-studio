import { describe, expect, it } from 'vitest';

import {
  installCommand,
  installerUrl,
  MIDNITE_INSTALL_COMMAND,
  MIDNITE_SITE_ORIGIN,
} from './install-command';

describe('install command', () => {
  it('curls the live site root by default', () => {
    expect(MIDNITE_INSTALL_COMMAND).toBe(
      'curl -fsSL https://midnite-studio-website.vercel.app/install.sh | sh',
    );
    expect(installCommand()).toBe(MIDNITE_INSTALL_COMMAND);
    expect(installerUrl()).toBe(`${MIDNITE_SITE_ORIGIN}/install.sh`);
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
