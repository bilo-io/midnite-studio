// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { CREATOR_REPO_ID as MAIN_REPO_ID } from '../main/context';
import { CREATOR_REPO_ID } from './compose/creator-host';
import { CreatorApp } from './creator-app';
import { CREATOR_APP, CREATOR_TABS } from './creator-manifest';

const ok = <T,>(value: T) => ({ ok: true as const, value });
const media = {
  project: {
    list: vi.fn().mockResolvedValue(ok([{ name: 'notes', fileCount: 1, mtimeMs: 1 }])),
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
  },
  file: {
    list: vi.fn().mockResolvedValue(ok([])),
    read: vi.fn(),
    write: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
  },
  image: {
    providers: vi.fn().mockResolvedValue({ providers: [] }),
    generate: vi.fn(),
    cancel: vi.fn(),
    onProgress: vi.fn(() => () => undefined),
  },
  reveal: vi.fn(),
  ffmpegStatus: vi.fn().mockResolvedValue({ ffmpeg: { found: false, reason: 'no ffmpeg' } }),
  export: vi.fn(),
  cancelExport: vi.fn(),
  onChanged: vi.fn(() => () => undefined),
  onExportProgress: vi.fn(() => () => undefined),
  doc: { export: vi.fn() },
};

beforeEach(() => {
  localStorage.clear();
  window.midniteStudio = { media } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
  vi.clearAllMocks();
});

describe('Creator composition', () => {
  it('owns the media folder, and composes its shell plus the two tab packages placed with it', () => {
    expect(placementOwners(FEATURE_PLACEMENT.media)[0]).toBe(CREATOR_APP.id);
    expect(FEATURE_PACKAGE_SPLITS['media-docs'].placement).toBe(CREATOR_APP.id);
    expect(FEATURE_PACKAGE_SPLITS['media-images'].placement).toBe(CREATOR_APP.id);
  });

  it('registers Docs then Images, and nothing else', () => {
    expect(CREATOR_TABS.map((t) => t.id)).toEqual(['doc', 'image']);
  });

  it("wears the launcher catalog's accent", () => {
    expect(CREATOR_APP.accent).toBe('#ec4899');
  });

  it('scopes media to the repo id its main process serves', () => {
    expect(CREATOR_REPO_ID).toBe(MAIN_REPO_ID);
  });
});

describe('Creator home view', () => {
  it('opens on Docs with only Docs and Images in the strip, reading its own media root', async () => {
    render(<CreatorApp />);
    expect(screen.getByText('Midnite Creator')).toBeDefined();
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['Docs', 'Images']);
    await waitFor(() => expect(media.project.list).toHaveBeenCalledWith({ repoId: 'creator', tab: 'doc' }));
    expect(await screen.findByText('No doc open')).toBeDefined();
  });

  it('switches to Images and shows the plain create form', async () => {
    render(<CreatorApp />);
    fireEvent.click(screen.getByRole('tab', { name: 'Images' }));
    expect(await screen.findByRole('form', { name: 'Create image' })).toBeDefined();
    await waitFor(() => expect(media.image.providers).toHaveBeenCalled());
  });
});
