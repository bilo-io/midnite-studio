import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { focusDetachedNotes, openNotes, toggleNotes } from './notes-window';

// vitest/jsdom: shortcut routing is a store read plus a bridge call.

describe('Notes shortcuts with a detached window', () => {
  const focusRole = vi.fn();

  beforeEach(() => {
    focusRole.mockClear();
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      window: { focusRole } as unknown as MidniteStudioBridge['window'],
    };
    useUiStore.setState({ notesOpen: false, detachedPages: [] });
  });

  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('opens the modal when Notes is docked', () => {
    openNotes();
    expect(useUiStore.getState().notesOpen).toBe(true);
    expect(focusRole).not.toHaveBeenCalled();
  });

  it('focuses the detached window instead of opening the modal (Mod+L then N)', () => {
    useUiStore.setState({ detachedPages: ['notes'] });
    openNotes();
    expect(focusRole).toHaveBeenCalledWith({ role: 'notes' });
    expect(useUiStore.getState().notesOpen).toBe(false);
  });

  it('notes.toggle focuses the detached window; docked it toggles the modal', () => {
    toggleNotes();
    expect(useUiStore.getState().notesOpen).toBe(true);
    toggleNotes();
    expect(useUiStore.getState().notesOpen).toBe(false);
    useUiStore.setState({ detachedPages: ['notes'] });
    toggleNotes();
    expect(focusRole).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().notesOpen).toBe(false);
  });

  it('falls back to the modal when there is no bridge', () => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useUiStore.setState({ detachedPages: ['notes'] });
    expect(focusDetachedNotes()).toBe(false);
  });
});
