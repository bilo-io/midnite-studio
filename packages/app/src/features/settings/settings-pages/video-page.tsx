import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuFolderOpen, LuX } from 'react-icons/lu';

import { bridge } from '../../../services/bridge';

const VIDEO_ROOT_KEY = ['video-root'] as const;

/**
 * The one setting Video Studio has (Phase 44 Theme H) — the directory that
 * holds `video-editor/` (the single Remotion app) and `projects/` (one
 * folder per video), e.g. `~/Dev/ekko-videos`. Uses the same native picker
 * `useOpenRepo` does (`repos.pickDirectory`), not a text field: a video root
 * is a real directory, and typing one by hand is the mistake this page
 * exists to prevent.
 */
export function VideoSettingsPage() {
  const client = useQueryClient();
  const root = useQuery({
    queryKey: VIDEO_ROOT_KEY,
    queryFn: async () => (await bridge()?.video.root.get())?.root ?? null,
  });

  const setRoot = useMutation({
    mutationFn: async (next: string | null) => (await bridge()?.video.root.set({ root: next }))?.root ?? null,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: VIDEO_ROOT_KEY });
      void client.invalidateQueries({ queryKey: ['video-projects'] });
    },
  });

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
          The directory that holds `video-editor/` (the Remotion app) and `projects/` (one folder
          per video) — see `~/Dev/ekko-videos` for the reference layout.
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
    </div>
  );
}
