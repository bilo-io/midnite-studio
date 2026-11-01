import { MEDIA_TAB_EXPORT_FORMATS, type MediaExportFormat } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';
import { LuMusic, LuPause, LuPlay, LuRotateCcw } from 'react-icons/lu';

import { EmptyState, useMediaKit } from '@midnite/studio-frame';

import { AudioProjects } from '../audio-projects';
import { BottomPlayer } from '../bottom-player';
import { isSpaceTarget } from '../audio-tab';
import { currentTrack, usePlayer, type PlayerTrack } from '../player-store';
import { formatSeconds } from './format';
import { initialSfxForm, sfxFormFromSidecar, type SfxFormState } from './sfx-form-state';
import { SfxPanel } from './sfx-panel';
import { useSfxTakes, type SfxTakeView } from './use-sfx';

/** Where a generation lands when the repo has no SFX project yet. */
export const DEFAULT_SFX_PROJECT = 'sounds';

const takeTitle = (take: SfxTakeView) => take.sidecar?.prompt || take.path.replace(/\.[^.]+$/, '');
const toTrack = (take: SfxTakeView): PlayerTrack => ({ key: take.key, title: takeTitle(take), url: take.url, project: take.project, path: take.path });

/**
 * Media ▸ SFX: local sound effects from Stable Audio Open Small. Projects on the left (the Audio tab's explorer
 * over `.midnite/media/sfx/`), the project's takes in the centre — newest first, each with its prompt and the
 * settings that made it — and the install + prompt form on the right. Takes play through Audio's bottom player.
 */
export function SfxTab() {
  const { useMediaRepoId, NoRepoMediaState } = useMediaKit();
  const repoId = useMediaRepoId();
  if (!repoId) return <NoRepoMediaState tab="sfx" />;
  return <SfxTabBody repoId={repoId} />;
}

function SfxTabBody({ repoId }: { repoId: string }) {
  const { MediaLayout, ExportToolbar, useMediaExport, useMediaProjects } = useMediaKit();
  const [project, setProject] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [form, setForm] = useState<SfxFormState>(initialSfxForm);
  const projects = useMediaProjects(repoId, 'sfx');
  const activeProject = project && projects.data?.some((p) => p.name === project) ? project : (projects.data?.[0]?.name ?? null);
  const takes = useSfxTakes(repoId, activeProject);
  const exporter = useMediaExport();
  const hasTrack = usePlayer((s) => s.pos >= 0);
  const selected = (takes.data ?? []).find((t) => t.key === selectedKey) ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey || !isSpaceTarget(event.target)) return;
      if (usePlayer.getState().pos < 0) return;
      event.preventDefault();
      usePlayer.getState().toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onExport = (format: MediaExportFormat) => {
    if (!selected) return;
    exporter.start.mutate({ source: { kind: 'media', repoId, tab: 'sfx', project: selected.project, path: selected.path }, format, options: {} });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <MediaLayout
          tab="sfx"
          detailLabel="Resize prompt panel"
          toolbar={
            <ExportToolbar formats={MEDIA_TAB_EXPORT_FORMATS.sfx} hasSelection={selected !== null} onExport={onExport} busy={exporter.progress?.status === 'running'} />
          }
          explorer={
            <AudioProjects
              repoId={repoId}
              tab="sfx"
              activeProject={activeProject}
              selectedPath={selected?.path ?? null}
              onSelectProject={(name) => {
                setProject(name);
                setSelectedKey(null);
              }}
              onSelectVariant={(name, path) => {
                setProject(name);
                setSelectedKey(`${name}/${path}`);
              }}
            />
          }
          content={
            <TakeList
              takes={takes.data ?? []}
              loading={takes.isPending && activeProject !== null}
              selectedKey={selectedKey}
              onSelect={(take) => setSelectedKey(take.key)}
              onReuse={(take) => take.sidecar && setForm(sfxFormFromSidecar(take.sidecar))}
            />
          }
          detail={
            <SfxPanel
              repoId={repoId}
              project={activeProject ?? DEFAULT_SFX_PROJECT}
              form={form}
              setForm={setForm}
              onGenerated={(target, files) => {
                setProject(target);
                if (files[0]) setSelectedKey(`${target}/${files[0]}`);
              }}
            />
          }
        />
      </div>
      {hasTrack ? <BottomPlayer /> : null}
    </div>
  );
}

/** The project's takes, newest first; a play queues every take in the order shown. */
export function TakeList({
  takes,
  loading,
  selectedKey,
  onSelect,
  onReuse,
}: {
  takes: readonly SfxTakeView[];
  loading: boolean;
  selectedKey: string | null;
  onSelect: (take: SfxTakeView) => void;
  onReuse: (take: SfxTakeView) => void;
}) {
  const playingKey = usePlayer((s) => (s.playing ? (currentTrack(s)?.key ?? null) : null));
  if (takes.length === 0) {
    return (
      <EmptyState
        icon={LuMusic}
        title={loading ? 'Loading…' : 'No sounds yet'}
        body={loading ? '' : 'Describe a sound on the right — “laser zap”, “footsteps on gravel”, “wooden door creak” — and generate it.'}
      />
    );
  }
  const queue = takes.map(toTrack);
  return (
    <ul className="hide-scrollbar flex h-full min-h-0 flex-col gap-1.5 overflow-auto p-3" aria-label="Sound effects" data-testid="sfx-takes">
      {takes.map((take) => {
        const playing = playingKey === take.key;
        const s = take.sidecar;
        return (
          <li
            key={take.key}
            data-testid="sfx-take"
            aria-current={take.key === selectedKey || undefined}
            className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-2 py-1.5 aria-[current]:border-primary/60 aria-[current]:bg-primary/5"
          >
            <button
              type="button"
              aria-label={playing ? `Pause ${takeTitle(take)}` : `Play ${takeTitle(take)}`}
              onClick={() => {
                onSelect(take);
                if (playing) usePlayer.getState().toggle();
                else usePlayer.getState().playQueue(queue, take.key);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {playing ? <LuPause aria-hidden className="h-3.5 w-3.5" /> : <LuPlay aria-hidden className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => onSelect(take)} className="flex min-w-0 flex-1 flex-col items-start text-left">
              <span className="w-full truncate text-xs text-foreground">{takeTitle(take)}</span>
              <span className="flex w-full flex-wrap gap-1 text-[10px] tabular-nums text-muted-foreground">
                {s ? (
                  <>
                    <span>{formatSeconds(s.seconds)}</span>
                    <span>· seed {s.seed}</span>
                    <span>· {s.steps} steps</span>
                    {s.cfgScale > 1 ? <span>· CFG {s.cfgScale}</span> : null}
                    {s.negativePrompt ? <span className="truncate">· not “{s.negativePrompt}”</span> : null}
                  </>
                ) : (
                  <span className="truncate">{take.path}</span>
                )}
              </span>
            </button>
            {s ? (
              <button
                type="button"
                aria-label={`Reuse the settings of ${takeTitle(take)}`}
                title="Reuse this prompt and its settings, seed included"
                onClick={() => onReuse(take)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <LuRotateCcw aria-hidden className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
