import {
  GAMES_OLLAMA_WARNING,
  type GameEngine,
  type GameNetwork,
} from '@midnite/studio-shared';
import { LuFolderOpen, LuRotateCcw, LuTriangleAlert } from 'react-icons/lu';

import { SelectField } from '../../../components/form/select-field';
import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { bridge } from '../../../services/bridge';
import { useGamesSettings, useSetGamesSettings } from '../../media/game/use-games';

const ENGINES: readonly { value: GameEngine; label: string }[] = [
  { value: 'phaser', label: 'Phaser' },
  { value: 'three', label: 'three.js' },
];

const NETWORKS: readonly { value: GameNetwork; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
];

/**
 * Settings ▸ Media ▸ Games (Phase 107 Theme A): where game repos live
 * (default `~/Midnite Games`, created when the first game is), the default
 * engine and network policy for new games, and whether an agent run's commits
 * are squashed. Validation happens in main; its message is shown verbatim.
 */
export function GamesRootSection() {
  const read = useGamesSettings();
  const set = useSetGamesSettings();
  const settings = read.data?.settings;
  if (!settings) return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;

  const choose = async () => {
    const path = await bridge()?.repos.pickDirectory();
    if (path) set.mutate({ gamesRoot: path });
  };

  return (
    <div className="flex flex-col gap-4 p-3" data-testid="games-settings">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Games location</p>
        <p className="text-[11px] text-muted-foreground">
          Each game is its own git repository, created in a folder here. The folder is created when you make your
          first game, and must be outside any other repository.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="flex-1 truncate font-mono text-foreground" data-testid="games-root-path">
            {read.data?.resolvedRoot}
          </span>
          {settings.gamesRoot === null ? <span className="text-[10px] text-muted-foreground">default</span> : null}
        </div>
        {read.data?.rootProblem ? (
          <p role="alert" className="flex items-start gap-1.5 text-[11px] text-amber-500">
            <LuTriangleAlert aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
            {read.data.rootProblem}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void choose()}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent"
          >
            <LuFolderOpen aria-hidden className="h-3.5 w-3.5" />
            Choose…
          </button>
          <button
            type="button"
            disabled={settings.gamesRoot === null}
            onClick={() => set.mutate({ gamesRoot: null })}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent disabled:opacity-50"
          >
            <LuRotateCcw aria-hidden className="h-3.5 w-3.5" />
            Reset to default
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Default engine</p>
        <SelectField<GameEngine>
          label="Default engine"
          value={settings.defaultEngine}
          onChange={(defaultEngine) => set.mutate({ defaultEngine })}
          options={ENGINES}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Network</p>
        <p className="text-[11px] text-muted-foreground">Games can&apos;t reach the internet unless you allow it per game.</p>
        <SelectField<GameNetwork>
          label="Default network"
          value={settings.defaultNetwork}
          onChange={(defaultNetwork) => set.mutate({ defaultNetwork })}
          options={NETWORKS}
        />
      </div>

      <SettingsSwitchRow
        id="games-squash-run-commits"
        label="Squash each run into one commit"
        description="An agent run that makes several passes lands as a single commit instead of one per pass."
        on={settings.squashRunCommits}
        onToggle={() => set.mutate({ squashRunCommits: !settings.squashRunCommits })}
      />

      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">Ollama</p>
        <p className="text-[11px] text-muted-foreground" data-testid="games-ollama-warning">
          {GAMES_OLLAMA_WARNING}
        </p>
      </div>
    </div>
  );
}
