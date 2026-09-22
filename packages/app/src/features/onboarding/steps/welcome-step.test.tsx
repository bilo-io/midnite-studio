import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WelcomeStep } from './welcome-step';

/**
 * Phase 90 Theme I: the three rows this step shows used to be literals
 * ("Git Binary" / "System / Dugite", "/bin/zsh", "midnite-studio") asserted
 * regardless of the machine. This asserts they now come from
 * `window.midniteStudio.systemHealth()` — a machine that reports a different
 * shell shows that shell, not the old hard-coded one.
 */
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

function installHealth(shell: string) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    systemHealth: vi.fn().mockResolvedValue({
      git: { path: '/opt/homebrew/bin/git', version: 'git version 2.46.1' },
      shell,
      sshAgent: { running: false, keys: 0 },
      cli: { installed: true, path: '/usr/local/bin/midnite-studio', target: '/usr/local/bin/midnite-studio', managed: true },
    }),
  };
}

describe('WelcomeStep', () => {
  it('reads the default shell from systemHealth rather than a literal', async () => {
    installHealth('/usr/bin/fish');
    render(<WelcomeStep />);

    expect(await screen.findByText('/usr/bin/fish')).toBeTruthy();
  });

  it('reflects a different shell when the machine reports one', async () => {
    installHealth('/bin/bash');
    render(<WelcomeStep />);

    expect(await screen.findByText('/bin/bash')).toBeTruthy();
    expect(screen.queryByText('/bin/zsh')).toBeNull();
  });

  it('shows the installed CLI path rather than the bare literal name', async () => {
    installHealth('/bin/zsh');
    render(<WelcomeStep />);

    expect(await screen.findByText('Installed at /usr/local/bin/midnite-studio')).toBeTruthy();
  });
});
