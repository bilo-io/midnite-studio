import {
  FFMPEG_INSTALL_COMMAND,
  MEDIA_TAB_EXPORT_FORMATS,
  VIDEO_ENGINE_INFO,
  videoEngineOf,
  type VideoEngine,
  type VideoRootResolution,
  type VideoRootSource,
} from '@midnite/studio-shared';
import { useEffect, useRef, useState } from 'react';
import {
  LuClapperboard,
  LuDownload,
  LuPlus,
  LuFolderGit2,
  LuGlobe,
  LuHardDrive,
  LuPlay,
} from 'react-icons/lu';
import { PiPlusCircleFill } from 'react-icons/pi';

import { EmptyState, EmptyStateButton } from '../../../components/empty-state';
import { Spinner } from '../../../components/skeleton';
import { Tooltip } from '../../../components/tooltip';
import { useUiStore } from '../../../store/ui-store';
import { submitCommand } from '../../terminal/submit-command';
import { useTerminalStore } from '../../terminal/terminal-store';
import { ExportToolbar } from '../export-toolbar';
import { MediaLayout } from '../media-layout';
import { useFfmpegStatus, useMediaExport } from '../use-media';
import { pickInitialProject } from './last-project';
import {
  useSetVideoEngine,
  useStartVideoRender,
  useVideoProject,
  useVideoProjects,
  useVideoRootResolution,
  useVideoSetup,
} from './use-video';
import { VideoDetail } from './video-detail';
import { useNewVideoProjectPrompt, VideoExplorer } from './video-explorer';
import { VideoEnginePicker, VideoEngineSelect } from './video-engine-picker';
import { VideoRenderDialog } from './video-render-dialog';
import { selectionProjectId, type VideoSelection } from './video-selection';
import { VideoStudioPane } from './video-studio-pane';

/** The example project the Setup Video template ships — Studio opens on it. */
export const SETUP_EXAMPLE_PROJECT = 'example/000-hello';

const SOURCE_META: Record<VideoRootSource, { label: string; icon: typeof LuGlobe; hint: string }> =
  {
    repo: {
      label: 'This repo',
      icon: LuFolderGit2,
      hint: 'The open repo has the video workspace layout (an editor app + projects/).',
    },
    'repo-media': {
      label: '.midnite/media/video',
      icon: LuHardDrive,
      hint: "The open repo's own video workspace.",
    },
    global: { label: 'Global root', icon: LuGlobe, hint: 'The video root from Settings ▸ Media.' },
  };

function RootSourceBadge({ resolution }: { resolution: VideoRootResolution }) {
  if (!resolution.source) return null;
  const meta = SOURCE_META[resolution.source];
  const Icon = meta.icon;
  return (
    <Tooltip label={`${meta.hint} ${resolution.root ?? ''}`}>
      <span
        tabIndex={0}
        data-testid="video-root-source"
        data-source={resolution.source}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground"
      >
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {meta.label}
      </span>
    </Tooltip>
  );
}

/**
 * "Setup Video" (Phase 99 Theme D) — shown when no root resolves. Scaffolds
 * `templates/media-video/` into `<repo>/.midnite/media/video/`, then runs the
 * package install **in a visible terminal** and selects the example project.
 */
