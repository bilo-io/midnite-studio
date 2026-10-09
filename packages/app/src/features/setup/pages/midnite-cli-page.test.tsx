import type { CliStatusResponse, MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MidniteCliPage } from './midnite-cli-page';

/** Phase 98 Theme G — the Midnite CLI page: installed, missing and not-on-PATH. */

const MISSING: CliStatusResponse = { installed: false, path: null, target: null, managed: false };
const INSTALLED: CliStatusResponse = {
  installed: true,
  path: '/usr/local/bin/midnite',
  target: '/usr/local/bin/midnite',
  managed: true,
  onPath: true,
  pathExportLine: null,
};
const OFF_PATH: CliStatusResponse = {
  installed: true,
  path: '/Users/me/.local/bin/midnite',
  target: '/Users/me/.local/bin/midnite',
  managed: true,
  onPath: false,
  pathExportLine: 'export PATH="/Users/me/.local/bin:$PATH"',
};

function installBridge(status: CliStatusResponse, install = vi.fn()) {
  const cli = { status: vi.fn().mockResolvedValue(status), install, uninstall: vi.fn() };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = { cli };
  return cli;
}

const rowStatus = () => screen.getByTestId('setup-status-row').dataset['status'];

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('MidniteCliPage', () => {
  it('says what the command does', () => {
    installBridge(MISSING);
    render(<MidniteCliPage />);
    expect(screen.getByText('midnite open <path>')).toBeTruthy();
    expect(screen.getByText('midnite clone <url>')).toBeTruthy();
  });

  it('installed and on PATH: ready, with no hint', async () => {
    installBridge(INSTALLED);
    render(<MidniteCliPage />);
    await waitFor(() => expect(rowStatus()).toBe('ready'));
    expect(screen.getByText('/usr/local/bin/midnite')).toBeTruthy();
    expect(screen.queryByTestId('setup-cli-path-hint')).toBeNull();
  });

  it('a foreign midnite was left alone: shows the alias-only reason from main', async () => {
    installBridge({
      ...INSTALLED,
      path: '/usr/local/bin/midnite-studio',
      command: 'midnite-studio',
      aliasInstalled: true,
      notice: 'A `midnite` command already exists at /usr/local/bin/midnite and is not Midnite Studio\'s, so it was left untouched.',
    });
    render(<MidniteCliPage />);
    await waitFor(() => expect(rowStatus()).toBe('ready'));
    expect(screen.getByText(/left untouched/)).toBeTruthy();
  });

  it("missing: Install calls cliInstall({target: 'auto'}) and lands on ready", async () => {
    let resolve: (value: unknown) => void = () => {};
    const install = vi.fn(() => new Promise((r) => (resolve = r)));
    installBridge(MISSING, install);
    render(<MidniteCliPage />);
    await waitFor(() => expect(rowStatus()).toBe('missing'));

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(install).toHaveBeenCalledWith({ target: 'auto' });
    expect(rowStatus()).toBe('installing');
    // main symlinks it itself — no terminal to point at.
    expect(screen.queryByRole('button', { name: 'Running in terminal' })).toBeNull();

    resolve({ ok: true, value: INSTALLED });
    await waitFor(() => expect(rowStatus()).toBe('ready'));
  });

  it('a failed install says why and stays missing', async () => {
    installBridge(
      MISSING,
      vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'EACCES' }),
    );
    render(<MidniteCliPage />);
    await waitFor(() => expect(rowStatus()).toBe('missing'));
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect((await screen.findByRole('alert')).textContent).toBe('EACCES');
    expect(rowStatus()).toBe('missing');
  });

  it("installed off PATH: shows main's export line", async () => {
    installBridge(OFF_PATH);
    render(<MidniteCliPage />);
    const hint = await screen.findByTestId('setup-cli-path-hint');
    expect(hint.textContent).toContain('export PATH="/Users/me/.local/bin:$PATH"');
    expect(rowStatus()).toBe('ready');
  });

  it('without a bridge: missing, and Install is disabled', () => {
    render(<MidniteCliPage />);
    expect(rowStatus()).toBe('missing');
    expect((screen.getByRole('button', { name: 'Install' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
