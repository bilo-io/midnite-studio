import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useTerminalStore } from '../terminal/terminal-store';
import { useProjectActions } from './project-actions';

const TARGET = { repoId: 'r1', repoName: 'demo', cwd: '/repo' };

function installBridge(overrides: {
  listDir?: (req: unknown) => unknown;
  readFile?: (req: unknown) => unknown;
} = {}) {
  const listDir = vi.fn(
    overrides.listDir ??
      ((req: { relPath?: string }) =>
        req.relPath === 'release/mac-arm64'
          ? { ok: true, entries: [] }
          : { ok: true, entries: [{ name: '.midnite' }] }),
  );
  const readFile = vi.fn(overrides.readFile ?? (() => ({ kind: 'text', content: '// script' })));
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    fs: { listDir, readFile } as unknown as MidniteStudioBridge['fs'],
    terminal: { save: vi.fn() } as unknown as MidniteStudioBridge['terminal'],
  } as Partial<MidniteStudioBridge>;
  return { listDir, readFile };
}

describe('useProjectActions — Update pre-flight (Phase 49 Theme E)', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
  });

  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('names the no-build cost in the tooltip when no packaged build exists', async () => {
    installBridge({ listDir: () => ({ ok: true, entries: [] }) });
    const { result } = renderHook(() => useProjectActions(TARGET));

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.buttonLabel).toMatch(/no packaged build yet/i);
    });
  });

  it('omits the no-build note when the repo is not the studio checkout, so the tooltip does not double up on disabledReason', async () => {
    installBridge({
      listDir: () => ({ ok: true, entries: [] }), // no .midnite, no packaged build
      readFile: () => ({ kind: 'missing' }), // not the studio checkout
    });
    const { result } = renderHook(() => useProjectActions(TARGET));

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.disabled).toBe(true);
      expect(update.buttonLabel).toBe('Update Midnite Studio — rebuild and install this checkout');
    });
  });

  it('reverts to the plain rebuild wording once a packaged build exists', async () => {
    installBridge({
      listDir: (req: unknown) =>
        (req as { relPath?: string }).relPath === 'release/mac-arm64'
          ? { ok: true, entries: [{ name: 'Midnite Studio.app' }] }
          : { ok: true, entries: [] },
    });
    const { result } = renderHook(() => useProjectActions(TARGET));

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.buttonLabel).toBe('Update Midnite Studio — rebuild and install this checkout');
    });
  });

  it('re-reads hasPackagedBuild once the Update session exits, dropping the no-build note', async () => {
    let built = false;
    installBridge({
      listDir: (req: unknown) =>
        (req as { relPath?: string }).relPath === 'release/mac-arm64'
          ? { ok: built, entries: built ? [{ name: 'Midnite Studio.app' }] : [] }
          : { ok: true, entries: [] },
    });
    const { result } = renderHook(() => useProjectActions(TARGET));

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.buttonLabel).toMatch(/no packaged build yet/i);
    });

    // Simulate a completed `install-local` run: the build now exists, and the
    // session Update opened transitions to `exited`.
    built = true;
    act(() => {
      result.current.actions.find((a) => a.key === 'update')!.onSelect();
    });
    const sessionId = useTerminalStore.getState().sessions.at(-1)!.id;
    act(() => {
      useTerminalStore.getState().setState(sessionId, 'exited');
    });

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.buttonLabel).toBe('Update Midnite Studio — rebuild and install this checkout');
    });
  });
});
