// vitest/jsdom: composition and the home view over a mock bridge — no real screen, stream or clipboard.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureManifest } from '@midnite/studio-feature-capture/renderer';
import {
  CAPTURE_DEFAULT_SETTINGS,
  FEATURE_PACKAGE_SPLITS,
  FEATURE_PLACEMENT,
  featurePackagePlacement,
  type CaptureStatus,
} from '@midnite/studio-shared';

import { CaptureApp } from './capture-app';
import { CAPTURE_APP } from './capture-manifest';

const status: CaptureStatus = {
  permission: 'not-determined',
  settings: { ...CAPTURE_DEFAULT_SETTINGS, shortcut: 'CommandOrControl+Shift+2' },
  shortcut: { state: 'registered', accelerator: 'CommandOrControl+Shift+2' },
  canRecord: true,
  destinations: [],
};

const capture = {
  status: vi.fn(async () => status),
  requestPermission: vi.fn(async () => ({ permission: 'granted' })),
  openPermissionSettings: vi.fn(async () => ({ ok: true })),
  sources: vi.fn(),
  still: vi.fn(),
  regionBegin: vi.fn(),
  regionPending: vi.fn(async () => ({ frame: null })),
  list: vi.fn(async () => ({ captures: [] })),
  setSettings: vi.fn(async () => ({ ok: true, value: status })),
  clipboard: { list: vi.fn(async () => ({ enabled: false, entries: [] })) },
  onChanged: vi.fn(() => () => undefined),
};

beforeEach(() => {
  window.midniteStudio = { capture } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
  vi.clearAllMocks();
});

describe('Capture composition', () => {
  it('is the capture placement, and composes the capture feature alone', () => {
    expect(FEATURE_PLACEMENT.capture).toBe(CAPTURE_APP.id);
    expect(featurePackagePlacement('capture')).toBe(CAPTURE_APP.id);
    expect(CAPTURE_APP.features).toEqual([captureManifest.feature]);
    expect(FEATURE_PACKAGE_SPLITS).not.toHaveProperty('capture');
  });

  it("wears the launcher catalog's accent", () => {
    expect(CAPTURE_APP.accent).toBe('#f97316');
  });
});

describe('Capture home view', () => {
  it('explains the permission before anything is captured, and asks macOS for nothing on open', async () => {
    render(<CaptureApp />);
    expect(screen.getByText('Midnite Capture')).toBeDefined();
    expect(await screen.findByRole('button', { name: 'Ask macOS' })).toBeDefined();
    expect(screen.getByText(/Nothing is uploaded/)).toBeDefined();
    await waitFor(() => expect(capture.status).toHaveBeenCalled());
    expect(capture.requestPermission).not.toHaveBeenCalled();
    expect(capture.sources).not.toHaveBeenCalled();
  });

  it('keeps clipboard history off, and shows the chord this app ships', async () => {
    render(<CaptureApp />);
    const toggle = (await screen.findByRole('switch', {
      name: 'Keep clipboard history',
    })) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect((screen.getByLabelText('Global shortcut') as HTMLInputElement).value).toBe(
      'CommandOrControl+Shift+2',
    );
  });
});
