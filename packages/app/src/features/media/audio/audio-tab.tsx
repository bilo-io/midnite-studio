import { AUDIO_MP3_BITRATES, MEDIA_TAB_EXPORT_FORMATS, type MediaExportFormat } from '@midnite/studio-shared';
import { useEffect, useMemo, useReducer, useState } from 'react';

import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { MediaLayout } from '../media-layout';
import { NoRepoMediaState } from '../repo-media-tab';
import { useMediaExport, useMediaProjects } from '../use-media';
import { AudioProjects } from './audio-projects';
import { BottomPlayer } from './bottom-player';
import { usePlayer } from './player-store';
import { PromptForm } from './prompt-form';
import { initialPromptForm, promptFormReducer, toPrompt } from './prompt-form-state';
import { SessionList } from './session-list';
import { useAudioImport, useAudioPrefs, useAudioProviders, useAudioSessions } from './use-audio';

/** Where an Import lands when the repo has no audio project yet. */
export const DEFAULT_AUDIO_PROJECT = 'imports';

/**
 * Media ▸ Audio (Phase 99 Theme E): projects on the left, the project's
 * session history in the centre with the bottom player docked under it, and
 * the Suno-style prompt form on the right. Files live under
 * `.midnite/media/audio/<project>/` beside a `project.json` history and a
 * `<name>.json` sidecar per variant.
 */
export function AudioTab() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  if (!repoId) return <NoRepoMediaState tab="audio" />;
  return <AudioTabBody repoId={repoId} />;
}

/** Space toggles play while focus is outside anything that takes typing or its own Space. */
export function isSpaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable) return false;
  return !target.closest('input, textarea, select, button, [role="slider"], [role="textbox"], [contenteditable="true"]');
}

function AudioTabBody({ repoId }: { repoId: string }) {
  const prefs = useAudioPrefs();
  const [form, dispatch] = useReducer(promptFormReducer, undefined, () =>
    initialPromptForm({ provider: prefs.provider, durationS: prefs.durationS, count: prefs.count }),
  );
  const [project, setProject] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bitrate, setBitrate] = useState(prefs.mp3BitrateKbps);

  const projects = useMediaProjects(repoId, 'audio');
  const activeProject =
    project && projects.data?.some((p) => p.name === project) ? project : (projects.data?.[0]?.name ?? null);
  const sessions = useAudioSessions(repoId, activeProject);
  const providers = useAudioProviders();
  const importer = useAudioImport(repoId);
  const exporter = useMediaExport();
  const hasTrack = usePlayer((s) => s.pos >= 0);

  const variants = useMemo(() => (sessions.data ?? []).flatMap((s) => s.variants), [sessions.data]);
  const selected = variants.find((v) => v.key === selectedKey) ?? null;

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

  const onImport = () => {
    const checked = toPrompt(form);
    if ('error' in checked) return;
    const target = activeProject ?? DEFAULT_AUDIO_PROJECT;
    importer.start.mutate(
      { project: target, prompt: checked.prompt },
      { onSuccess: (result) => result.ok && setProject(target) },
    );
  };

  const onExport = (format: MediaExportFormat) => {
    if (!selected) return;
    exporter.start.mutate({
      source: { kind: 'media', repoId, tab: 'audio', project: selected.project, path: selected.path },
      format,
      options: format === 'mp3' ? { bitrateKbps: bitrate } : {},
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <MediaLayout
          tab="audio"
          detailLabel="Resize prompt panel"
          toolbar={
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                MP3 bitrate
                <select
                  aria-label="MP3 bitrate"
                  value={bitrate}
                  onChange={(event) => setBitrate(Number(event.target.value))}
                  className="h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground"
                >
                  {AUDIO_MP3_BITRATES.map((kbps) => (
                    <option key={kbps} value={kbps}>
                      {kbps} kbps
                    </option>
                  ))}
                </select>
              </label>
              <ExportToolbar
                formats={MEDIA_TAB_EXPORT_FORMATS.audio}
                hasSelection={selected !== null}
                onExport={onExport}
                busy={exporter.progress?.status === 'running'}
              />
            </>
          }
          explorer={
            <AudioProjects
              repoId={repoId}
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
            <SessionList
              repoId={repoId}
              sessions={sessions.data ?? []}
              loading={sessions.isPending && activeProject !== null}
              selectedKey={selectedKey}
              onSelect={(variant) => setSelectedKey(variant.key)}
            />
          }
          detail={
            <PromptForm
              state={form}
              dispatch={dispatch}
              statuses={providers.data ?? []}
              importing={importer.start.isPending}
              error={importer.lastError}
              onImport={onImport}
            />
          }
        />
      </div>
      {hasTrack ? <BottomPlayer /> : null}
    </div>
  );
}
