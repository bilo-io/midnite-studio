import type { AgentDefinition, RepoDescriptor, TerminalSession, Worktree } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { CommandRuntime } from '../../services/keybindings/use-command-handlers';
import {
  createCommandSource,
  createReposSource,
  createTerminalSource,
  createViewsSource,
} from './providers';
import { scorePaletteItem } from './source';

describe('palette providers', () => {
  it('creates commands source with enabled/disabled states', () => {
    const onSelect = vi.fn();
    const runtime = {
      'terminal.toggle': { enabled: true, run: vi.fn() },
      'sync.pull': { enabled: false, disabledReason: 'No repository open', run: vi.fn() },
    } as unknown as CommandRuntime;

    const source = createCommandSource(runtime, onSelect);
    expect(source.key).toBe('commands');

    const items = source.items();
    expect(items.length).toBeGreaterThan(10);

    const toggleCmd = items.find((i) => i.id === 'command:terminal.toggle');
    expect(toggleCmd).toBeDefined();
    expect(toggleCmd?.disabled).toBe(false);

    toggleCmd?.run();
    expect(onSelect).toHaveBeenCalled();
    expect(runtime['terminal.toggle'].run).toHaveBeenCalled();

    const pullCmd = items.find((i) => i.id === 'command:sync.pull');
    expect(pullCmd?.disabled).toBe(true);
    expect(pullCmd?.disabledReason).toBe('No repository open');
  });

  it('creates views and settings sources', () => {
    const onSelect = vi.fn();
    const source = createViewsSource(onSelect);
    expect(source.key).toBe('views');

    const items = source.items();
    const graphView = items.find((i) => i.id === 'view:graph');
    expect(graphView).toBeDefined();
    expect(graphView?.label).toBe('Commit Graph');

    const appearanceSettings = items.find((i) => i.id === 'settings:appearance');
    expect(appearanceSettings).toBeDefined();
    expect(appearanceSettings?.label).toBe('Settings: Appearance');
  });

  it('creates repos and worktrees source', () => {
    const onSelect = vi.fn();
    const repos: RepoDescriptor[] = [
      { id: 'r1', name: 'midnite-studio', path: '/dev/midnite-studio', headRef: 'main', worktrees: [] },
    ];
    const worktrees: Worktree[] = [
      {
        path: '/dev/midnite-studio/.worktrees/feat',
        branch: 'feature/palette',
        headSha: 'abc',
        id: 'wt1',
        isMain: false,
        locked: false,
        prunable: false,
        repoId: 'r1',
      },
    ];

    const source = createReposSource(repos, worktrees, 'r1', onSelect);
    expect(source.key).toBe('repos');

    const items = source.items();
    expect(items.find((i) => i.id === 'repo:r1')?.label).toBe('midnite-studio');
    expect(items.find((i) => i.id === 'worktree:/dev/midnite-studio/.worktrees/feat')?.label).toBe('feature/palette');
  });

  it('creates terminal sessions and agent roster source', () => {
    const onSelect = vi.fn();
    const sessions: TerminalSession[] = [
      { id: 's1', title: 'zsh', kind: 'shell', cwd: '/dev/midnite-studio', repoId: 'r1', createdAt: Date.now() },
    ];
    const agents: AgentDefinition[] = [
      { id: 'claude', label: 'Claude Code', command: 'claude', args: [], accent: '#f00' },
    ];

    const source = createTerminalSource(sessions, agents, null, onSelect);
    expect(source.key).toBe('sessions');

    const items = source.items();
    expect(items.find((i) => i.id === 'session:s1')?.label).toBe('zsh');
    expect(items.find((i) => i.id === 'agent:claude')?.label).toBe('Start Claude Code');
  });

  it('scores items using source weights', () => {
    const cmdItem = { id: 'c1', label: 'Refresh', group: 'Commands', run: vi.fn() };
    const repoItem = { id: 'r1', label: 'RefreshRepo', group: 'Repositories', run: vi.fn() };

    const scoredCmd = scorePaletteItem(cmdItem, 'refresh', 'commands');
    const scoredRepo = scorePaletteItem(repoItem, 'refresh', 'repos');

    expect(scoredCmd).not.toBeNull();
    expect(scoredRepo).not.toBeNull();
    // Commands weight is 1.2 vs Repos weight 1.0
    expect(scoredCmd!.score).toBeGreaterThan(scoredRepo!.score);
  });
});