function VideoSetupState({
  repoId,
  setupTarget,
  onReady,
}: {
  repoId: string | null;
  setupTarget: string | null;
  onReady: (selection: VideoSelection) => void;
}) {
  const setup = useVideoSetup(repoId);
  // Phase 99 Theme H — Remotion stays the default; the choice is recorded in the root's `video.config.json`.
  const [engine, setEngine] = useState<VideoEngine>('remotion');
  const run = () =>
    setup.mutate(engine, {
      onSuccess: (result) => {
        if (!result.ok || !result.value.root || !repoId) return;
        useUiStore.getState().setTerminalOpen(true);
        const session = useTerminalStore.getState().openSession({
          kind: 'shell',
          title: 'Video setup',
          cwd: `${result.value.root}/${VIDEO_ENGINE_INFO[engine].appDir}`,
          repoId,
        });
        useTerminalStore.getState().queueInput(session.id, 'npm install');
        onReady({ kind: 'project', projectId: SETUP_EXAMPLE_PROJECT });
      },
    });

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <LuClapperboard aria-hidden className="h-10 w-10 text-muted-foreground" />
      <h2 className="text-sm font-semibold text-foreground">Set up Video</h2>
      <p className="max-w-sm text-xs text-muted-foreground">
        {repoId
          ? `Scaffold a ${VIDEO_ENGINE_INFO[engine].label} workspace — one editor app, a project template, an example composition and the two editorial-script skills — into ${setupTarget ?? '.midnite/media/video'}. The install runs in a terminal you can watch.`
          : 'Open a repository to set up a video workspace in it, or choose a global video root in Settings ▸ Media.'}
      </p>
      {repoId ? (
        <VideoEnginePicker value={engine} onChange={setEngine} disabled={setup.isPending} />
      ) : null}
      <button
        type="button"
        disabled={!repoId || setup.isPending}
        onClick={run}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {setup.isPending ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <LuPlay aria-hidden className="h-4 w-4" />
        )}
        Setup Video
      </button>
    </div>
  );
}

