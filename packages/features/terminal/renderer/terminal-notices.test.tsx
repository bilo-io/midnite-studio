// vitest/jsdom: the previous-build notice's copy and its Permissions link, under a host that supplies the action.
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultTerminalHost } from './default-host';
import { TerminalHostProvider } from './host';
import { LegacyNotice } from './terminal-notices';
import { useTerminalStore } from './terminal-store';

afterEach(() => {
  cleanup();
  useTerminalStore.setState({ legacy: {}, legacyBannerDismissed: false });
});

describe('LegacyNotice', () => {
  it('explains that macOS grants do not apply and links to Settings ▸ Permissions', () => {
    useTerminalStore.setState({ legacy: { a: true }, legacyBannerDismissed: false });
    const openPermissions = vi.fn();
    const base = createDefaultTerminalHost('studio');
    const host = { ...base, actions: { ...base.actions, openPermissions } };
    render(
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <TerminalHostProvider host={host}>
          <LegacyNotice sessions={[]} />
        </TerminalHostProvider>
      </FrameChromeProvider>,
    );
    expect(screen.getByTestId('terminal-legacy-notice').textContent).toMatch(/permissions granted to this version don't apply/);
    fireEvent.click(screen.getByRole('button', { name: 'Permissions' }));
    expect(openPermissions).toHaveBeenCalledTimes(1);
  });
});
