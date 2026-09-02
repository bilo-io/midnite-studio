import { createElement } from 'react';

import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BranchStatus, StatusResult } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { ToastHost } from '../../components/toast-host';
import { useSlidesStore } from '../../features/slides/slides-store';
import { useTerminalStore } from '../../features/terminal/terminal-store';
import { keys } from '../queries';
import { useFileEditorStore } from '../../store/file-editor-store';
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { useCommandHandlers } from './use-command-handlers';

const BRANCH_CLEAN: BranchStatus = {
  head: 'main',
  oid: 'abc123',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  detached: false,
  unborn: false,
};

const statusWith = (branch: Partial<BranchStatus>): StatusResult => ({
  branch: { ...BRANCH_CLEAN, ...branch },
  entries: [],
  inProgress: null,
});

const REPO_ID = 'repo-1';

const withProviders = (client: QueryClient) =>
  renderHook(() => useCommandHandlers(), {
    wrapper: ({ children }) =>
      createElement(
        QueryClientProvider,
        { client },
        // `ToastHost` joins `DialogHost` here because Phase 22 Theme H's
        // journal recording lives inside `useGitOp` — every command this
        // hook wires up that goes through it (`sync.fetch` among them) now
        // needs `useToasts()` in scope, same as it already needed
        // `useDialogs()`.
        createElement(DialogHost, null, createElement(ToastHost, null, children)),
      ),
  });

beforeEach(() => {
  useUiStore.setState({
    selectedRepoId: null,
    selectedWorktreePath: null,
    activeView: 'graph',
    terminalOpen: false,
    fabPanelOpen: false,
  });
  useWorkbenchStore.setState({ tabs: [], activeTabId: null });
  useFileEditorStore.setState({
    target: null,
    content: '',
    savedContent: '',
    version: null,
    pendingNav: null,
  });
  useSlidesStore.setState({ deck: null, activeMarkdown: null });
  useTerminalStore.setState({ sessions: [], activeId: null, states: {}, foregroundCommand: {} });
});

describe('useCommandHandlers — no repo open', () => {
  it('disables repo.close, view.refresh, status.commit and the sync family, all for the same reason', () => {
    const { result } = withProviders(new QueryClient());
    const runtime = result.current;

    for (const id of ['repo.close', 'view.refresh', 'status.commit', 'sync.fetch', 'sync.pull', 'sync.push'] as const) {
      expect(runtime[id].enabled).toBe(false);
      expect(runtime[id].disabledReason).toBe('Open a repository first');
    }
  });

  it('disables terminal.new with no repo/worktree selected', () => {
    const { result } = withProviders(new QueryClient());
    expect(result.current['terminal.new'].enabled).toBe(false);
    expect(result.current['terminal.new'].disabledReason).toBe('Open a repository first');
  });

  it('disables terminal.close with no terminal session open', () => {
    const { result } = withProviders(new QueryClient());
    expect(result.current['terminal.close'].enabled).toBe(false);
    expect(result.current['terminal.close'].disabledReason).toBe('No terminal selected');
  });

  it('leaves navigation, terminal and repo.open enabled with nothing selected', () => {
    const { result } = withProviders(new QueryClient());
    const runtime = result.current;

    for (const id of [
      'terminal.toggle',
      'terminal.focus',
      'repos.toggle',
      'browser.toggle',
      'fab.toggle',
      'repo.open',
      'view.graph',
      'view.files',
      'graph.focus',
      'status.focus',
    ] as const) {
      expect(runtime[id].enabled).toBe(true);
    }
  });

  it('leaves op.abort and op.continue disabled, with a reason', () => {
    const { result } = withProviders(new QueryClient());
    const runtime = result.current;

    for (const id of ['op.abort', 'op.continue'] as const) {
      expect(runtime[id].enabled).toBe(false);
      expect(runtime[id].disabledReason?.length).toBeGreaterThan(0);
    }
  });

  it('enables the palette commands with nothing selected — Theme C built the surface', () => {
    const { result } = withProviders(new QueryClient());
    const runtime = result.current;

    for (const id of ['palette.open', 'palette.files'] as const) {
      expect(runtime[id].enabled).toBe(true);
    }
  });
});

