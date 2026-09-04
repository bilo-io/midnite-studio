import { useEffect, useRef } from 'react';
import { LuClapperboard, LuOctagonAlert, LuPlay, LuSquare, LuTriangleAlert } from 'react-icons/lu';

import { useBrowserBounds } from '../browser/use-browser-bounds';
import { EmptyState } from '../../components/empty-state';
import { Spinner } from '../../components/skeleton';
import { bridge } from '../../services/bridge';
import { useStartVideoStudio, useStopVideoStudio, useVideoStudioStatus, useVideoToolchain } from './use-video';

/** Keyed by project id — one `WebContentsView` per hosted studio, never reused across projects. */
function studioTabId(projectId: string): string {
  return `video-studio-${projectId}`;
}

/**
 * The centre pane (Phase 44 Theme D) — five rendered states: no toolchain, a
 * Start button, a starting spinner, the hosted studio, and a failure with its
 * stderr. `remotion studio` is a localhost dev server, hosted in a
 * `WebContentsView` exactly the way the browser pane hosts a tab — see the
 * phase doc's own settled decision against a second, hand-rolled timeline.
 */
export function VideoStudioPane({ projectId }: { projectId: string | null }) {
  const toolchain = useVideoToolchain(projectId);
  const status = useVideoStudioStatus(projectId);
  const start = useStartVideoStudio();
  const stop = useStopVideoStudio();

  const running = status.data.state === 'running';
  const tabId = projectId && running ? studioTabId(projectId) : null;
  const { ref, sync } = useBrowserBounds(tabId, running);

  // Creates the `WebContentsView` the instant a URL is known, and tears it
  // down on project switch / unmount — `browser-pane.tsx`'s own lifecycle,
  // scoped to this one tab id rather than the multi-tab browser store.
  const createdForUrl = useRef<string | null>(null);
  useEffect(() => {
    if (status.data.state !== 'running' || !projectId) {
      createdForUrl.current = null;
      return;
    }
    const url = status.data.url;
    if (createdForUrl.current === url) return;
    createdForUrl.current = url;
    void bridge()
      ?.browser.create({ tabId: studioTabId(projectId), url })
      .then(() => sync());
  }, [status.data, projectId, sync]);

  useEffect(() => {
    if (!projectId) return undefined;
    const id = studioTabId(projectId);
    return () => {
      bridge()?.browser.close({ tabId: id });
    };
  }, [projectId]);

  if (!projectId) {
    return <EmptyState icon={LuClapperboard} title="Select a project" body="Pick one on the left." />;
  }

  const node = toolchain.data?.node;
  const npx = toolchain.data?.npx;
  if ((node && !node.found) || (npx && !npx.found)) {
    return (
      <EmptyState
        icon={LuTriangleAlert}
        title="node/npx not found"
        body={node && !node.found ? node.reason : npx && !npx.found ? npx.reason : undefined}
      />
    );
  }

  switch (status.data.state) {
    case 'stopped':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">The studio isn't running.</p>
          <button
            type="button"
            onClick={() => start.mutate(projectId)}
            disabled={start.isPending}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <LuPlay aria-hidden className="h-4 w-4" />
            Start studio
          </button>
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
          <div ref={ref} className="min-h-0 flex-1" />
          <div className="absolute right-2 top-2">
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
          {status.data.stderr.length > 0 ? (
            <pre className="max-h-32 max-w-md overflow-auto rounded bg-card p-2 text-left text-[11px] text-muted-foreground">
              {status.data.stderr.join('\n')}
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
