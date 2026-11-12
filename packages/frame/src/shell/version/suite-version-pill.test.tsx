// vitest/jsdom: a popover, a stubbed bridge and markdown text — no real browser capability needed.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseNotes } from '@midnite/studio-shared';

import { SuiteVersionPill } from './suite-version-pill';

const NOTES: ReleaseNotes = {
  version: '0.0.7',
  notes: '### Added\n\n- Brand new thing.',
  error: null,
  sections: [
    { version: '0.0.7', date: '2026-11-20', body: '- Brand new thing.' },
    { version: '0.0.6', date: '2026-11-10', body: '- Older thing.' },
  ],
};

function install(over: Record<string, unknown>) {
  (window as unknown as { midniteStudio: unknown }).midniteStudio = over;
}

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('SuiteVersionPill', () => {
  it('reads the app version, and opens its notes with the earlier releases', async () => {
    const get = vi.fn(async () => NOTES);
    install({ appVersion: '0.0.7', suiteReleaseNotes: { get } });
    render(<SuiteVersionPill app="money" name="Midnite Money" expanded />);
    const pill = screen.getByTestId('suite-version-pill');
    expect(pill.textContent).toBe('v0.0.7');
    fireEvent.click(pill);
    await waitFor(() => expect(screen.getByText('Brand new thing.', { selector: 'li' })).toBeTruthy());
    expect(get).toHaveBeenCalledWith({ latest: 4 });
    expect(screen.getByTestId('earlier-releases').textContent).toContain('v0.0.6');
    expect(screen.getByRole('region', { name: 'Midnite Money release notes' })).toBeTruthy();
    const full = screen.getByRole('link', { name: /Full changelog/ });
    expect(full.getAttribute('href')).toMatch(/midnite-money/);
  });

  it('draws no pill for an unknown version', () => {
    install({ appVersion: '0.0.0', suiteReleaseNotes: { get: async () => NOTES } });
    render(<SuiteVersionPill app="money" name="Midnite Money" expanded />);
    expect(screen.queryByTestId('suite-version-pill')).toBeNull();
  });

  it('draws no pill without the notes slice (Studio’s own bridge)', () => {
    install({ appVersion: '0.0.7' });
    render(<SuiteVersionPill app="money" name="Midnite Money" expanded />);
    expect(screen.queryByTestId('suite-version-pill')).toBeNull();
  });

  it('says so when nothing is published for the build yet', async () => {
    install({ appVersion: '0.0.7', suiteReleaseNotes: { get: async () => ({ version: '0.0.7', notes: null, error: null }) } });
    render(<SuiteVersionPill app="money" name="Midnite Money" expanded />);
    fireEvent.click(screen.getByTestId('suite-version-pill'));
    await waitFor(() => expect(screen.getByText('No published notes for this build yet.')).toBeTruthy());
    expect(screen.getByRole('link', { name: /Release page/ }).getAttribute('href')).toMatch(/releases/);
  });

  it('shows the unavailable copy for an error envelope', async () => {
    install({ appVersion: '0.0.7', suiteReleaseNotes: { get: async () => ({ version: '0.0.7', notes: null, error: 'offline' }) } });
    render(<SuiteVersionPill app="money" name="Midnite Money" expanded />);
    fireEvent.click(screen.getByTestId('suite-version-pill'));
    await waitFor(() => expect(screen.getByText('Release notes are unavailable right now.')).toBeTruthy());
  });
});
