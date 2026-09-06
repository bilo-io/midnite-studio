import type {
  AgentDefinition,
  ForgeProject,
  RepoDescriptor,
  TerminalSession,
  Worktree,
} from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { CommandRuntime } from '../../services/keybindings/use-command-handlers';
import {
  createCommandSource,
  createProjectBoardsSource,
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
    // `title` is the REPO name (fact 4) — deliberately the same for both
    // sessions here, to prove the label comes from `sessionLabel`'s own
    // precedence and not from `title`.
    const sessions: TerminalSession[] = [
      {
        id: 's1',
        title: 'midnite-studio',
        name: 'zsh',
        kind: 'shell',
        cwd: '/dev/midnite-studio',
        repoId: 'r1',
        createdAt: Date.now(),
      },
      {
        id: 's2',
        title: 'midnite-studio',
        kind: 'agent',
        agentId: 'claude',
        cwd: '/dev/midnite-studio',
        repoId: 'r1',
        createdAt: Date.now(),
      },
      {
        id: 's3',
        title: 'midnite-studio',
        kind: 'shell',
        cwd: '/dev/midnite-studio',
        repoId: 'r1',
        createdAt: Date.now(),
        surface: 'fab',
      },
    ];
    const agents: AgentDefinition[] = [
      { id: 'claude', label: 'Claude Code', command: 'claude', args: [], accent: '#f00' },
    ];

    const source = createTerminalSource(sessions, agents, null, onSelect);
    expect(source.key).toBe('sessions');

    const items = source.items();
    // A session's own name wins over the repo name every time (fact 4).
    expect(items.find((i) => i.id === 'session:s1')?.label).toBe('zsh');
    // No name, kind `agent`, an agentId the roster resolves — falls back to
    // that agent's own label, never the repo name.
    expect(items.find((i) => i.id === 'session:s2')?.label).toBe('Claude Code');
    // A `surface: 'fab'` row is filtered out of the palette's live source
    // entirely (Theme E, Decision 5) — it stays reachable through history.
    expect(items.find((i) => i.id === 'session:s3')).toBeUndefined();
    expect(items.find((i) => i.id === 'agent:claude')?.label).toBe('Start Claude Code');
  });

  it('creates a board entry only for boards already loaded, and only with a repo open', () => {
    const onSelect = vi.fn();
    const boards: ForgeProject[] = [
      { id: 'PVT_1', number: 1, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/1', closed: false },
    ];

    const source = createProjectBoardsSource(boards, 'r1', onSelect);
    expect(source.key).toBe('project-boards');
    expect(source.items().find((i) => i.id === 'project-board:PVT_1')?.label).toBe('Roadmap');

    // No repo open: nothing to navigate a board within, so no items — never
    // a fetch either way, since `boards` is whatever the caller already had.
    expect(createProjectBoardsSource(boards, null, onSelect).items()).toEqual([]);
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
