import type { AgentDefinition, CommandDescriptor, RepoDescriptor, TerminalSession, Worktree } from '@midnite/git-shared';
import { COMMANDS } from '@midnite/git-shared';
import { LuFolder, LuGitBranch, LuSquareTerminal } from 'react-icons/lu';

import { resolveAgentIcon } from '../../components/icons';
import { SETTINGS_PAGE_ICON, VIEW_ICON } from '../../components/nav-icons';
import { COMMAND_ICONS } from '../../features/palette/command-icons';
import { startAgent } from '../../features/terminal/start-agent';
import { useTerminalStore } from '../../features/terminal/terminal-store';
import type { CommandRuntime } from '../../services/keybindings/use-command-handlers';
import { useUiStore, VIEW_IDS, SETTINGS_PAGES, type ViewId } from '../../store/ui-store';
import { chordOf } from '../../store/palette-store';
import type { PaletteItem, PaletteSource } from './source';
import type { IconComponent } from '../../components/icon-button';

const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: 'Dashboard',
  files: 'Files',
  graph: 'Commit Graph',
  changes: 'Changes',
  actions: 'Actions & CI',
  tests: 'Tests',
  reviews: 'Reviews',
  settings: 'Settings',
};

const VIEW_KEYWORDS: Record<ViewId, string> = {
  dashboard: 'overview summary metrics home',
  files: 'tree folder file explorer code',
  graph: 'git history commits branches log',
  changes: 'diff staging uncommitted status stage commit',
  actions: 'ci workflow runs jobs pipelines github',
  tests: 'suites runner unit e2e pass fail',
  reviews: 'prs pull requests review comments',
  settings: 'preferences config theme options',
};

export function createCommandSource(
  runtime: CommandRuntime,
  onSelect: () => void,
): PaletteSource {
  return {
    key: 'commands',
    items: () => {
      return COMMANDS.map((cmd: CommandDescriptor): PaletteItem => {
        const entry = runtime[cmd.id];
        const chord = chordOf(cmd);
        const icon = COMMAND_ICONS[cmd.id];

        return {
          id: `command:${cmd.id}`,
          label: cmd.label,
          group: 'Commands',
          icon,
          chord,
          disabled: !entry?.enabled,
          disabledReason: entry?.disabledReason,
          run: () => {
            if (!entry?.enabled) return;
            onSelect();
            entry.run();
          },
        };
      });
    },
  };
}

export function createViewsSource(onSelect: () => void): PaletteSource {
  return {
    key: 'views',
    items: () => {
      const viewItems: PaletteItem[] = VIEW_IDS.map((viewId): PaletteItem => ({
        id: `view:${viewId}`,
        label: VIEW_LABELS[viewId],
        group: 'Views',
        icon: VIEW_ICON[viewId],
        keywords: VIEW_KEYWORDS[viewId],
        run: () => {
          onSelect();
          useUiStore.getState().setActiveView(viewId);
        },
      }));

      const settingsItems: PaletteItem[] = SETTINGS_PAGES.map((page): PaletteItem => ({
        id: `settings:${page.id}`,
        label: `Settings: ${page.label}`,
        group: 'Settings',
        icon: SETTINGS_PAGE_ICON[page.id],
        keywords: `preferences config ${page.label}`,
        run: () => {
          onSelect();
          useUiStore.getState().setActiveView('settings');
          useUiStore.getState().setSettingsPage(page.id);
        },
      }));

      return [...viewItems, ...settingsItems];
    },
  };
}

export function createReposSource(
  repos: RepoDescriptor[],
  worktrees: Worktree[],
  activeRepoId: string | null,
  onSelect: () => void,
): PaletteSource {
  return {
    key: 'repos',
    items: () => {
      const repoItems: PaletteItem[] = repos.map((repo): PaletteItem => ({
        id: `repo:${repo.id}`,
        label: repo.name,
        group: 'Repositories',
        icon: LuFolder,
        detail: repo.path,
        run: () => {
          onSelect();
          useUiStore.getState().selectRepo(repo.id);
        },
      }));

      const worktreeItems: PaletteItem[] = worktrees.map((wt): PaletteItem => ({
        id: `worktree:${wt.path}`,
        label: wt.branch ?? wt.path,
        group: 'Worktrees',
        icon: LuGitBranch,
        detail: wt.path,
        run: () => {
          onSelect();
          useUiStore.getState().selectWorktree(wt.path);
        },
      }));

      return [...repoItems, ...worktreeItems];
    },
  };
}

export function createTerminalSource(
  sessions: TerminalSession[],
  agents: AgentDefinition[],
  activeRepo: RepoDescriptor | null,
  onSelect: () => void,
): PaletteSource {
  return {
    key: 'sessions',
    items: () => {
      // 1. Switch to existing terminal sessions
      const sessionItems: PaletteItem[] = sessions.map((sess): PaletteItem => {
        let icon: IconComponent = LuSquareTerminal;
        if (sess.kind === 'agent' && sess.agentId) {
          icon = resolveAgentIcon({ id: sess.agentId });
        }

        return {
          id: `session:${sess.id}`,
          label: sess.title || (sess.kind === 'agent' ? 'Agent Session' : 'Terminal'),
          group: 'Terminal Sessions',
          icon,
          detail: sess.cwd,
          run: () => {
            onSelect();
            useUiStore.getState().setTerminalOpen(true);
            useTerminalStore.getState().setActive(sess.id);
          },
        };
      });

      // 2. Start new agent sessions
      const agentItems: PaletteItem[] = agents.map((agent): PaletteItem => {
        const Icon = resolveAgentIcon(agent);
        return {
          id: `agent:${agent.id}`,
          label: `Start ${agent.label}`,
          group: 'Agents',
          icon: Icon,
          run: () => {
            onSelect();
            const cwd = activeRepo?.path ?? '';
            const repoId = activeRepo?.id ?? '';
            startAgent({
              repoId,
              cwd,
              title: agent.label,
              prompt: '',
              agentId: agent.id,
              command: agent.command,
            });
          },
        };
      });

      return [...sessionItems, ...agentItems];
    },
  };
}
