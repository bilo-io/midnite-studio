import {
  AUDIO_MP3_BITRATES,
  MEDIA_TAB_EXPORT_FORMATS,
  type MediaExportFormat,
  type MusicSendToGeneratorResult,
} from '@midnite/studio-shared';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect, useMemo, useReducer, useState } from 'react';

import { useMediaKit } from '@midnite/studio-frame';

import { AudioProjects } from './audio-projects';
import { AudioSubTabs, type AudioMode } from './audio-sub-tabs';
import { BasicPromptForm } from './basic-prompt-form';
import { BottomPlayer } from './bottom-player';
import { useAudioHost } from './host';
import { usePlayer } from './player-store';
import { initialPromptForm, promptFormReducer, toPrompt } from './prompt-form-state';
import { SessionList } from './session-list';
import {
  useAudioEngine,
  useAudioImport,
  useAudioPrefs,
  useAudioProviders,
  useAudioSessions,
} from './use-audio';

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
  const { useMediaRepoId, NoRepoMediaState } = useMediaKit();
  const repoId = useMediaRepoId();
  if (!repoId) return <NoRepoMediaState tab="audio" />;
  return <AudioTabBody repoId={repoId} />;
}

/** Space toggles play while focus is outside anything that takes typing or its own Space. */
export function isSpaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable) return false;
  return !target.closest(
    'input, textarea, select, button, [role="slider"], [role="textbox"], [contenteditable="true"]',
  );
}

/** The sub-tab when the app does not remember one: Generator, held in memory. */
function useLocalAudioMode(): readonly [AudioMode, (mode: AudioMode) => void] {
  return useState<AudioMode>('generator');
}

function AudioTabBody({ repoId }: { repoId: string }) {
  const kit = useMediaKit();
  const { MediaLayout, ExportToolbar, keys, useMediaExport, useMediaProjects } = kit;
  const openMediaPane = kit.useOpenMediaPane();
  const host = useAudioHost();
  const PromptForm = host.PromptForm ?? BasicPromptForm;
  const editor = host.Editor;
  const prefs = useAudioPrefs();
  const [form, dispatch] = useReducer(promptFormReducer, undefined, () =>
    initialPromptForm({ provider: prefs.provider, durationS: prefs.durationS, count: prefs.count }),
  );
  const [project, setProject] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bitrate, setBitrate] = useState(prefs.mp3BitrateKbps);
  const [savedMode, setAudioMode] = (host.useAudioMode ?? useLocalAudioMode)(repoId);
  // Without an editor from the host there is only the Generator.
  const mode: AudioMode = editor ? savedMode : 'generator';
  const [requestedSong, setRequestedSong] = useState<{ name: string; seq: number } | null>(null);

  // An agent's `music_open` brings the Editor up on that song (Phase 101 Theme H). Heard by the app
  // shell (`useMediaOpenListeners`) now, so it works from any view, and handed over as a request;
  // a reveal of an audio project or song arrives the same way (Phase 112 Theme E).
  const openRequest = kit.useMediaOpenFor('audio', repoId);
  const { clearMediaOpenRequest } = kit;
  useEffect(() => {
    if (!openRequest) return;
    setProject(openRequest.project);
    if (openRequest.path) {
      if (editor) setAudioMode('editor');
      const name = openRequest.path;
      setRequestedSong((cur) => ({ name, seq: (cur?.seq ?? 0) + 1 }));
    }
    clearMediaOpenRequest();
  }, [openRequest, editor, setAudioMode, clearMediaOpenRequest]);

  const projects = useMediaProjects(repoId, 'audio');
  const activeProject =
    project && projects.data?.some((p) => p.name === project)
      ? project
      : (projects.data?.[0]?.name ?? null);
  const sessions = useAudioSessions(repoId, activeProject);
  const providers = useAudioProviders();
  const engine = useAudioEngine();
  const importer = useAudioImport(repoId);
  const exporter = useMediaExport();
  const client = useQueryClient();
  const hasTrack = usePlayer((s) => s.pos >= 0);

  const variants = useMemo(() => (sessions.data ?? []).flatMap((s) => s.variants), [sessions.data]);
  const selected = variants.find((v) => v.key === selectedKey) ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== ' ' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !isSpaceTarget(event.target)
      )
        return;
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

  const onGenerate = () => {
    const checked = toPrompt(form);
    if ('error' in checked) return;
    const target = activeProject ?? DEFAULT_AUDIO_PROJECT;
    importer.generate.mutate(
      { project: target, prompt: checked.prompt, provider: form.provider },
      { onSuccess: (result) => result.ok && setProject(target) },
    );
  };

  /** Theme K: the reference landed — show it in Generator with the description already in the prompt form. */
  const onSent = (target: string, result: MusicSendToGeneratorResult) => {
    void client.invalidateQueries({ queryKey: keys.tab(repoId, 'audio') });
    void client.invalidateQueries({ queryKey: keys.projects(repoId, 'audio') });
    setProject(target);
    setSelectedKey(`${target}/${result.file}`);
    dispatch({
      type: 'seed',
      title: result.file.replace(/-reference-.*$/, ''),
      style: result.tags,
      musicPrompt: result.description,
      durationS: form.durationS,
    });
    setAudioMode('generator');
  };

  const onExport = (format: MediaExportFormat) => {
    if (!selected) return;
    exporter.start.mutate({
      source: {
        kind: 'media',
        repoId,
        tab: 'audio',
        project: selected.project,
        path: selected.path,
      },
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
              {editor ? <AudioSubTabs mode={mode} onChange={setAudioMode} /> : null}
              {mode === 'generator' ? (
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
              ) : editor ? (
                <editor.ExportBar
                  repoId={repoId}
                  project={activeProject}
                  defaultBitrate={bitrate}
                  onSent={onSent}
                />
              ) : null}
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
            mode === 'editor' && editor ? (
              <Suspense fallback={null}>
                <editor.Tab repoId={repoId} project={activeProject} requested={requestedSong} />
              </Suspense>
            ) : (
              <SessionList
                repoId={repoId}
                sessions={sessions.data ?? []}
                loading={sessions.isPending && activeProject !== null}
                selectedKey={selectedKey}
                onSelect={(variant) => setSelectedKey(variant.key)}
                onCompose={() => openMediaPane('audio', 'detail')}
              />
            )
          }
          detail={
            mode === 'editor' ? undefined : (
              <PromptForm
                state={form}
                dispatch={dispatch}
                statuses={providers.data ?? []}
                engine={engine.data}
                importing={importer.start.isPending}
                generating={importer.generate.isPending}
                progress={importer.pending}
                error={importer.lastError}
                onImport={onImport}
                onGenerate={onGenerate}
                onCancel={importer.cancel}
              />
            )
          }
        />
      </div>
      {hasTrack ? <BottomPlayer /> : null}
    </div>
  );
}
