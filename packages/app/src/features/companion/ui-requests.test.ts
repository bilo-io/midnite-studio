import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandId, CompanionUiAction } from '@midnite/studio-shared';

/**
 * Phase 81 Theme F — `resolveUiAction`, the renderer's answer to an agent's
 * `ui.state`/`ui.navigate`/`ui.command` request. Mirrors `navigate.test.ts`'s
 * own shape: `bridge()` is mocked just enough to answer `window.focusRole`
 * and `repos.list`, and every store this module reads is reset in
 * `beforeEach` rather than mocked, so the assertions are against the real
 * `setActiveView`/`COMMAND_ACCESS`/toast/companion-turn wiring.
 */

const mocks = vi.hoisted(() => ({
  focusRole: vi.fn(),
  reposList: vi.fn(async () => [] as Array<{ id: string; path: string; worktrees: unknown[] }>),
}));

vi.mock('../../services/bridge', () => ({
  // `speaker.ts` (Phase 109 Theme D's voice listing) reads it at import.
  hasBridge: () => false,
  bridge: () =>
    ({
      windowRole: 'main',
      window: { focusRole: mocks.focusRole },
      repos: { list: mocks.reposList },
    }) as unknown,
}));

import { resolveUiAction } from './ui-requests';
import { REVEALERS } from './reveal/revealers';
import { unavailableRevealer } from './reveal/revealers/stub';
import { useRevealHistory } from './reveal/reveal-history';
import { runCommand, setCommandRuntime } from './command-runtime';
import { useCompanionStore } from '../../store/companion-store';
import { useFileEditorStore } from '../../store/file-editor-store';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';

const navigate = (over: Partial<Extract<CompanionUiAction, { kind: 'navigate' }>> = {}): CompanionUiAction => ({
  kind: 'navigate',
  view: 'graph',
  ...over,
});

const command = (id: CommandId): CompanionUiAction => ({ kind: 'command', id });

beforeEach(() => {
  mocks.focusRole.mockClear();
  mocks.reposList.mockClear();
  mocks.reposList.mockResolvedValue([]);
  setCommandRuntime(null);

  useUiStore.setState({
    activeView: 'dashboard',
    settingsPage: 'appearance',
    detachedPages: [],
    terminalDetached: false,
    reposDetached: false,
    fabDetached: false,
    companionDetached: false,
    browserDetached: false,
    screensaverLocked: false,
    selectedRepoId: null,
    companionEnabled: false,
  });
  useFileEditorStore.setState({ target: null, content: '', savedContent: '', pendingNav: null });
  useToastStore.setState({ toasts: [] });
  useCompanionStore.setState({ transcript: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveUiAction — ui.state', () => {
  it('answers the current view/settings/detached/locked state regardless of anything else', async () => {
    useUiStore.setState({ activeView: 'settings', settingsPage: 'mcp', screensaverLocked: true });
    const result = await resolveUiAction({ kind: 'state' });
    expect(result).toEqual({
      ok: true,
      value: {
        did: 'state',
        activeView: 'settings',
        settingsPage: 'mcp',
        detached: [],
        repoPath: null,
        locked: true,
      },
    });
  });

  it('answers even while the screen is locked — only navigate/command refuse for that', async () => {
    useUiStore.setState({ screensaverLocked: true });
    const result = await resolveUiAction({ kind: 'state' });
    expect(result.ok).toBe(true);
  });

  it('resolves the selected repository’s main worktree path', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    mocks.reposList.mockResolvedValue([
      { id: 'r1', path: '/repo', worktrees: [{ isMain: true, path: '/repo' }] },
    ]);
    const result = await resolveUiAction({ kind: 'state' });
    expect(result.ok && result.value.did === 'state' && result.value.repoPath).toBe('/repo');
  });
});

describe('resolveUiAction — ui.navigate', () => {
  it('refuses while the screen is locked, before touching the view', async () => {
    useUiStore.setState({ screensaverLocked: true, activeView: 'dashboard' });
    const result = await resolveUiAction(navigate());
    expect(result).toMatchObject({ ok: false, kind: 'error', message: 'The screen is locked — unlock it first.' });
    expect(useUiStore.getState().activeView).toBe('dashboard');
  });

  it('changes the view, posts a toast, and answers navigated', async () => {
    const result = await resolveUiAction(navigate());
    expect(useUiStore.getState().activeView).toBe('graph');
    expect(result).toEqual({ ok: true, value: { did: 'navigated', view: 'graph' } });
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Agent: opened Commit Timeline.');
  });

  it('posts no companion turn when the companion is disabled, one when it is enabled', async () => {
    await resolveUiAction(navigate());
    expect(useCompanionStore.getState().transcript).toHaveLength(0);

    useUiStore.setState({ companionEnabled: true, activeView: 'dashboard' });
    await resolveUiAction(navigate());
    const turns = useCompanionStore.getState().transcript;
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ role: 'companion', text: 'An agent opened the Commit Timeline.' });
  });

  it('focuses an already-detached page instead of opening a second copy', async () => {
    useUiStore.setState({ detachedPages: ['graph'], activeView: 'dashboard' });
    const result = await resolveUiAction(navigate());
    expect(mocks.focusRole).toHaveBeenCalledWith({ role: 'graph' });
    expect(useUiStore.getState().activeView).toBe('dashboard');
    expect(result).toEqual({ ok: true, value: { did: 'focused-window', view: 'graph' } });
  });

  it('defers to the unsaved-file dialog and refuses, touching nothing else', async () => {
    useFileEditorStore.setState({
      target: { repoId: 'r1', relPath: 'a.ts', key: 'r1:a.ts' },
      content: 'dirty',
      savedContent: 'clean',
    });
    const result = await resolveUiAction(navigate());
    expect(result.ok).toBe(false);
    expect(useFileEditorStore.getState().pendingNav).not.toBeNull();
  });
});

