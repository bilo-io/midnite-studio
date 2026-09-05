import {
  LuCommand,
  LuFile,
  LuFolderGit2,
  LuGitBranch,
  LuGitFork,
  LuSearch,
  LuTerminal,
} from 'react-icons/lu';

import { BrandMark, Wordmark } from '../../components/brand';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import { usePalette } from '../../components/palette-host';
import { chordFor, displayChord } from '../status-bar/chord-hint';
import { usePickAndOpenRepo } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

export type ShortcutItem = {
  id: string;
  label: string;
  chord: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  onClick?: () => void;
};

export function EmptyWorkspace() {
  const palette = usePalette();
  const { pickAndOpen, isPending } = usePickAndOpenRepo();

  const shortcuts: ShortcutItem[] = [
    {
      id: 'palette',
      label: 'Command Palette',
      chord: displayChord(chordFor('palette.open', 'Mod+k')),
      icon: LuCommand,
      onClick: () => palette.open(),
    },
    {
      id: 'files',
      label: 'Go to File',
      chord: displayChord(chordFor('palette.files', 'Mod+p')),
      icon: LuFile,
      onClick: () => palette.open('files'),
    },
    {
      id: 'open-repo',
      label: 'Open Repository',
      chord: displayChord(chordFor('repo.open', 'Mod+o')),
      icon: LuFolderGit2,
      onClick: () => void pickAndOpen(),
    },
    {
      id: 'toggle-terminal',
      label: 'Toggle Terminal',
      chord: displayChord(chordFor('terminal.toggle', 'Ctrl+`')),
      icon: LuTerminal,
      onClick: () => useUiStore.getState().toggleTerminal(),
    },
    {
      id: 'toggle-browser',
      label: 'Toggle Browser',
      chord: displayChord(chordFor('browser.toggle', 'Mod+b')),
      icon: MidniteIcon,
      onClick: () => useUiStore.getState().toggleBrowser(),
    },
    {
      id: 'search',
      label: 'Search Everywhere',
      chord: displayChord(chordFor('search.open', 'Mod+Shift+f')),
      icon: LuSearch,
      onClick: () => useUiStore.getState().setActiveView('search'),
    },
    {
      id: 'graph',
      label: 'Git Graph',
      chord: displayChord(chordFor('view.graph', 'Mod+Shift+g')),
      icon: LuGitFork,
      onClick: () => useUiStore.getState().setActiveView('graph'),
    },
    {
      id: 'toggle-repos',
      label: 'Toggle Repos Panel',
      chord: displayChord(chordFor('repos.toggle', 'Mod+g')),
      icon: LuGitBranch,
      onClick: () => useUiStore.getState().toggleRepos(),
    },
  ];

  return (
    <div
      data-testid="empty-workspace"
      className="flex h-full w-full flex-col items-center justify-center p-6 bg-background text-foreground overflow-y-auto animate-fade-in"
    >
      <div className="flex flex-col items-center gap-3 mb-8">
        <BrandMark className="h-16 w-16" />
        <Wordmark className="text-xl" />
        <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">
          A desktop workspace for the whole loop around your repository.
        </p>
      </div>

      <div className="w-full max-w-lg rounded-xl border border-border/70 bg-card/40 p-5 shadow-sm backdrop-blur-xs">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
          Primary Commands & Shortcuts
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {shortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <button
                key={shortcut.id}
                type="button"
                onClick={shortcut.onClick}
                className="group flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs transition-all hover:border-border hover:bg-accent/40 hover:text-foreground text-muted-foreground cursor-pointer text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary/80 group-hover:text-primary transition-colors" />
                  <span className="truncate font-medium text-foreground/90 group-hover:text-foreground">
                    {shortcut.label}
                  </span>
                </div>
                <kbd className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/50 group-hover:bg-muted group-hover:text-foreground shrink-0">
                  {shortcut.chord}
                </kbd>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => void pickAndOpen()}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
        >
          <LuFolderGit2 className="h-3.5 w-3.5" />
          <span>Open a repository…</span>
        </button>
      </div>
    </div>
  );
}
