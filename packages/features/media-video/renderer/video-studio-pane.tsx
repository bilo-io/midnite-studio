import {
  VIDEO_ENGINE_INFO,
  studioCompositionUrl,
  videoEngineIssues,
  videoEngineOf,
} from '@midnite/studio-shared';
import {
  LuClapperboard,
  LuExternalLink,
  LuOctagonAlert,
  LuPlay,
  LuSquare,
  LuTriangleAlert,
} from 'react-icons/lu';
import { PiPlayFill } from 'react-icons/pi';

import { EmptyState, EmptyStateButton } from '@midnite/studio-frame';

import { useVideoChrome } from './chrome';
import { useVideoHost, type VideoStudioViewProps } from './host';
import {
  useStartVideoStudio,
  useStopVideoStudio,
  useVideoStudioStatus,
  useVideoToolchain,
} from './use-video';

/**
 * Where an app with no embedded browser hosts the running studio: the studio is
 * a localhost dev server, so an iframe on its URL is the whole job. Studio's
 * host replaces this with a `WebContentsView` in its browser pane.
 */
function IframeStudioView({ projectId, url }: VideoStudioViewProps) {
  return (
    <iframe
      key={projectId}
      title="Video studio"
      src={url}
      data-testid="video-studio-frame"
      className="min-h-0 w-full flex-1 border-0 bg-background"
    />
  );
}

/**
 * The centre pane (Phase 44 Theme D) — five rendered states: no toolchain, a
 * Start button, a starting spinner, the hosted studio, and a failure with its
 * stderr. `remotion studio` (or, since Phase 99 Theme H, `hyperframes preview`)
 * is a localhost dev server, hosted by the app's `StudioView` — in Studio a
 * `WebContentsView` exactly the way the browser pane hosts a tab; see the phase
 * doc's own settled decision against a second, hand-rolled timeline. The
 * missing-requirement state is engine-aware: HyperFrames also needs Node 22+
 * and ffmpeg, each with an install hint.
 */
export function VideoStudioPane({
  projectId,
  compositionId = null,
}: {
  projectId: string | null;
  /** Phase 99 Theme D — the Studio opens deep-linked on the selected project's composition. */
  compositionId?: string | null;
}) {
  const host = useVideoHost();
  const { Spinner } = useVideoChrome();
  const StudioView = host.StudioView ?? IframeStudioView;
  const toolchain = useVideoToolchain(projectId);
  const engine = videoEngineOf(toolchain.data);
  const studioLabel = VIDEO_ENGINE_INFO[engine].studioLabel;
  const status = useVideoStudioStatus(projectId);
  const start = useStartVideoStudio();
  const stop = useStopVideoStudio();

  if (!projectId) {
    return (
      <EmptyState icon={LuClapperboard} title="Select a project" body="Pick one on the left." />
    );
  }

  const issues = toolchain.data ? videoEngineIssues(engine, toolchain.data) : [];
  if (issues.length > 0) {
    const nodeMissing = issues.some((issue) => issue.id === 'node' || issue.id === 'npx');
    const fixes = issues.filter((issue) => issue.command);
    return (
      <EmptyState
        icon={LuTriangleAlert}
        title={
          nodeMissing
            ? 'node/npx not found'
            : `${VIDEO_ENGINE_INFO[engine].label} needs a few things`
        }
        body={issues.map((issue) => issue.message).join(' ')}
        action={
          <div className="flex flex-wrap justify-center gap-2" data-testid="video-engine-issues">
            {fixes.map((issue) =>
              host.runInTerminal ? (
                <EmptyStateButton
                  key={issue.id}
                  icon={LuPlay}
                  filledIcon={PiPlayFill}
                  label={`Run ${issue.command}`}
                  onClick={() =>
                    host.runInTerminal?.({
                      title: `${VIDEO_ENGINE_INFO[engine].label} setup`,
                      command: issue.command!,
                    })
                  }
                />
              ) : (
                // No terminal here: say what to run, in the person's own.
                <code key={issue.id} className="rounded bg-card px-2 py-1 text-[11px] text-foreground">
                  {issue.command}
                </code>
              ),
            )}
          </div>
        }
      />
    );
  }

  const currentStatus = status.data;
  switch (currentStatus.state) {
    case 'stopped':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">The studio isn't running.</p>
          <EmptyStateButton
            icon={LuPlay}
            filledIcon={PiPlayFill}
            label="Start studio"
            onClick={() => start.mutate(projectId)}
            disabled={start.isPending}
            busy={start.isPending ? <Spinner className="h-3.5 w-3.5" /> : undefined}
          />
        </div>
      );

    case 'starting':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Spinner className="h-6 w-6" />
          <p className="text-sm text-muted-foreground">Starting the studio…</p>
        </div>
      );

    case 'running':
      return (
        <div className="relative flex h-full w-full flex-col">
          <StudioView projectId={projectId} url={studioCompositionUrl(currentStatus.url, compositionId, engine)} />
          <div className="absolute right-2 top-2 flex items-center gap-1.5">
            {host.openStudioInTab ? (
              <button
                type="button"
                onClick={() => host.openStudioInTab?.(currentStatus.url)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2 py-1 text-[11px] text-foreground shadow-sm hover:bg-accent"
                title={`Open ${studioLabel} in browser pane`}
              >
                <LuExternalLink aria-hidden className="h-3 w-3" />
                Open in tab
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => stop.mutate(projectId)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2 py-1 text-[11px] text-foreground shadow-sm hover:bg-accent"
            >
              <LuSquare aria-hidden className="h-3 w-3" />
              Stop
            </button>
          </div>
        </div>
      );

    case 'failed':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <LuOctagonAlert aria-hidden className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">The studio failed to start</p>
          {currentStatus.stderr.length > 0 ? (
            <pre className="max-h-32 max-w-md overflow-auto rounded bg-card p-2 text-left text-[11px] text-muted-foreground">
              {currentStatus.stderr.join('\n')}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={() => start.mutate(projectId)}
            disabled={start.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      );
  }
}
