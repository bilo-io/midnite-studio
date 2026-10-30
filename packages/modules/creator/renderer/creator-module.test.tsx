// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSlidesStore } from '@midnite/studio-feature-slides/renderer';
import { FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

// Mounting the Audio Editor tab starts a dynamic import of the Tone.js engine (use-music-engine); a test that
// ends while it is still resolving trips vitest's EnvironmentTeardownError. The engine has its own tests, and
// the empty-state assertion below needs none of it, so stub the hook rather than leave an import in flight.
vi.mock('../../../features/media-audio/renderer/music-editor/engine/use-music-engine', () => ({
  useMusicEngine: () => ({ engine: null, state: 'stopped' }),
}));

import { creatorManifest } from '../manifest';
import { CREATOR_REPO_ID } from './compose/creator-host';
import { CreatorModule as CreatorApp } from './creator-module';
import { CREATOR_TABS } from './creator-tabs';

/** Report an Issue's slice of the bridge: only `onOpen` is read until the dialog opens (the feature's own tests cover the rest). */
let openReport: (() => void) | null = null;
const REPORT_BRIDGE = {
  onOpen: vi.fn((handler: () => void) => {
    openReport = handler;
    return () => undefined;
  }),
  ghStatus: vi.fn(async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' })),
  bundle: vi.fn(async () => ({ text: '' })),
};

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
  audio: {
    providers: vi.fn().mockResolvedValue({ providers: [] }),
    import: vi.fn(),
    onProgress: vi.fn(() => () => undefined),
    generate: vi.fn(),
    cancel: vi.fn(),
    engine: vi.fn().mockResolvedValue({ engine: null }),
    installEngine: vi.fn(),
    onEngineProgress: vi.fn(() => () => undefined),
    expand: vi.fn(),
    gm: {
      status: vi.fn().mockResolvedValue({ cached: [] }),
      ensure: vi.fn(),
      load: vi.fn(),
      onProgress: vi.fn(() => () => undefined),
    },
  },
  music: {
    list: vi.fn().mockResolvedValue(ok([])),
    read: vi.fn(),
    write: vi.fn(),
    import: vi.fn(),
    delete: vi.fn(),
    export: vi.fn(),
    sendToGenerator: vi.fn(),
    onChanged: vi.fn(() => () => undefined),
    onOpen: vi.fn(() => () => undefined),
  },
  reveal: vi.fn(),
  ffmpegStatus: vi.fn().mockResolvedValue({ ffmpeg: { found: false, reason: 'no ffmpeg' } }),
  export: vi.fn(),
  cancelExport: vi.fn(),
  onChanged: vi.fn(() => () => undefined),
  onExportProgress: vi.fn(() => () => undefined),
  doc: { export: vi.fn() },
};

const video = {
  project: { list: vi.fn().mockResolvedValue({ projects: [] }), get: vi.fn(), create: vi.fn(), remove: vi.fn() },
  studio: { start: vi.fn(), stop: vi.fn(), status: vi.fn().mockResolvedValue({ status: { state: 'stopped' } }) },
  render: { start: vi.fn(), cancel: vi.fn(), list: vi.fn().mockResolvedValue({ renders: [] }) },
  toolchain: vi.fn().mockResolvedValue({ toolchain: { node: { found: true, path: '/n' }, npx: { found: true, path: '/x' } } }),
  files: vi.fn().mockResolvedValue({ entries: [] }),
  readFile: vi.fn().mockResolvedValue({ content: null }),
  revealFile: vi.fn(),
  openFile: vi.fn(),
  root: {
    get: vi.fn().mockResolvedValue({ root: null }),
    set: vi.fn(),
    resolve: vi.fn().mockResolvedValue({ root: null, source: null, setupTarget: '/media/.midnite/media/video' }),
  },
  setup: vi.fn().mockResolvedValue({
    ok: true,
    value: { root: '/media/.midnite/media/video', source: 'repo-media', setupTarget: null },
  }),
  engine: { get: vi.fn(), set: vi.fn() },
  onStudioChanged: vi.fn(() => () => undefined),
  onRenderProgress: vi.fn(() => () => undefined),
};

beforeEach(() => {
  localStorage.clear();
  window.midniteStudio = { report: REPORT_BRIDGE, media, video } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
  vi.clearAllMocks();
});

describe('Creator composition', () => {
  it('owns the media folder, and composes its shell plus the two tab packages placed with it', () => {
    expect(placementOwners(FEATURE_PLACEMENT.media)[0]).toBe(creatorManifest.module);
    expect(FEATURE_PACKAGE_SPLITS['media-docs'].placement).toBe(creatorManifest.module);
    expect(FEATURE_PACKAGE_SPLITS['media-images'].placement).toBe(creatorManifest.module);
    expect(FEATURE_PACKAGE_SPLITS['media-audio'].placement).toBe(creatorManifest.module);
    expect(FEATURE_PACKAGE_SPLITS['media-video'].placement).toBe(creatorManifest.module);
  });

  it('registers its tabs in the media strip order, and nothing else', () => {
    expect(CREATOR_TABS.map((t) => t.id)).toEqual(['doc', 'image', 'video', 'audio']);
  });

  it("wears the launcher catalog's accent", () => {
    expect(creatorManifest.accent).toBe('#ec4899');
  });

  it('scopes media to the one repo id both halves read from the manifest', () => {
    expect(CREATOR_REPO_ID).toBe(creatorManifest.module);
  });
});

describe('Creator home view', () => {
  it('opens on Docs with only Docs, Images, Video and Audio in the strip, reading its own media root', async () => {
    render(<CreatorApp />);
    expect(screen.getByText('Midnite Creator')).toBeDefined();
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['Docs', 'Images', 'Video', 'Audio']);
    await waitFor(() => expect(media.project.list).toHaveBeenCalledWith({ repoId: 'creator', tab: 'doc' }));
    expect(await screen.findByText('No doc open')).toBeDefined();
  });

  it('switches to Images and shows the plain create form', async () => {
    render(<CreatorApp />);
    fireEvent.click(screen.getByRole('tab', { name: 'Images' }));
    expect(await screen.findByRole('form', { name: 'Create image' })).toBeDefined();
    await waitFor(() => expect(media.image.providers).toHaveBeenCalled());
  });

  it('Video: sets up the workspace under its media root, and — with no terminal — says what to run', async () => {
    render(<CreatorApp />);
    fireEvent.click(screen.getByRole('tab', { name: 'Video' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Setup Video' }));
    await waitFor(() => expect(video.setup).toHaveBeenCalledWith({ repoId: 'creator', engine: 'remotion' }));
    const hint = await screen.findByTestId('video-install-hint');
    expect(hint.textContent).toContain('npm install');
    expect(hint.textContent).toContain('/media/.midnite/media/video/video-editor');
  });

  it('Audio: the plain prompt form with Import offered, and the music editor as a sub-tab with no song chat', async () => {
    render(<CreatorApp />);
    fireEvent.click(screen.getByRole('tab', { name: 'Audio' }));
    expect(await screen.findByRole('form', { name: 'Create audio' })).toBeDefined();
    await waitFor(() => expect(media.audio.providers).toHaveBeenCalled());
    // The editor is the feature's own, so Creator has it; the chat needs agents, which Creator lacks.
    fireEvent.click(screen.getByRole('tab', { name: 'Editor' }));
    expect(await screen.findByTestId('music-editor-empty')).toBeDefined();
    expect(screen.queryByRole('button', { name: /chat/i })).toBeNull();
  });

  it('Slides: presenting a doc opens its deck over the shell, and Escape closes it', async () => {
    render(<CreatorApp />);
    useSlidesStore.getState().present({ content: '# Launch\n\nfirst point', label: 'plan.md' });
    expect(await screen.findByRole('dialog', { name: 'Presenting plan.md' })).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Presenting plan.md' })).toBeNull());
    expect(useSlidesStore.getState().deck).toBeNull();
  });
});

describe('Report an Issue', () => {
  it("mounts the report feature's host: main's report:open event opens its dialog", async () => {
    openReport = null;
    // The suite bridge already carries `report` (see beforeEach).
    render(<CreatorApp />);
    await waitFor(() => expect(openReport).not.toBeNull());
    act(() => openReport?.());
    expect(await screen.findByTestId('report-issue-dialog')).toBeDefined();
  });
});
