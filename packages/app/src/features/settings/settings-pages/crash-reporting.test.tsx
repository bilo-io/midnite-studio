import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MonitorPage } from './monitor-page';

const mocks = vi.hoisted(() => ({
  logPath: vi.fn(),
  bundle: vi.fn(),
  reveal: vi.fn(),
  openExternal: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    report: { logPath: mocks.logPath, bundle: mocks.bundle, reveal: mocks.reveal },
  }),
}));

vi.mock('../../../services/queries', () => ({
  openExternal: mocks.openExternal,
  useDiagTrust: () => ({ data: undefined }),
  useRepos: () => ({ data: [] }),
  useRunDiagnostics: () => ({ mutate: vi.fn(), isPending: false }),
  useUntrustDiagnostics: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../../services/use-status', () => ({
  useActiveWorktree: () => ({ repoId: null, worktreePath: null }),
}));

/**
 * Phase 65 Theme E — the three controls that make the crash log reachable.
 * Themes A–D shipped the whole machine and none of it had a way in.
 */
describe('Diagnostics ▸ crash reporting', () => {
  beforeEach(() => {
    mocks.logPath.mockResolvedValue({ path: '/Users/you/Library/Logs/midnite-studio/main.ndjson' });
    mocks.bundle.mockResolvedValue({ text: 'boot v1.2.3\nerror: something' });
    mocks.reveal.mockResolvedValue({ ok: true });
    mocks.openExternal.mockReset();
    mocks.writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mocks.writeText },
      configurable: true,
    });
  });

  afterEach(cleanup);

  /*
    The path is printed, not just opened. A user answering "where is your log?"
    on a support thread needs to be able to say it, which a reveal-only button
    cannot help with.
  */
  it('shows the log path beside the reveal button', async () => {
    render(<MonitorPage />);

    await waitFor(() =>
      expect(screen.getByText('/Users/you/Library/Logs/midnite-studio/main.ndjson')).toBeDefined(),
    );
    fireEvent.click(screen.getByText('Reveal log'));
    expect(mocks.reveal).toHaveBeenCalled();
  });

  it('copies the redacted diagnostics bundle and says so', async () => {
    render(<MonitorPage />);

    fireEvent.click(screen.getByTestId('diag-copy-bundle'));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('boot v1.2.3\nerror: something'));
    await waitFor(() => expect(screen.getByText('Copied')).toBeDefined());
  });

  /*
    This copy of Report a bug is the one that matters: `version-pill.tsx` hides
    itself on '0.0.0', so the release-notes panel's link is unreachable in a dev
    build. This accordion renders in every build.
  */
  it('opens the pre-labelled new-issue URL externally', async () => {
    render(<MonitorPage />);

    fireEvent.click(screen.getByText('Report a bug'));

    expect(mocks.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('midnite-apps/issues/new'),
    );
  });

  it('surfaces a reveal failure inline rather than silently doing nothing', async () => {
    mocks.reveal.mockResolvedValue({ ok: false, kind: 'error', message: 'No log written yet.' });
    render(<MonitorPage />);

    fireEvent.click(screen.getByText('Reveal log'));

    await waitFor(() => expect(screen.getByText('No log written yet.')).toBeDefined());
  });
});
