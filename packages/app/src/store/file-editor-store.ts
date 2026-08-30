import { create } from 'zustand';

import type { FsVersion, GitOpResult } from '@midnite/studio-shared';
import { ok } from '@midnite/studio-shared';

import { bridge } from '../services/bridge';

/** Identifies the file a `CodeEditor` instance owns — repo scope only, per `FsWriteScopeSchema`. */
export type FileEditorTarget = {
  repoId: string;
  worktreePath?: string;
  relPath: string;
  /** `${scopeKey}:${relPath}` — lets a fast unmount/remount tell its own `closeFile` apart
   * from a newer instance's, the same guard `commit-box-store`'s `unregister` uses. */
  key: string;
};

type FileEditorState = {
  target: FileEditorTarget | null;
  savedContent: string;
  content: string;
  version: FsVersion | null;
  saving: boolean;
  saveError: string | null;
  /** Set when the last save refused on a moved `FsVersion` — a distinct affordance
   * ("Reload") from an ordinary save failure, never a silent overwrite or discard. */
  staleWrite: boolean;
  /** A navigation blocked by unsaved changes, waiting on the guard dialog's Save/Discard/Cancel. */
  pendingNav: (() => void) | null;
  /** Flipped just before the beforeunload guard re-issues `window.close()`, so that second
   * attempt is let through instead of looping back into the same guard. */
  allowClose: boolean;

  openFile: (target: FileEditorTarget, content: string, version: FsVersion) => void;
  closeFile: (key: string) => void;
  edit: (content: string) => void;
  save: () => Promise<GitOpResult>;
  reloadFromDisk: () => Promise<void>;
  dismissStaleWrite: () => void;

  /** Runs `action` now unless the open file is dirty, in which case it waits on `pendingNav`. */
  guardNavigation: (action: () => void) => void;
  resolvePendingSave: () => Promise<void>;
  resolvePendingDiscard: () => void;
  resolvePendingCancel: () => void;
};

const writeArgs = (target: FileEditorTarget) => ({
  scope: 'repo' as const,
  repoId: target.repoId,
  ...(target.worktreePath ? { worktreePath: target.worktreePath } : {}),
  relPath: target.relPath,
});

export const useFileEditorStore = create<FileEditorState>()((set, get) => ({
  target: null,
  savedContent: '',
  content: '',
  version: null,
  saving: false,
  saveError: null,
  staleWrite: false,
  pendingNav: null,
  allowClose: false,

  openFile: (target, content, version) =>
    set({
      target,
      content,
      savedContent: content,
      version,
      saving: false,
      saveError: null,
      staleWrite: false,
    }),

  closeFile: (key) => {
    if (get().target?.key !== key) return;
    set({
      target: null,
      content: '',
      savedContent: '',
      version: null,
      saving: false,
      saveError: null,
      staleWrite: false,
    });
  },

  edit: (content) => set({ content }),

  save: async () => {
    const { target, content, version } = get();
    if (!target || version === null) return ok();

    set({ saving: true, saveError: null });
    const writeResult = await bridge()!.fs.writeFile({
      ...writeArgs(target),
      content,
      expectedVersion: version,
    });

    if (!writeResult.ok) {
      set({
        saving: false,
        staleWrite: writeResult.kind === 'error' && writeResult.code === 'stale-write',
        saveError: writeResult.kind === 'error' ? writeResult.message : 'Could not save the file.',
      });
      return writeResult;
    }

    // The write channel reports success only, never the new stat — re-read
    // rather than widen `GitOpResult`'s success arm for this one caller.
    const read = await bridge()!.fs.readFile(writeArgs(target));
    set({
      saving: false,
      saveError: null,
      staleWrite: false,
      savedContent: content,
      version: read.kind === 'text' ? read.version : version,
    });
    return writeResult;
  },

  reloadFromDisk: async () => {
    const { target } = get();
    if (!target) return;
    const read = await bridge()!.fs.readFile(writeArgs(target));
    if (read.kind !== 'text') return;
    set({
      content: read.content,
      savedContent: read.content,
      version: read.version,
      staleWrite: false,
      saveError: null,
    });
  },

  dismissStaleWrite: () => set({ staleWrite: false, saveError: null }),

  guardNavigation: (action) => {
    const { target, content, savedContent } = get();
    if (!target || content === savedContent) {
      action();
      return;
    }
    set({ pendingNav: action });
  },

  resolvePendingSave: async () => {
    const result = await get().save();
    if (!result.ok) return; // stale-write or another failure: stay put, keep pendingNav
    const nav = get().pendingNav;
    set({ pendingNav: null });
    nav?.();
  },

  resolvePendingDiscard: () => {
    const nav = get().pendingNav;
    set((state) => ({ content: state.savedContent, pendingNav: null, saveError: null }));
    nav?.();
  },

  resolvePendingCancel: () => set({ pendingNav: null, saveError: null }),
}));