describe('useCommandHandlers — file.save', () => {
  it('disables file.save with no file open for editing', () => {
    const { result } = withProviders(new QueryClient());
    expect(result.current['file.save'].enabled).toBe(false);
    expect(result.current['file.save'].disabledReason).toBe('No file open for editing');
  });

  it('disables file.save with a clean open file', () => {
    useFileEditorStore.getState().openFile(
      { repoId: REPO_ID, relPath: 'a.ts', key: 'a' },
      'content',
      { mtimeMs: 1, size: 7 },
    );
    const { result } = withProviders(new QueryClient());
    expect(result.current['file.save'].enabled).toBe(false);
    expect(result.current['file.save'].disabledReason).toBe('No unsaved changes');
  });

  it('enables file.save once the open file is dirty, and its run() saves it', () => {
    useFileEditorStore.getState().openFile(
      { repoId: REPO_ID, relPath: 'a.ts', key: 'a' },
      'content',
      { mtimeMs: 1, size: 7 },
    );
    useFileEditorStore.getState().edit('content, edited');
    const { result } = withProviders(new QueryClient());
    expect(result.current['file.save'].enabled).toBe(true);

    const save = vi.fn().mockResolvedValue({ ok: true });
    useFileEditorStore.setState({ save });
    result.current['file.save'].run();
    expect(save).toHaveBeenCalledOnce();
  });
});

describe('useCommandHandlers — a repo is selected', () => {
  const seededClient = (branch: Partial<BranchStatus>) => {
    const client = new QueryClient();
    client.setQueryData(keys.repos, [{ id: REPO_ID, name: 'demo', path: '/demo', worktrees: [] }]);
    client.setQueryData(keys.status(REPO_ID), statusWith(branch));
    return client;
  };

  it('enables repo.close and view.refresh', () => {
    useUiStore.setState({ selectedRepoId: REPO_ID });
    const { result } = withProviders(seededClient({}));
    expect(result.current['repo.close'].enabled).toBe(true);
    expect(result.current['view.refresh'].enabled).toBe(true);
  });

  it('disables status.commit off the working tree, and enables it on it', () => {
    useUiStore.setState({ selectedRepoId: REPO_ID, activeView: 'graph' });
    const { result: offTree } = withProviders(seededClient({}));
    expect(offTree.current['status.commit'].enabled).toBe(false);
    expect(offTree.current['status.commit'].disabledReason).toBe(
      'Switch to the working tree to commit',
    );

    useUiStore.setState({ selectedRepoId: REPO_ID, activeView: 'changes' });
    useWorkbenchStore.setState({ activeTabId: null });
    const { result: onTree } = withProviders(seededClient({}));
    expect(onTree.current['status.commit'].enabled).toBe(true);
  });

  it('disables status.commit when the Changes view is open on a non-working-tree tab', () => {
    useUiStore.setState({ selectedRepoId: REPO_ID, activeView: 'changes' });
    useWorkbenchStore.setState({ activeTabId: 'some-tab' });
    const { result } = withProviders(seededClient({}));
    expect(result.current['status.commit'].enabled).toBe(false);
  });

  it('wires sync.* through the same syncAffordances rules the sync cluster uses', () => {
    useUiStore.setState({ selectedRepoId: REPO_ID });
    const { result } = withProviders(seededClient({ behind: 2, ahead: 0 }));
    expect(result.current['sync.pull'].enabled).toBe(true);
    expect(result.current['sync.push'].enabled).toBe(false);
    expect(result.current['sync.push'].disabledReason).toBe('Nothing to push.');
  });
});

