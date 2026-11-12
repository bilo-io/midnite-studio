import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VersionNotesPanel } from './version-notes-panel';

const mocks = vi.hoisted(() => ({
  bundle: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock('./release-notes', () => ({
  useReleaseNotes: () => ({
    data: {
      version: '0.3.1',
      notes: null,
      error: null,
      sections: [
        { version: '0.3.1', date: '2026-03-03', body: '- current' },
        { version: '0.3.0', date: '2026-03-01', body: '- previous one' },
        { version: '0.2.9', body: '- older' },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('@midnite/studio-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midnite/studio-frame')>()),
  // The report feature's dialog: `ghStatus` keeps it on the fallback, `openUrl` is how it leaves.
  bridge: () => ({
    report: {
      bundle: mocks.bundle,
      ghStatus: async () => ({ reason: 'not-installed', binPath: null, hint: '' }),
      openUrl: async ({ url }: { url: string }) => {
        mocks.openExternal(url);
        return { ok: true };
      },
    },
  }),
}));

vi.mock('../../services/queries', () => ({
  openExternal: mocks.openExternal,
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
 * new-issue URL directly.
 */
describe('VersionNotesPanel — Report a bug', () => {
  it('opens the composer rather than navigating out immediately', async () => {
    render(<VersionNotesPanel version="0.3.1" />);

    fireEvent.click(screen.getByText('Report a bug'));

    expect(await screen.findByRole('dialog', { name: 'Report an issue' })).not.toBeNull();
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it("the dialog's own fallback still reaches midnite-apps' prefilled issue form", async () => {
    render(<VersionNotesPanel version="0.3.1" />);

    fireEvent.click(screen.getByText('Report a bug'));
    const proceed = await screen.findByRole('button', { name: 'Continue on GitHub' });
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'It broke.' } });
    fireEvent.click(proceed);

    expect(mocks.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('midnite-apps/issues/new?template=bug.yml'),
    );
  });
});

describe('VersionNotesPanel — earlier releases', () => {
  it('lists the previous versions but not the current one', () => {
    render(<VersionNotesPanel version="0.3.1" />);
    const list = screen.getByTestId('earlier-releases');
    expect(list.textContent).toContain('v0.3.0');
    expect(list.textContent).toContain('v0.2.9');
    expect(list.textContent).not.toContain('v0.3.1');
  });
});
