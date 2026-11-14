import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { PermissionsPage } from './permissions-page';

const row = (id: string, state: string, resettable = true) => ({ id, state, checkedAt: 1, paneUrl: `pane:${id}`, resettable });
const ROWS = [row('screen', 'granted'), row('camera', 'denied'), row('fullDisk', 'denied'), row('automation', 'unchecked'), row('notifications', 'unchecked', false)];

function install(over: Record<string, unknown> = {}) {
  const permissions = {
    status: vi.fn(async () => ({ supported: true, bundleId: 'io.bilo.midnite-studio', rows: ROWS })),
    openPane: vi.fn(async () => ({ ok: true })),
    reset: vi.fn(async () => ({ ok: true })),
    relaunch: vi.fn(async () => undefined),
    ...over,
  };
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { permissions };
  return permissions;
}

function renderPage() {
  const handle = createFrameChrome();
  render(
    <FrameChromeProvider chrome={handle.chrome}>
      <PermissionsPage />
    </FrameChromeProvider>,
  );
}

describe('PermissionsPage', () => {
  beforeEach(() => install());
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders a row per permission with its state', async () => {
    renderPage();
    expect((await screen.findByTestId('permission-row-screen')).textContent).toContain('Granted');
    expect((screen.getByTestId('permission-row-camera')).textContent).toContain('Not granted');
    expect((screen.getByTestId('permission-row-automation')).textContent).toContain('Asked on first use');
  });

  it('re-fetches when the window regains focus', async () => {
    const p = install();
    renderPage();
    await screen.findByTestId('permission-row-screen');
    expect(p.status).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(p.status).toHaveBeenCalledTimes(2));
  });

  it('opens the exact pane for a row', async () => {
    const p = install();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Open System Settings for Camera' }));
    expect(p.openPane).toHaveBeenCalledWith({ id: 'camera' });
  });

  it('offers reset only on resettable rows', async () => {
    renderPage();
    await screen.findByTestId('permission-row-screen');
    expect(screen.getByRole('button', { name: 'Reset Screen Recording', hidden: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset Notifications', hidden: true })).toBeNull();
  });

  it('does not reset until the destructive confirm is accepted', async () => {
    const p = install();
    renderPage();
    await screen.findByTestId('permission-row-screen');
    fireEvent.click(screen.getByRole('button', { name: 'Reset Screen Recording', hidden: true }));
    expect(p.reset).not.toHaveBeenCalled();
  });

  it('says it is macOS-only and hides the actions when unsupported', async () => {
    install({ status: vi.fn(async () => ({ supported: false, bundleId: 'x', rows: ROWS.map((r) => ({ ...r, state: 'unknown' })) })) });
    renderPage();
    expect(await screen.findByText(/only does something on a Mac/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open System Settings/ })).toBeNull();
  });
});