function VideoToolbar({
  resolution,
  selection,
}: {
  resolution: VideoRootResolution;
  selection: VideoSelection | null;
}) {
  const projectId = selectionProjectId(selection);
  const project = useVideoProject(projectId);
  const composition = project.data?.valid ? project.data.composition : null;
  const startRender = useStartVideoRender();
  const [renderOpen, setRenderOpen] = useState(false);
  const engine = videoEngineOf(resolution);
  const engineSet = useSetVideoEngine('active');
  const repoId = useUiStore((s) => s.selectedRepoId) ?? null;
  // Switching leaves the other engine's app on disk; only a first visit needs an install, in a terminal you can watch.
  const switchEngine = (next: VideoEngine) =>
    engineSet.mutate(next, {
      onSuccess: (result) => {
        if (!result.ok || !result.value.needsInstall || !result.value.appDir || !repoId) return;
        useUiStore.getState().setTerminalOpen(true);
        const session = useTerminalStore
          .getState()
          .openSession({
            kind: 'shell',
            title: `${VIDEO_ENGINE_INFO[next].label} setup`,
            cwd: result.value.appDir,
            repoId,
          });
        useTerminalStore.getState().queueInput(session.id, 'npm install');
      },
    });
  const exporter = useMediaExport();
  const ffmpeg = useFfmpegStatus();
  const iteration = selection?.kind === 'iteration' ? selection : null;

  return (
    <div
      data-testid="video-toolbar"
      className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2"
    >
      <div data-testid="video-toolbar-left" className="flex min-w-0 items-center gap-2">
        <RootSourceBadge resolution={resolution} />
        <Tooltip label={`Engine for this video root — ${VIDEO_ENGINE_INFO[engine].blurb}`}>
          <span className="flex">
            <VideoEngineSelect
              value={engine}
              onChange={switchEngine}
              disabled={engineSet.isPending}
            />
          </span>
        </Tooltip>
        {ffmpeg.data && !ffmpeg.data.found ? (
          <button
            type="button"
            onClick={() => submitCommand(FFMPEG_INSTALL_COMMAND, 'ffmpeg install')}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs hover:bg-accent"
          >
            <LuDownload aria-hidden className="h-3.5 w-3.5" />
            Install ffmpeg
          </button>
        ) : null}
      </div>
      <div data-testid="video-toolbar-centre" className="min-w-0 max-w-[40vw] justify-self-center">
        {project.data?.valid ? (
          <span
            data-testid="video-toolbar-title"
            title={project.data.title}
            className="block truncate text-xs font-semibold text-foreground"
          >
            {project.data.title}
          </span>
        ) : null}
      </div>
      <div
        data-testid="video-toolbar-right"
        className="flex min-w-0 items-center justify-end gap-2"
      >
        {projectId && composition ? (
          <VideoRenderDialog
            open={renderOpen}
            onClose={() => setRenderOpen(false)}
            compositionId={composition}
            engine={engine}
            onRender={(options) =>
              startRender.mutate({ projectId, compositionId: composition, options })
            }
          />
        ) : null}
        <button
          type="button"
          disabled={!projectId || !composition}
          title={!composition ? 'Select a project to render' : undefined}
          onClick={() => setRenderOpen(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LuPlay aria-hidden className="h-3.5 w-3.5" />
          Render…
        </button>
        {/* Transcode: re-encode the selected iteration through the ffmpeg export service — no re-render. */}
        <ExportToolbar
          formats={MEDIA_TAB_EXPORT_FORMATS.video}
          hasSelection={iteration !== null}
          busy={exporter.progress?.status === 'running'}
          onExport={(format) => {
            if (!iteration) return;
            exporter.start.mutate({
              source: { kind: 'video', projectId: iteration.projectId, name: iteration.filename },
              format,
            });
          }}
        />
      </div>
    </div>
  );
}

/**
 * Media ▸ Video (Phase 99 Theme D; Video Studio since Phase 44).
 *
 * - **Root**: resolved per active repo — in-repo midnite-videos layout, then
 *   `<repo>/.midnite/media/video/`, then the global root — and shown in the
 *   toolbar. None → Setup Video.
 * - **Explorer**: Assets + Projects accordions (projects down to iterations).
 * - **Engine** (Theme H): Remotion or HyperFrames, per root — picked at Setup,
 *   switchable from the toolbar, recorded in the root's `video.config.json`.
 * - **Content**: the embedded engine Studio (Remotion deep-links the selected
 *   project's composition; HyperFrames serves one project per studio). It follows the last selected project, so picking
 *   an asset keeps the Studio where it was.
 * - **Detail**: whatever is selected.
 */
export function VideoTab() {
  const repoId = useUiStore((s) => s.selectedRepoId) ?? null;
  const resolution = useVideoRootResolution(repoId);
  const [selection, setSelection] = useState<VideoSelection | null>(null);
  const [studioProjectId, setStudioProjectId] = useState<string | null>(null);
  const studioProject = useVideoProject(studioProjectId);
  const root = resolution.data?.root ?? null;

  useEffect(() => {
    setSelection(null);
    setStudioProjectId(null);
  }, [root]);

  const projects = useVideoProjects();
  const lastProject = useUiStore((s) => (repoId ? s.mediaLastVideoProject[repoId] : undefined));

  const select = (next: VideoSelection | null) => {
    setSelection(next);
    const projectId = selectionProjectId(next);
    if (projectId) {
      setStudioProjectId(projectId);
      if (repoId) useUiStore.getState().setMediaLastVideoProject(repoId, projectId);
    }
  };

  // Reselect this repo's last project on entry — once per root, and only
  // while nothing has been picked yet.
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!root || !projects.data || restoredFor.current === root) return;
    restoredFor.current = root;
    const id = pickInitialProject(
      projects.data.map((p) => p.id),
      lastProject,
    );
    if (id) {
      setSelection((current) => current ?? { kind: 'project', projectId: id });
      setStudioProjectId((current) => current ?? id);
    }
  }, [root, projects.data, lastProject]);
  const newProject = useNewVideoProjectPrompt(select);

  if (resolution.isPending || !resolution.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (!root) {
    return (
      <VideoSetupState
        repoId={repoId}
        setupTarget={resolution.data.setupTarget}
        onReady={(next) => {
          setSelection(next);
          if (next.kind !== 'asset') setStudioProjectId(next.projectId);
        }}
      />
    );
  }

  return (
    <MediaLayout
      tab="video"
      toolbar={<VideoToolbar resolution={resolution.data} selection={selection} />}
      explorer={<VideoExplorer selection={selection} onSelect={select} />}
      content={
        studioProjectId ? (
          <VideoStudioPane
            projectId={studioProjectId}
            compositionId={studioProject.data?.valid ? studioProject.data.composition : null}
          />
        ) : (
          <EmptyState
            icon={LuClapperboard}
            title="Select a project"
            body="Pick one on the left, or start a new video."
            action={
              <EmptyStateButton
                icon={LuPlus}
                filledIcon={PiPlusCircleFill}
                label="New video project"
                onClick={newProject}
              />
            }
          />
        )
      }
      detail={<VideoDetail selection={selection} />}
      explorerLabel="Resize video explorer"
      detailLabel="Resize video detail"
    />
  );
}
