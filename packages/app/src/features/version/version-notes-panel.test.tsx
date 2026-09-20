import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VersionNotesPanel } from './version-notes-panel';

const mocks = vi.hoisted(() => ({
  bundle: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock('./release-notes', () => ({
  useReleaseNotes: () => ({ data: { version: '0.3.1', notes: null, error: null }, isLoading: false }),
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ report: { bundle: mocks.bundle } }),
}));

vi.mock('../../services/queries', () => ({
  openExternal: mocks.openExternal,
  // Same reasoning as `crash-reporting.test.tsx`'s identical mock: this
  // file's scope is the wiring (Phase 93 Theme C's "wire both trigger
  // sites"), not the composer's own behaviour, which
  // `report-issue-dialog.test.tsx` already covers.
  useForgeCli: () => ({ data: { reason: 'not-installed', binPath: null, hint: '' } }),
  useSubmitAppIssue: () => ({ mutate: vi.fn(), isPending: false, data: undefined, reset: vi.fn() }),
}));

beforeEach(() => {
  mocks.bundle.mockResolvedValue({ text: '' });
});

afterEach(() => {
  cleanup();
  mocks.bundle.mockReset();
  mocks.openExternal.mockReset();
});

/**
 * Phase 93 Theme C — the release-notes panel's own "Report a bug" copy
 * (Phase 65 Theme E) now opens the same in-app composer
 * `monitor-page.tsx`'s does, rather than calling `openExternal` on the bare
 * `NEW_ISSUE_URL` directly.
 */
describe('VersionNotesPanel — Report a bug', () => {
  it('opens the composer rather than navigating out immediately', async () => {
    render(<VersionNotesPanel version="0.3.1" />);

    fireEvent.click(screen.getByText('Report a bug'));

    expect(await screen.findByRole('dialog', { name: 'Report an issue' })).not.toBeNull();
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it("the dialog's own fallback still reaches the pre-labelled new-issue URL", async () => {
    render(<VersionNotesPanel version="0.3.1" />);

    fireEvent.click(screen.getByText('Report a bug'));
    fireEvent.click(await screen.findByRole('button', { name: 'Open in browser instead' }));

    expect(mocks.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('midnite-apps/issues/new'),
    );
  });
});