describe('useCommandHandlers — terminal.new', () => {
  it('opens a plain shell session (no agentId) and expands a collapsed panel', () => {
    useUiStore.setState({
      selectedRepoId: REPO_ID,
      selectedWorktreePath: '/repos/demo',
      terminalOpen: false,
    });
    const client = new QueryClient();
    client.setQueryData(keys.repos, [{ id: REPO_ID, name: 'demo', path: '/demo', worktrees: [] }]);
    const { result } = withProviders(client);

    expect(result.current['terminal.new'].enabled).toBe(true);
    result.current['terminal.new'].run();

    const { sessions } = useTerminalStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.kind).toBe('shell');
    expect(sessions[0]?.agentId).toBeUndefined();
    expect(sessions[0]?.cwd).toBe('/repos/demo');
    expect(useUiStore.getState().terminalOpen).toBe(true);
  });

  it('leaves an already-expanded panel alone', () => {
    useUiStore.setState({
      selectedRepoId: REPO_ID,
      selectedWorktreePath: '/repos/demo',
      terminalOpen: true,
    });
    const client = new QueryClient();
    client.setQueryData(keys.repos, [{ id: REPO_ID, name: 'demo', path: '/demo', worktrees: [] }]);
    const { result } = withProviders(client);

    result.current['terminal.new'].run();

    expect(useUiStore.getState().terminalOpen).toBe(true);
  });
});

describe('useCommandHandlers — terminal.close', () => {
  it('closes the selected session when nothing is running in its foreground', () => {
    useTerminalStore.getState().openSession({
      kind: 'shell',
      title: 'demo',
      cwd: '/repos/demo',
      repoId: REPO_ID,
    });
    const { result } = withProviders(new QueryClient());

    expect(result.current['terminal.close'].enabled).toBe(true);
    result.current['terminal.close'].run();

    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });
});

describe('useCommandHandlers — fab.toggle', () => {
  it('toggles the FAB panel', () => {
    const { result } = withProviders(new QueryClient());
    expect(useUiStore.getState().fabPanelOpen).toBe(false);

    result.current['fab.toggle'].run();
    expect(useUiStore.getState().fabPanelOpen).toBe(true);

    result.current['fab.toggle'].run();
    expect(useUiStore.getState().fabPanelOpen).toBe(false);
  });
});

describe('useCommandHandlers — markdown.presentAsSlides', () => {
  it('disables it with no active markdown surface in view', () => {
    const { result } = withProviders(new QueryClient());
    expect(result.current['markdown.presentAsSlides'].enabled).toBe(false);
    expect(result.current['markdown.presentAsSlides'].disabledReason).toBe('No markdown in view');
  });

  it('enables it once a surface sets activeMarkdown, and run() delegates to presentActive()', () => {
    useSlidesStore.setState({ activeMarkdown: { content: '# Title', label: 'a.md' } });
    const { result } = withProviders(new QueryClient());
    expect(result.current['markdown.presentAsSlides'].enabled).toBe(true);

    const presentActive = vi.spyOn(useSlidesStore.getState(), 'presentActive');
    result.current['markdown.presentAsSlides'].run();
    expect(presentActive).toHaveBeenCalledOnce();
  });
});

describe('useCommandHandlers — the reload pair', () => {
  /**
   * Both stay enabled with nothing open, deliberately: a reload is the one
   * command that has to work when the app has wedged itself, and it needs no
   * repository to be meaningful.
   */
  it('reloads plainly, and bypasses the cache on the hard variant', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'midniteStudio', {
      value: { window: { reload } },
      configurable: true,
    });
    try {
      const { result } = withProviders(new QueryClient());
      expect(result.current['app.reload'].enabled).toBe(true);
      expect(result.current['app.hardReload'].enabled).toBe(true);

      result.current['app.reload'].run();
      expect(reload).toHaveBeenLastCalledWith(false);

      result.current['app.hardReload'].run();
      expect(reload).toHaveBeenLastCalledWith(true);
    } finally {
      Reflect.deleteProperty(window, 'midniteStudio');
    }
  });

  it('is a no-op rather than a throw with no preload bridge', () => {
    const { result } = withProviders(new QueryClient());
    expect(() => result.current['app.reload'].run()).not.toThrow();
  });
});
