// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notesManifest, useNotesStore } from '@midnite/studio-feature-notes/renderer';
import { FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { MindApp } from './mind-app';
import { MIND_APP } from './mind-manifest';

const notes = {
  list: vi.fn().mockResolvedValue({ notes: [] }),
  save: vi.fn(),
  delete: vi.fn(),
  reorder: vi.fn(),
};

let onReportOpen: (() => void) | null = null;
const report = {
  onOpen: vi.fn((handler: () => void) => {
    onReportOpen = handler;
    return () => undefined;
  }),
  bundle: vi.fn(async () => ({ text: '' })),
  ghStatus: vi.fn(async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' })),
};

beforeEach(() => {
  useNotesStore.setState({ notes: {}, hydrated: false, selectedNoteId: null });
  window.midniteStudio = { notes, report } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
  vi.clearAllMocks();
});

describe('Mind composition', () => {
  it('is the owner the placement map names for the notes feature', () => {
    expect(placementOwners(FEATURE_PLACEMENT.notes)[0]).toBe(MIND_APP.id);
    expect(MIND_APP.features).toEqual([notesManifest.feature]);
  });

  it('opens on a view the notes feature registers', () => {
    expect([...FEATURE_VIEWS.notes]).toContain(MIND_APP.home);
  });

  it("wears the launcher catalog's accent", () => {
    expect(MIND_APP.accent).toBe('#0ea5e9');
  });
});

describe('Mind home view', () => {
  it('opens the notes view framed as Mind, with an honest empty notebook and a Knowledge tab', async () => {
    render(<MindApp />);
    expect(screen.getByText('Midnite Mind')).toBeDefined();
    await waitFor(() => expect(screen.getByText(/your notebook is empty/i)).toBeDefined());
    expect(notes.list).toHaveBeenCalled();
    expect(screen.getByTestId('mind-tab-notes').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('mind-tab-knowledge').getAttribute('aria-selected')).toBe('false');
  });

  it('the Knowledge tab graphs the notebook through the frame view, and says so when there is nothing to graph', async () => {
    const knowledge = {
      getGraph: vi.fn().mockResolvedValue({ ok: false, kind: 'absent' }),
      getNodeDetail: vi.fn(),
      checkGraph: vi.fn().mockResolvedValue({ exists: false }),
      onLayoutProgress: vi.fn(() => () => {}),
    };
    window.midniteStudio = { notes, knowledge, report } as unknown as typeof window.midniteStudio;
    render(<MindApp />);
    fireEvent.click(screen.getByTestId('mind-tab-knowledge'));
    expect(await screen.findByText(/nothing to graph yet/i)).toBeDefined();
    expect(knowledge.getGraph).toHaveBeenCalledWith(expect.objectContaining({ repoId: 'mind' }));
    // The frame's graphify instructions are for a repository; a notebook never shows them.
    expect(screen.queryByText(/hasn't been graphified/i)).toBeNull();
  });

  it('captures a note into the one notebook and writes it through the bridge', async () => {
    render(<MindApp />);
    const composer = await screen.findByTestId('notes-composer');
    fireEvent.change(composer, { target: { value: 'First thought' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(notes.save).toHaveBeenCalledTimes(1));
    expect(notes.save.mock.calls[0]?.[0]).toMatchObject({ note: { repoId: 'mind', body: 'First thought' } });
    expect(screen.getAllByLabelText('Draft plan').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('Mind Report an Issue', () => {
  it('mounts the dialog for midnite-mind: the Help menu event opens it', async () => {
    render(<MindApp />);
    await waitFor(() => expect(onReportOpen).not.toBeNull());
    expect(screen.queryByText('Report an issue')).toBeNull();
    act(() => onReportOpen?.());
    expect(await screen.findByText('Report an issue')).toBeDefined();
  });
});
