import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FsVersion, MidniteGitBridge } from '@midnite/git-shared';

import { useFileEditorStore } from './file-editor-store';

const TARGET = { repoId: 'r1', relPath: 'src/a.ts', key: 'r1::src/a.ts' };
const V1: FsVersion = { mtimeMs: 1, size: 5 };

function mockBridge(overrides: Partial<MidniteGitBridge['fs']> = {}) {
  const fs = {
    writeFile: vi.fn().mockResolvedValue({ ok: true }),
    readFile: vi.fn().mockResolvedValue({ kind: 'text', content: 'hello', size: 5, version: V1 }),
    ...overrides,
  };
  (window as unknown as { midniteGit: Partial<MidniteGitBridge> }).midniteGit = {
    fs,
  } as unknown as MidniteGitBridge;
  return fs;
}

describe('file-editor-store', () => {
  beforeEach(() => {
    useFileEditorStore.setState({
      target: null,
      savedContent: '',
      content: '',
      version: null,
      saving: false,
      saveError: null,
      staleWrite: false,
      pendingNav: null,
      allowClose: false,
    });
    delete (window as { midniteGit?: unknown }).midniteGit;
  });

  it('openFile seeds content and savedContent from the same read, so a fresh open is never dirty', () => {
    useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
    const state = useFileEditorStore.getState();
    expect(state.target).toEqual(TARGET);
    expect(state.content).toBe('hello');
    expect(state.savedContent).toBe('hello');
  });

  it('closeFile is a no-op unless the key matches the current target', () => {
    useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
    useFileEditorStore.getState().closeFile('some-other-key');
    expect(useFileEditorStore.getState().target).toEqual(TARGET);

    useFileEditorStore.getState().closeFile(TARGET.key);
    expect(useFileEditorStore.getState().target).toBeNull();
  });

  describe('guardNavigation', () => {
    it('runs the action immediately when there is no open file', () => {
      const action = vi.fn();
      useFileEditorStore.getState().guardNavigation(action);
      expect(action).toHaveBeenCalledOnce();
      expect(useFileEditorStore.getState().pendingNav).toBeNull();
    });

    it('runs the action immediately when the open file is clean', () => {
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      const action = vi.fn();
      useFileEditorStore.getState().guardNavigation(action);
      expect(action).toHaveBeenCalledOnce();
    });

    it('defers the action when the open file is dirty', () => {
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      useFileEditorStore.getState().edit('hello world');
      const action = vi.fn();
      useFileEditorStore.getState().guardNavigation(action);
      expect(action).not.toHaveBeenCalled();
      expect(useFileEditorStore.getState().pendingNav).toBe(action);
    });
  });

  describe('resolvePendingCancel', () => {
    it('clears pendingNav without running it', () => {
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      useFileEditorStore.getState().edit('hello world');
      const action = vi.fn();
      useFileEditorStore.getState().guardNavigation(action);

      useFileEditorStore.getState().resolvePendingCancel();
      expect(action).not.toHaveBeenCalled();
      expect(useFileEditorStore.getState().pendingNav).toBeNull();
      // Cancel keeps the edit — it is not a discard.
      expect(useFileEditorStore.getState().content).toBe('hello world');
    });
  });

  describe('resolvePendingDiscard', () => {
    it('reverts content to savedContent and runs the deferred navigation', () => {
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      useFileEditorStore.getState().edit('hello world');
      const action = vi.fn();
      useFileEditorStore.getState().guardNavigation(action);

      useFileEditorStore.getState().resolvePendingDiscard();
      expect(action).toHaveBeenCalledOnce();
      expect(useFileEditorStore.getState().content).toBe('hello');
      expect(useFileEditorStore.getState().pendingNav).toBeNull();
    });
  });

  describe('save', () => {
    it('writes, re-reads for the new version, and clears dirty on success', async () => {
      const fs = mockBridge();
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      useFileEditorStore.getState().edit('hello world');

      const result = await useFileEditorStore.getState().save();

      expect(result.ok).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ relPath: TARGET.relPath, content: 'hello world', expectedVersion: V1 }),
      );
      const state = useFileEditorStore.getState();
      expect(state.savedContent).toBe('hello world');
      expect(state.content).toBe('hello world');
      expect(state.saving).toBe(false);
      expect(state.staleWrite).toBe(false);
    });

    it('flags staleWrite instead of overwriting or discarding on a moved FsVersion', async () => {
      mockBridge({
        writeFile: vi
          .fn()
          .mockResolvedValue({ ok: false, kind: 'error', message: 'changed on disk', code: 'stale-write' }),
      });
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      useFileEditorStore.getState().edit('hello world');

      const result = await useFileEditorStore.getState().save();

      expect(result.ok).toBe(false);
      const state = useFileEditorStore.getState();
      expect(state.staleWrite).toBe(true);
      expect(state.saveError).toBe('changed on disk');
      // Unchanged: neither silently overwritten nor silently discarded.
      expect(state.savedContent).toBe('hello');
      expect(state.content).toBe('hello world');
    });
  });

  describe('resolvePendingSave', () => {
    it('runs the deferred navigation once the save succeeds', async () => {
      mockBridge();
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      useFileEditorStore.getState().edit('hello world');
      const action = vi.fn();
      useFileEditorStore.getState().guardNavigation(action);

      await useFileEditorStore.getState().resolvePendingSave();

      expect(action).toHaveBeenCalledOnce();
      expect(useFileEditorStore.getState().pendingNav).toBeNull();
    });

    it('keeps pendingNav set — and the guard dialog open — when the save fails', async () => {
      mockBridge({
        writeFile: vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'disk full' }),
      });
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      useFileEditorStore.getState().edit('hello world');
      const action = vi.fn();
      useFileEditorStore.getState().guardNavigation(action);

      await useFileEditorStore.getState().resolvePendingSave();

      expect(action).not.toHaveBeenCalled();
      expect(useFileEditorStore.getState().pendingNav).toBe(action);
    });
  });

  describe('reloadFromDisk', () => {
    it('replaces content, savedContent and version, and clears staleWrite', async () => {
      mockBridge({
        readFile: vi
          .fn()
          .mockResolvedValue({ kind: 'text', content: 'on disk now', size: 11, version: { mtimeMs: 2, size: 11 } }),
      });
      useFileEditorStore.getState().openFile(TARGET, 'hello', V1);
      useFileEditorStore.getState().edit('hello world');
      useFileEditorStore.setState({ staleWrite: true, saveError: 'changed on disk' });

      await useFileEditorStore.getState().reloadFromDisk();

      const state = useFileEditorStore.getState();
      expect(state.content).toBe('on disk now');
      expect(state.savedContent).toBe('on disk now');
      expect(state.version).toEqual({ mtimeMs: 2, size: 11 });
      expect(state.staleWrite).toBe(false);
      expect(state.saveError).toBeNull();
    });
  });
});
