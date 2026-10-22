// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vanguardManifest } from '@midnite/studio-feature-vanguard/renderer';
import { FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { VanguardApp } from './vanguard-app';
import { VANGUARD_APP } from './vanguard-manifest';

let onReportOpen: (() => void) | null = null;

beforeEach(() => {
  window.midniteStudio = {
    vanguard: {
      findings: { list: vi.fn().mockResolvedValue({ findings: [] }), onChanged: () => () => undefined },
      sensors: vi.fn().mockResolvedValue({ sensors: [], active: true }),
      viewOpened: vi.fn().mockResolvedValue({ sensors: [], active: true }),
      onChanged: () => () => undefined,
    },
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/vanguard.log' }),
      bundle: vi.fn().mockResolvedValue({ text: 'boot' }),
      ghStatus: vi.fn().mockResolvedValue({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' }),
      onOpen: (handler: () => void) => {
        onReportOpen = handler;
        return () => undefined;
      },
    },
  } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Vanguard composition', () => {
  it('is the owner the placement map names for the vanguard feature', () => {
    expect(placementOwners(FEATURE_PLACEMENT.vanguard)[0]).toBe(VANGUARD_APP.id);
    expect(VANGUARD_APP.features).toEqual([vanguardManifest.feature]);
  });

  it('opens on a view the vanguard feature registers', () => {
    expect([...FEATURE_VIEWS.vanguard]).toContain(VANGUARD_APP.home);
  });

  it("wears the launcher catalog's accent", () => {
    expect(VANGUARD_APP.accent).toBe('#e11d48');
  });
});

describe('Vanguard home view', () => {
  it('renders the vanguard view framed as Vanguard, and tells main the view was opened', async () => {
    render(<VanguardApp />);
    expect(screen.getByText('Midnite Vanguard')).toBeDefined();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Vanguard' })).toBeDefined());
    expect(window.midniteStudio!.vanguard.viewOpened).toHaveBeenCalled();
  });
});

describe('Vanguard Report an Issue', () => {
  it('mounts the dialog for midnite-vanguard: the Help menu event opens it', async () => {
    render(<VanguardApp />);
    await waitFor(() => expect(onReportOpen).not.toBeNull());
    expect(screen.queryByText('Report an issue')).toBeNull();
    act(() => onReportOpen?.());
    expect(await screen.findByText('Report an issue')).toBeDefined();
  });
});
