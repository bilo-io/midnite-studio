import type {
  AgentDefinition,
  CommandDescriptor,
  Ref,
  RepoDescriptor,
  TerminalSession,
  Worktree,
} from '@midnite/studio-shared';
import { COMMANDS } from '@midnite/studio-shared';
import { LuFile, LuFolder, LuGitBranch, LuGitCommitHorizontal, LuSquareTerminal, LuTag } from 'react-icons/lu';

import { resolveAgentIcon } from '../../components/icons';
import { SETTINGS_PAGE_ICON, VIEW_ICON } from '../../components/nav-icons';
import { COMMAND_ICONS } from '../../features/palette/command-icons';
import { isPaletteSafe } from '../../features/palette/safety';
import { startAgent } from '../../features/terminal/start-agent';
import { useTerminalStore } from '../../features/terminal/terminal-store';
import type { CommandRuntime } from '../../services/keybindings/use-command-handlers';
import { useUiStore, VIEW_IDS, SETTINGS_PAGES, type ViewId } from '../../store/ui-store';
import { chordOf } from '../../store/palette-store';
import { useFilesStore } from '../../features/files/files-store';
import type { PaletteItem, PaletteSource } from './source';
import type { IconComponent } from '../../components/icon-button';

const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: 'Dashboard',
  files: 'Files',
  search: 'Search Everywhere',
  graph: 'Commit Graph',
  changes: 'Changes',
  actions: 'Actions & CI',
  tests: 'Tests',
  reviews: 'Reviews',
  projects: 'Projects',
  history: 'History',
  councils: 'Agent Councils',
  workflows: 'Agent Workflows',
  sessions: 'Agent Sessions',
  settings: 'Settings',
};

const VIEW_KEYWORDS: Record<ViewId, string> = {
  dashboard: 'overview summary metrics home',
  files: 'tree folder file explorer code',
  search: 'search grep find commits messages files',
  graph: 'git history commits branches log',
  changes: 'diff staging uncommitted status stage commit',
  actions: 'ci workflow runs jobs pipelines github',
  tests: 'suites runner unit e2e pass fail',
  reviews: 'prs pull requests review comments',
  projects: 'projectsv2 board kanban table fields issues',
  history: 'reflog journal undo ops history',
  councils: 'agents council teams debate',
  workflows: 'agent workflow pipeline automation',
  sessions: 'agent session history transcripts',
  settings: 'preferences configuration options theme',
};


export function createCommandSource(
  runtime: CommandRuntime,
  onSelect: () => void,
): PaletteSource {
  return {
    key: 'commands',
    items: () => {
      return COMMANDS.filter((cmd) => isPaletteSafe(cmd.id)).map(
        (cmd: CommandDescriptor): PaletteItem => {
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
        },
      );
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

export function createRefsSource(
  refs: Ref[],
  onSelect: () => void,
  onCheckout: (ref: Ref) => void,
  onReveal: (ref: Ref) => void,
): PaletteSource {
  return {
    key: 'refs',
    items: () => {
      const items: PaletteItem[] = [];

      for (const ref of refs) {
        if (ref.kind === 'head') continue;

        let group = 'Local Branches';
        let icon: IconComponent = LuGitBranch;
        if (ref.kind === 'remoteBranch') {
          group = 'Remote Branches';
        } else if (ref.kind === 'tag') {
          group = 'Tags';
          icon = LuTag;
        }

        let detail: string | undefined;
        if (ref.upstream) {
          const parts: string[] = [ref.upstream.name];
          if (ref.upstream.ahead > 0) parts.push(`↑${ref.upstream.ahead}`);
          if (ref.upstream.behind > 0) parts.push(`↓${ref.upstream.behind}`);
          if (ref.upstream.gone) parts.push('[gone]');
          detail = parts.join(' ');
        } else if (ref.worktreePath) {
          detail = `checked out in ${ref.worktreePath}`;
        }

        // Action 1: Check out
        items.push({
          id: `ref:checkout:${ref.fullName}`,
          label: `Checkout: ${ref.name}`,
          group,
          icon,
          detail,
          keywords: `checkout switch branch ${ref.name}`,
          run: () => {
            onSelect();
            onCheckout(ref);
          },
        });

        // Action 2: Reveal in graph
        items.push({
          id: `ref:reveal:${ref.fullName}`,
          label: `Reveal in Graph: ${ref.name}`,
          group,
          icon: LuGitCommitHorizontal,
          detail: `Commit ${ref.sha.slice(0, 7)}`,
          keywords: `reveal find graph commit ${ref.name}`,
          run: () => {
            onSelect();
            onReveal(ref);
          },
        });
      }

      return items;
    },
  };
}

export function createFilesSource(
  files: string[],
  onSelect: () => void,
): PaletteSource {
  return {
    key: 'files',
    items: () => {
      return files.map((relPath): PaletteItem => {
        const lastSlash = relPath.lastIndexOf('/');
        const name = lastSlash >= 0 ? relPath.slice(lastSlash + 1) : relPath;
        const dir = lastSlash >= 0 ? relPath.slice(0, lastSlash) : '';

        return {
          id: `file:${relPath}`,
          label: relPath,
          group: 'Files',
          icon: LuFile,
          detail: dir.length > 0 ? dir : undefined,
          keywords: name,
          run: () => {
            onSelect();
            // Switch to files view
            useUiStore.getState().setActiveView('files');

            // Expand all ancestor directories in files tree
            if (dir.length > 0) {
              const segments = dir.split('/');
              const ancestors: string[] = [];
              let current = '';
              for (const seg of segments) {
                current = current.length > 0 ? `${current}/${seg}` : seg;
                ancestors.push(current);
              }
              useFilesStore.getState().expandDirs(ancestors);
            }

            // Select file in preview pane
            useFilesStore.getState().selectFile(relPath);
          },
        };
      });
    },
  };
}

