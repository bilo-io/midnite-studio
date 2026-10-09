import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuFolderOpen, LuX } from 'react-icons/lu';

import { VIDEO_ENGINE_INFO } from '@midnite/studio-shared';

import { VideoEnginePicker } from '../../media/video/video-engine-picker';
import { useSetVideoEngine, useVideoEngine } from '../../media/video/use-video';
import { bridge } from '../../../services/bridge';

const VIDEO_ROOT_KEY = ['video-root'] as const;

/**
 * The one setting Video Studio has (Phase 44 Theme H) — the directory that
 * holds the editor app (`video-editor/` for Remotion, `hyperframes-editor/`
 * for HyperFrames) and `projects/` (one
 * folder per video), e.g. `~/Dev/ekko-videos`. Uses the same native picker
 * `useOpenRepo` does (`repos.pickDirectory`), not a text field: a video root
 * is a real directory, and typing one by hand is the mistake this page
 * exists to prevent.
 */
export function VideoRootSection() {
  const client = useQueryClient();
  const root = useQuery({
    queryKey: VIDEO_ROOT_KEY,
    queryFn: async () => (await bridge()?.video.root.get())?.root ?? null,
  });

  const setRoot = useMutation({
    mutationFn: async (next: string | null) =>
      (await bridge()?.video.root.set({ root: next }))?.root ?? null,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: VIDEO_ROOT_KEY });
      void client.invalidateQueries({ queryKey: ['video-projects'] });
    },
  });

  // Phase 99 Theme H — the engine is a property of the root, so the global root's own is set here.
  const engine = useVideoEngine('global');
  const setEngine = useSetVideoEngine('global');

  const choose = async () => {
    const path = await bridge()?.repos.pickDirectory();
    if (!path) return;
    setRoot.mutate(path);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">Video root</p>
        <p className="text-[11px] text-muted-foreground">
          The directory that holds the editor app (`video-editor/` for Remotion,
          `hyperframes-editor/` for HyperFrames) and `projects/` (one folder per video) — see
          `~/Dev/ekko-videos` for the reference layout.
        </p>
      </div>
      {root.data ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="flex-1 truncate font-mono text-foreground">{root.data}</span>
          <button
            type="button"
            onClick={() => setRoot.mutate(null)}
            aria-label="Clear video root"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LuX aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Not configured yet.</p>
      )}
      <button
        type="button"
        onClick={() => void choose()}
        className="flex items-center gap-2 self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent"
      >
        <LuFolderOpen aria-hidden className="h-3.5 w-3.5" />
        {root.data ? 'Change folder…' : 'Choose folder…'}
      </button>
      {root.data && engine.data ? (
        <div className="space-y-1.5" data-testid="video-root-engine">
          <p className="text-xs font-medium text-foreground">Video engine</p>
          <p className="text-[11px] text-muted-foreground">
            What authors and renders this root&apos;s compositions. Switching adds the other
            engine&apos;s editor app (`
            {
              VIDEO_ENGINE_INFO[engine.data.engine === 'remotion' ? 'hyperframes' : 'remotion']
                .appDir
            }
            /`) on first use and keeps your existing one. A root with no `video.config.json` is
            Remotion.
          </p>
          <VideoEnginePicker
            name="settings-video-engine"
            value={engine.data.engine}
            disabled={setEngine.isPending}
            onChange={(next) => setEngine.mutate(next)}
          />
          {engine.data.needsInstall ? (
            <p className="text-[11px] text-muted-foreground">
              Run `npm install` in `{engine.data.appDir}` before using it.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