describe('resolveUiAction — ui.command', () => {
  it('refuses a confirm-tier id — needs the user', async () => {
    const run = vi.fn();
    setCommandRuntime({ 'sync.push': { run, enabled: true } } as never);
    const result = await resolveUiAction(command('sync.push'));
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'needs the user — ask them to run it from the palette',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a never-tier id the same way', async () => {
    const run = vi.fn();
    setCommandRuntime({ 'browser.clearData': { run, enabled: true } } as never);
    const result = await resolveUiAction(command('browser.clearData'));
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'needs the user — ask them to run it from the palette',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses while the screen is locked, before the runtime is even consulted', async () => {
    useUiStore.setState({ screensaverLocked: true });
    const run = vi.fn();
    setCommandRuntime({ 'sync.fetch': { run, enabled: true } } as never);
    const result = await resolveUiAction(command('sync.fetch'));
    expect(result.ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs a direct-tier id once, posts a toast, and answers ran', async () => {
    const run = vi.fn();
    setCommandRuntime({ 'sync.fetch': { run, enabled: true } } as never);
    const result = await resolveUiAction(command('sync.fetch'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(runCommand).toBeDefined(); // sanity: the real module, not a mock
    expect(result).toEqual({ ok: true, value: { did: 'ran', label: 'Fetch' } });
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Agent: ran Fetch.');
  });

  it('relays the runtime’s own disabled reason on refusal', async () => {
    setCommandRuntime({
      'sync.fetch': { run: vi.fn(), enabled: false, disabledReason: 'Open a repository first' },
    } as never);
    const result = await resolveUiAction(command('sync.fetch'));
    expect(result).toEqual({ ok: false, kind: 'error', message: 'Open a repository first' });
  });
});

describe('resolveUiAction — reveal / find (Phase 112 Themes B, G)', () => {
  const chat: CompanionUiAction = { kind: 'reveal', ref: { kind: 'chat', id: 'c1' } };

  it('lands on the page and refuses plainly while the kind is still a stub', async () => {
    const original = REVEALERS.chat;
    // Chats has an opener now (Theme D); the stub is what any kind without one answers.
    REVEALERS.chat = unavailableRevealer('chats');
    try {
      const result = await resolveUiAction(chat);
      expect(useUiStore.getState().activeView).toBe('chats');
      expect(result).toMatchObject({ ok: false, message: "I can't pick out that chat yet." });
    } finally {
      REVEALERS.chat = original;
    }
  });

  it('answers revealed, posts the toast and records lastRevealed when a revealer lands', async () => {
    useRevealHistory.getState().clear();
    const original = REVEALERS.chat;
    REVEALERS.chat = { view: 'chats', reveal: async () => ({ ok: true, did: 'revealed', label: 'the Auth chat' }) };
    try {
      const result = await resolveUiAction(chat);
      expect(result).toEqual({
        ok: true,
        value: { did: 'revealed', ref: { kind: 'chat', id: 'c1' }, label: 'the Auth chat', focusedWindow: false },
      });
      expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Agent: opened the Auth chat.');
      expect(useRevealHistory.getState().entries[0]?.ref).toEqual({ kind: 'chat', id: 'c1' });
    } finally {
      REVEALERS.chat = original;
    }
  });

  it('refuses a reveal while locked', async () => {
    useUiStore.setState({ screensaverLocked: true });
    const result = await resolveUiAction(chat);
    expect(result).toMatchObject({ ok: false, message: 'The screen is locked — unlock it first.' });
    expect(useUiStore.getState().activeView).toBe('dashboard');
  });

  // Phase 112 Theme G — `find` runs the resolver. A settings query asks only the static settings
  // source, so the mocked bridge needs nothing more.
  it('answers find with ranked titles and ids, never a score', async () => {
    const result = await resolveUiAction({ kind: 'find', query: 'appearance settings theme', limit: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.did !== 'found') throw new Error('expected found');
    expect(result.value.matches[0]).toEqual({
      ref: { kind: 'setting', page: 'appearance', section: 'theme' },
      title: 'Appearance settings — Theme',
      detail: 'Appearance settings section',
    });
    expect(result.value.matches.length).toBeLessThanOrEqual(3);
    expect(result.value.matches.every((match) => !('score' in match))).toBe(true);
  });

  it('refuses a find while locked — it enumerates the user’s work', async () => {
    useUiStore.setState({ screensaverLocked: true });
    const result = await resolveUiAction({ kind: 'find', query: 'appearance settings' });
    expect(result).toMatchObject({ ok: false, message: 'The screen is locked — unlock it first.' });
  });
});
