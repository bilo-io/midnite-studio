import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MIDNITE_INSTALL_COMMAND, type MidniteStudioBridge } from '@midnite/studio-shared';

import { submitCommand } from '../terminal/submit-command';
import { useTerminalStore } from '../terminal/terminal-store';
import { useProjectActions } from './project-actions';

vi.mock('../terminal/submit-command', () => ({ submitCommand: vi.fn() }));

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
    vi.mocked(submitCommand).mockClear();
  });

  it('names the no-build cost in the tooltip when no packaged build exists', async () => {
    installBridge({ listDir: () => ({ ok: true, entries: [] }) });
    const { result } = renderHook(() => useProjectActions(TARGET));

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.buttonLabel).toMatch(/no packaged build yet/i);
    });
  });

  it('is disabled only while the checkout check is still pending', async () => {
    let answer!: (value: { kind: 'missing' }) => void;
    installBridge({
      readFile: () => new Promise((resolve) => (answer = resolve)),
    });
    const { result } = renderHook(() => useProjectActions(TARGET));

    // Unknown must not read as "not the checkout" — a click here would run the
    // release installer from inside the source tree.
    const pending = result.current.actions.find((a) => a.key === 'update')!;
    expect(pending.disabled).toBe(true);
    pending.onSelect();
    expect(submitCommand).not.toHaveBeenCalled();

    await act(async () => answer({ kind: 'missing' }));
    await waitFor(() => {
      expect(result.current.actions.find((a) => a.key === 'update')!.disabled).toBeFalsy();
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

  it('queues the install command with a trailing return to execute immediately', async () => {
    installBridge();
    const { result } = renderHook(() => useProjectActions(TARGET));

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.disabled).toBeFalsy();
    });

    act(() => {
      result.current.actions.find((a) => a.key === 'update')!.onSelect();
    });

    const sessionId = useTerminalStore.getState().sessions.at(-1)!.id;
    expect(useTerminalStore.getState().pendingInput[sessionId]).toBe(
      'moon run desktop:install-local\r',
    );
  });

  it('is enabled in the Midnite Studio checkout and never runs the release installer there', async () => {
    installBridge();
    const { result } = renderHook(() => useProjectActions(TARGET));

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.disabled).toBeFalsy();
      expect(update.buttonLabel).toMatch(/rebuild and install this checkout|no packaged build yet/);
    });
    act(() => {
      result.current.actions.find((a) => a.key === 'update')!.onSelect();
    });
    expect(submitCommand).not.toHaveBeenCalled();
  });
});

describe('useProjectActions — Update outside the Midnite Studio checkout', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
    installBridge({
      listDir: () => ({ ok: true, entries: [] }), // no .midnite, no packaged build
      readFile: () => ({ kind: 'missing' }), // no install-local.mjs: not the studio checkout
    });
  });

  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    vi.mocked(submitCommand).mockClear();
  });

  it('is enabled, and its tooltip names the installer rather than a rebuild', async () => {
    const { result } = renderHook(() => useProjectActions(TARGET));

    await waitFor(() => {
      const update = result.current.actions.find((a) => a.key === 'update')!;
      expect(update.disabled).toBeFalsy();
      expect(update.disabledReason).toBeUndefined();
      expect(update.label).toBe('Update Midnite Studio');
      expect(update.buttonLabel).toBe(
        'Update Midnite Studio — download and install the latest release',
      );
    });
  });

  it('submits the download page\'s install command, exactly, through submitCommand', async () => {
    const { result } = renderHook(() => useProjectActions(TARGET));
    await waitFor(() => {
      expect(result.current.actions.find((a) => a.key === 'update')!.disabled).toBeFalsy();
    });

    act(() => {
      result.current.actions.find((a) => a.key === 'update')!.onSelect();
    });

    expect(submitCommand).toHaveBeenCalledTimes(1);
    expect(submitCommand).toHaveBeenCalledWith(MIDNITE_INSTALL_COMMAND, 'Update Midnite Studio');
    // Not the checkout's rebuild: no session of its own is opened here.
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });
});
