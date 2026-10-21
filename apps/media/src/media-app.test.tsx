// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { MediaApp } from './media-app';
import { MEDIA_APP, MEDIA_TABS } from './media-manifest';

const library = {
  roots: vi.fn().mockResolvedValue({ roots: [] }),
  addRoot: vi.fn().mockResolvedValue({ ok: true, value: { root: null } }),
  removeRoot: vi.fn(),
  scan: vi.fn(),
  items: vi.fn().mockResolvedValue({ items: [] }),
  progress: vi.fn(),
  clearProgress: vi.fn(),
  settings: vi.fn().mockResolvedValue({
    settings: { onlineMetadata: false, onlineProvider: 'tmdb' },
    onlineKeyAvailable: false,
  }),
  setSettings: vi.fn().mockResolvedValue({ ok: true }),
  onChanged: vi.fn(() => () => undefined),
  onScanProgress: vi.fn(() => () => undefined),
};
const media = { library, onChanged: vi.fn(() => () => undefined) };

beforeEach(() => {
  localStorage.clear();
  window.midniteStudio = { media } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
  vi.clearAllMocks();
});

describe('Media composition', () => {
  it('is placed with the media folder, and the Library feature is placed with it alone', () => {
    expect(placementOwners(FEATURE_PLACEMENT.media)).toContain(MEDIA_APP.id);
    expect(FEATURE_PACKAGE_SPLITS['media-library'].placement).toBe(MEDIA_APP.id);
  });

  it('registers the Library tab, and nothing else', () => {
    expect(MEDIA_TABS.map((t) => t.id)).toEqual(['library']);
  });

  it("wears the launcher catalog's accent", () => {
    expect(MEDIA_APP.accent).toBe('#facc15');
  });
});

describe('Media home view', () => {
  it('opens on the Library with only it in the strip, and offers to add a folder', async () => {
    render(<MediaApp />);
    expect(screen.getByText('Midnite Media')).toBeDefined();
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['Library']);
    await waitFor(() => expect(library.roots).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Add a folder…' }));
    await waitFor(() => expect(library.addRoot).toHaveBeenCalled());
  });

  it('keeps online metadata off and points at Vault for the key — no key field in this renderer', async () => {
    render(<MediaApp />);
    const toggle = (await screen.findByRole('switch')) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getByText('Off: nothing leaves this computer.')).toBeDefined();
    expect(screen.getByText('Add a TMDB key in Vault and grant it to Midnite Media.')).toBeDefined();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
  });
});
